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
- **RTF** (`.rtf`): parsed via zero-dependency client-side streaming tokenizer and parser (`src/converters/rtf.ts`) loaded in a dedicated lazy chunk (`dist/assets/rtf-*.js`). Maintains a group state stack for scoped formatting, decodes Unicode escapes (`\uN?` with `\uc` count skip and signed-to-unsigned conversion) and Windows-1252 hex byte escapes (`\'hh`), maps formatting words (`\b`, `\i`, `\bullet`, `\par`, `\tab`, `\line`), skips non-text destinations (`\fonttbl`, `\colortbl`, `\stylesheet`, `\info`, `\pict`, `\object`, `\*`), handles unclosed formatting groups gracefully, and produces normalized ATX markdown.
- **HTML** (`.html`, `.htm`): parsed via detached inert `DOMParser` (`src/converters/html.ts`) loaded in a dedicated lazy chunk (`dist/assets/html-*.js`). Scripts, styles, and boilerplate elements are never executed or mounted into the live DOM. Extracts article title, byline, and body using `@mozilla/readability@0.6.0` (with `keepClasses: true` for code block languages); falls back to cleaned `<body>` with navigation, header, footer, and sidebar elements stripped; converts to ATX markdown with GFM tables and fenced code blocks via Turndown. Web pages are converted by saving them locally as `.html` files; Unbound makes zero network requests by design.
- **PPTX** (`.pptx`): parsed via `JSZip` and `fast-xml-parser` with `preserveOrder: true` in a dedicated lazy chunk (`dist/assets/pptx-*.js`). Slides are sequenced strictly according to presentation order (`ppt/presentation.xml` `p:sldIdLst` mapped through `ppt/_rels/presentation.xml.rels`, never sorted by filename). Extracts slide headings (`## Slide N`, or `## Slide N (hidden)` for slides with `show="0"`), title placeholders (`### <title>`), nested list items (`a:pPr@lvl` indented with `-`), plain paragraphs (`a:buNone`), GFM tables (`a:tbl` with pipe and newline escaping), speaker notes (`**Notes:**` section, skipping slide-number/image placeholders), and grouped shapes in document order. Emits a single `PPTX_NON_TEXT_OMITTED` warning when non-text elements (images, charts, SmartArt, OLE objects) are encountered. Protected by a 20 MB per-part and 200 MB total zip-bomb guard.
- **XLSX / XLS / XLSM** (`.xlsx`, `.xls`, `.xlsm`): parsed via vendored SheetJS (`vendor/xlsx-0.20.3.tgz`). Multi-sheet `## Sheet: <name>` sections, GFM tables, ISO dates, merged-cell top-left replication, hidden sheets labelled.
- **CSV / TSV** (`.csv`, `.tsv`): custom RFC-4180 parser preserving exact cell text (leading zeros, quoted spaces, exponent notation), BOM stripping, delimiter sniffing (comma, semicolon, tab).
- **PDF (text-based)** (`.pdf`): parsed via `pdfjs-dist` (6.4.299) legacy build (`pdfjs-dist/legacy/build/pdf.mjs`) with self-hosted Vite-bundled worker (`pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`).
  - Page heights and text item grouping by coordinate (`layout.ts`).
  - Automatic removal of repeated running headers/footers in the 8% top/bottom band (appearing on ≥ 60% of pages, for ≥ 3 pages).
  - Bare page numbers stripped automatically across any page count.
  - Heading detection via length-weighted median font size (rank-ordered into `#`, `##`, `###`).
  - De-hyphenation across line breaks.
  - Optional page markers (`--- Page N ---`, persisted setting).
  - Large PDF warning (`LARGE_PDF_PAGE_THRESHOLD = 300`) with UI-thread yielding via macrotask (`setTimeout(0)`) between pages.
