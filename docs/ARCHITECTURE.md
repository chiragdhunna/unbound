# Architecture Overview

## Browser-Only Processing and Privacy Boundaries

Unbound runs entirely in the browser. No file data is sent to external servers. All conversion occurs client-side using Web APIs (`FileReader`, `Blob`, `Canvas`, Web Workers) and JavaScript libraries.

**Privacy boundary:**

- Files never leave the user's device unless explicitly copied or downloaded.
- Content Security Policy (CSP) is strictly enforced identically across `index.html`, `_headers`, and `vercel.json`:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'`.
- Zero cross-origin network requests during conversion.
- No analytics, third-party tracking, or external CDNs.
- OCR runtime is completely self-hosted: worker (`/public/ocr/worker.min.js`), core wasm (`/public/ocr/core/tesseract-core-*.wasm.js`), and traineddata (`/public/ocr/lang/eng.traineddata`).
- Only UI settings (never file content or file names) are persisted in `localStorage`.

## Actual Current Flow

1. **Input**: User selects file(s) via drag-and-drop, file picker, or paste.
2. **Detection** (`src/core/detect.ts`):
   - Inspects magic bytes (first 4 KB): `%PDF-`, PK ZIP family (`50 4B 03 04`), OLE2 (`D0 CF 11 E0`), `{\rtf`, PNG, JPEG, GIF, WEBP, BMP.
   - For ZIP files, inspects the central directory (end-of-central-directory record) to differentiate DOCX (`word/`), PPTX (`ppt/`), XLSX (`xl/`), and EPUB.
   - For text without binary signatures, tests UTF-8/UTF-16/Windows-1252 decoding and maps by extension.
3. **Registry** (`src/core/registry.ts`):
   - Dynamically imports the appropriate converter module on demand via lazy `import()`.
   - Heavy dependencies (pdfjs, SheetJS, tesseract.js) remain in lazy chunks and are never in the initial bundle.
4. **Converter**:
   - The converter's `convert` method processes the file bytes with a `ConvertContext` (`signal`, `onProgress`, `requestPassword`, `options`).
   - Returns a `ConvertResult` containing `markdown`, `warnings` array, and `stats`.
5. **Output**:
   - Converted markdown is stored in the job's `rawMarkdown` and `output` fields.
   - React state triggers output rendering, live token/character counting, structure-aware chunking, and clipboard/download handlers.

## Supported Formats (Current Status)

- **Plain Text** (`.txt`): encoding auto-detection (UTF-8, UTF-16, Windows-1252 fallback with warning).
- **Markdown** (`.md`, `.markdown`): pass-through, structure preserved.
- **JSON** (`.json`): pretty-printed 2-space indented inside language-tagged code fence.
- **XML** (`.xml`): pass-through inside syntax-aware code fence.
- **Code** (20+ languages): language-tagged fenced code blocks with backtick run safety.
- **DOCX** (`.docx`): parsed via Mammoth.js into semantic HTML, converted to ATX markdown via Turndown + GFM. Images counted and warned (`IMAGES_OMITTED`).
- **XLSX / XLS / XLSM** (`.xlsx`, `.xls`, `.xlsm`): parsed via vendored SheetJS (`vendor/xlsx-0.20.3.tgz`). Multi-sheet `## Sheet: <name>` sections, GFM tables, ISO dates, merged-cell top-left replication, hidden sheets labelled.
- **CSV / TSV** (`.csv`, `.tsv`): custom RFC-4180 parser preserving exact cell text (leading zeros, quoted spaces, exponent notation), BOM stripping, delimiter sniffing (comma, semicolon, tab).
- **PDF (text-based)** (`.pdf`): parsed via `pdfjs-dist` (6.4.299) with self-hosted Vite-bundled worker.
  - Page heights and text item grouping by coordinate (`layout.ts`).
  - Automatic removal of repeated running headers/footers in the 8% top/bottom band (appearing on ≥ 60% of pages, for ≥ 3 pages).
  - Bare page numbers stripped automatically across any page count.
  - Heading detection via length-weighted median font size (rank-ordered into `#`, `##`, `###`).
  - De-hyphenation across line breaks.
  - Optional page markers (`--- Page N ---`, persisted setting).
  - Large PDF warning (`LARGE_PDF_PAGE_THRESHOLD = 300`) with UI-thread yielding via macrotask (`setTimeout(0)`) between pages.
- **OCR (M6 in progress)**:
  - Architecture: self-hosted `tesseract.js` (7.0.0) with local worker and wasm cores (`lstm`, `simd-lstm`, `relaxedsimd-lstm`).
  - Page decision logic (`src/converters/ocr/decide.ts`): categorizes pages as `'text'` (≥ 25 non-whitespace chars), `'image-only'` (< 25 chars + `hasImageOps`), `'forced'` (`forceOcr: true`), or `'empty'`.
  - Image operator detection (`src/converters/pdf/extract.ts`): scans pdfjs operator list only for candidate pages (< 25 chars).
  - OCR Engine (`src/converters/ocr/engine.ts`): dynamic-imports `tesseract.js` on first use, creates a single worker reused across pages, executes strictly sequentially (a second concurrent call rejects immediately with `OcrFailedError`), supports immediate termination on `AbortSignal` with `CancelledError` and lazy worker recreation on subsequent calls, maps worker creation/recognition rejections to `OcrFailedError`, and forwards Tesseract logger events to drive `{ phase: 'ocr', current, total: 100 }` progress.
  - End-to-end PDF OCR routing and image converter in progress.

## Job Identity, Retry, and Late-Result Rules

- **Job ID**: Unique string (`${name}-${random}-${timestamp}`) assigned at file ingestion.
- **Attempt Identity**: Conversion operations receive a fresh attempt context. An obsolete attempt from a prior run or retry cannot overwrite a newer result.
- **Retry**: Available for jobs in `error` status. Uses the stored `job.file` object, updating the job in place (`status: converting → done | error`).
- **Removal**: Cleans up the job from the active queue and resets associated UI state.
- **Cancellation**: Supported via `AbortSignal`. When aborted, active conversion loops terminate and resources (pdfjs loading task, tesseract worker) are cleaned up.

## Output Projection Pipeline

1. **Active Text**: `activeText = editMode ? draftText : displayText`.
2. **Display Text**: Derived from `sourceMarkdown` via `outputMode` (`markdown` or `plain`).
   - Plain text conversion (`src/core/plain.ts`) uses the Marked AST lexer to walk tokens and output unformatted text without regular expression stripping.
3. **Batch Modes**:
   - `separate`: output reflects the currently selected job.
   - `combined`: output concatenates all completed jobs, each delimited with `# File: <name>`.
4. **Preview Cap**: If output exceeds 200,000 characters, the preview renders the first 200,000 characters with an explicit notice, while Copy and Download operations always access the full output text.
5. **Structure-Aware Chunking** (`src/core/chunk.ts`):
   - Splits content on section headings (`##`), paragraph breaks, and lines.
   - Never splits inside code fences or table rows; repeats table header rows across splits.
   - Computes live token estimates using script-aware heuristics (Latin ≈ 4 chars/token, CJK ≈ 1.2 chars/token).

## Execution Boundary & Resource Safety

- Converters yield to the UI thread between document pages using `await new Promise(r => setTimeout(r, 0))` to prevent UI freezing.
- Memory safety:
  - PDF byte buffers are always cloned (`new Uint8Array(bytes.slice(0))`) before passing to pdfjs so the original buffer remains intact for OCR fallback.
  - Per-page `page.cleanup()` is explicitly called in extraction loops.
  - `loadingTask.destroy()` is executed in `finally` blocks.