- **OCR (Shipped)**:
  - Architecture: self-hosted `tesseract.js` (7.0.0) with local worker (`/ocr/worker.min.js`), wasm cores (`lstm`, `simd-lstm`, `relaxedsimd-lstm` under `/ocr/core/`), and vendored language model (`/ocr/lang/eng.traineddata`).
  - Pipeline modules: `decide.ts` → `extract.ts` → `render.ts` → `engine.ts` → `pdf.ts` / `image.ts`.
  - Page decision logic (`src/converters/ocr/decide.ts`): categorizes pages as `'text'` (≥ 25 non-whitespace chars), `'image-only'` (< 25 chars + `hasImageOps`), `'forced'` (`forceOcr: true`), or `'empty'`.
  - Image operator detection (`src/converters/pdf/extract.ts`): scans pdfjs operator list for low-text pages (< 25 chars; fails open to OCR if `getOperatorList` throws). Detects large embedded images (≥ 30% page area) capped at the first 20 text pages (`MAX_TEXT_PAGES_FOR_IMAGE_DETECTION = 20`) to bound extraction overhead on large documents. Emits `EMBEDDED_IMAGES_MAY_CONTAIN_TEXT` warning, wired in UI to "Run OCR on this PDF" (`forceOcr: true`).
  - OCR Engine (`src/converters/ocr/engine.ts`): dynamic-imports `tesseract.js` on first use, creates a single worker reused across pages, executes strictly sequentially (concurrent calls reject immediately with `OcrFailedError`), supports immediate cancellation via `AbortSignal` with `CancelledError` (worker terminated in < 1s) and lazy worker recreation on subsequent jobs, maps worker rejections to `OcrFailedError`, and forwards Tesseract logger events to drive `{ phase: 'ocr', current, total: 100 }` progress.
  - Rendering helpers (`src/converters/ocr/render.ts`): `computeRenderScale(width, height, options)` computes scale (default 2.0, capped at max long edge 3000px to bound memory); `renderPdfPageToCanvas(page, options)` renders a pdfjs page to an `HTMLCanvasElement` or `OffscreenCanvas` with UI-thread macrotask yields before/after and guaranteed `page.cleanup()` in `finally`; `releaseCanvas(canvas)` explicitly sets `0x0` dimensions to trigger prompt garbage collection.
  - Image Converter (`src/converters/image.ts`): converts standalone image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.gif`) using `decodeImageToCanvas` (downscales > 3000px, upscales 2× for images < 1000px), processes OCR sequentially, and emits formatted markdown.
  - Quality warnings: surfaces `LOW_OCR_CONFIDENCE` when mean confidence < 70%, with "unreliable" wording when confidence < 40% or non-whitespace characters < 10.
  - Cancellation path: `AppShell` AbortController triggers `signal.abort()`, propagated via `ConvertContext` into `tesseractEngine.terminateWorker()`, terminating the active Web Worker in < 1s.

### PDF OCR Flow

```mermaid
flowchart TD
    PDF[Input PDF Document] --> Load[Load Document via pdfjs legacy]
    Load --> Extract[Extract Pages & Text]
    Extract --> Decision{Decision Rule per Page}
    Decision -- ">= 25 chars (Text)" --> TextPage[Extract Text / Markdown]
    TextPage --> EmbedCheck{Image Area >= 30%<br/>& Page <= 20?}
    EmbedCheck -- Yes --> WarnEmbed[Emit EMBEDDED_IMAGES warning]
    EmbedCheck -- No --> OutputAcc[Accumulate Output]
    WarnEmbed --> OutputAcc
    Decision -- "< 25 chars & hasImageOps<br/>or forceOcr: true" --> RenderCanvas[Render Page to Canvas<br/>2x scale, max 3000px edge]
    Decision -- "< 25 chars & no images" --> EmptyPage[Empty Page]
    RenderCanvas --> TesseractEngine[Tesseract OCR Engine<br/>Single Reused Worker]
    TesseractEngine --> ConfCheck{Confidence < 70?}
    ConfCheck -- Yes --> WarnConf[Emit LOW_OCR_CONFIDENCE warning]
    ConfCheck -- No --> CleanCanvas[Zero Canvas Dimensions]
    WarnConf --> CleanCanvas
    CleanCanvas --> OutputAcc
    EmptyPage --> OutputAcc
```

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
