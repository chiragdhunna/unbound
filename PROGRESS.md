# PROGRESS

## Milestones

- ✅ M0 — Scaffold, tooling, gates
  - ✅ Move requirements doc to `/docs/REQUIREMENTS.md`
  - ✅ Scaffold Vite + React + TypeScript strict baseline
  - ✅ Add ESLint, Prettier, Vitest, Playwright, and initial smoke tests
  - ✅ Create `DECISIONS.md`, `docs/TRACEABILITY.md`, `scripts/verify.sh`, CI workflow
  - ✅ Run verification gate and record output
- ✅ M1 — Core engine
  - ✅ Add core contracts and typed errors (`types`, `errors`)
  - ✅ Implement initial detection for signatures + text/code extensions
  - ✅ Add converter registry and text/json/xml/code/markdown converters
  - ✅ Wire file input to conversion pipeline for txt/md/json/xml/code
  - ✅ Add unit/e2e tests for `.txt` and `.json` upload and conversion output
- ✅ M2 — Output experience & app shell
  - ✅ Output shell, copy/download, plain toggle, localStorage settings, multi-file batch handling
  - ✅ Batch mode switch, per-file job state, warnings, edit/read-only output panel
  - ✅ Chunk preview and per-chunk copy helper
  - ✅ CSP and privacy footer in the app shell and document head
  - ✅ Full browser-level keyboard/accessibility/a11y matrix and the full plan-specified chunking semantics
- ✅ M3 — DOCX
  - ✅ DOCX converter added via Mammoth
  - ✅ Unit test for generated DOCX content conversion
  - ✅ Browser e2e for generated DOCX upload
  - ✅ Full encrypted/legacy Office negative-path coverage and full plan-specified image/footnote handling
    - Images: Single warning "N embedded images were not converted" (N = count), no base64/data: URIs in output
    - Footnotes: Deferred (not in REQUIREMENTS.md)
- ✅ M4 — XLSX / XLS / CSV
  - ✅ M4.1 — SheetJS dependency vendored at `vendor/xlsx-0.20.3.tgz`, installed as `file:vendor/xlsx-0.20.3.tgz` (see DECISIONS.md 2026-10-19)
  - ✅ M4.2 — XLSX/XLS converter (`src/converters/xlsx.ts`, lazy-loaded SheetJS): one `## Sheet: <name>` section per worksheet in workbook order, empty sheets skipped with warning, GFM tables, ISO dates, merged-cell top-left values + warning, hidden sheets labelled, empty header cell → `Column N`, `.xls` via same library, typed password/corrupt errors. Verified by 13 named tests in `tests/unit/converters/xlsx.test.ts` (see docs/TRACEABILITY.md R010)
  - ✅ M4.3 — CSV/TSV converter (`src/converters/csv.ts`, custom RFC-4180 parser — SheetJS coerces `007`→`7` and `1e3`→`1000`, see DECISIONS.md 2026-10-20): quoted fields preserved exactly (`007`, `1e3`, leading/trailing spaces), `\"\"`/`\\\"` escapes, newlines in quotes → `<br>`, pipes → `\\|`, TSV by `.tsv` filename or MIME, semicolon/comma/tab sniffing, UTF-8 BOM stripped, windows-1252 fallback with warning. Verified by 23 tests in `tests/unit/converters/csv.test.ts`
  - ✅ M4.4 — Register + detect: `csv` registered in `src/core/registry.ts`; `csv` + `xlsx` added to `src/core/pipeline.ts` supported kinds (previously unreachable from the app); detect already maps `.csv/.tsv` → `csv` and `.xlsx/.xls/.xlsm` → `xlsx`. Verified by `tests/unit/core/registry-more.test.ts`::detects csv/tsv files and routes them to the csv converter and `tests/unit/core/pipeline.test.ts`::converts a File named a.csv into the exact markdown table
  - ✅ M4.5 — UI accept-list + e2e: DropZone file input `accept` list and "supported formats" text now include csv, tsv, xlsx, xls, xlsm (`src/app/AppShell.tsx`); browser e2e uploads a generated `.csv` and asserts the rendered table — `tests/e2e/csv.spec.ts`::uploads a generated csv and renders the table in the output panel (passes on chromium and mobile-chromium)
  - ✅ M4.6 — Browser XLSX upload e2e + zip-detection fix: `tests/e2e/xlsx.spec.ts`::uploads a generated xlsx and renders the sheet table in the output panel generates a workbook with SheetJS inside the test and asserts `## Sheet: Budget` plus the exact `| Item | Amount |` header row. The first run exposed a pre-existing bug: SheetJS writes `xl/workbook.xml` ~11 KB into a minimal workbook, past detect's first-4096-byte sample, so real uploads classified as `zip` → "Unsupported format". `src/core/detect.ts` now also reads entry names from the zip central directory (located via the end-of-central-directory record, bounded search); regression tests in `tests/unit/core/detect-zip.test.ts`, including a real SheetJS buffer with a misleading `.bin` name
- ✅ M5 — PDF (text)
  - ✅ M5.1 — Library + self-hosted worker setup: **pdfjs-dist 6.4.299** (registry dependency) and **pdf-lib 1.17.1** (devDependency, test/spike fixtures). `src/converters/pdf/worker.ts` lazily `import('pdfjs-dist')` — pdfjs must never be a top-level import of anything in the initial bundle — and sets `GlobalWorkerOptions.workerSrc` from `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (file name confirmed by listing `node_modules/pdfjs-dist/build/`; no CDN). CSP `worker-src 'self' blob:` was already present and byte-identical in `index.html`, `_headers` and `vercel.json` (verified by grep before install) — no CSP change was needed. Verified by `tests/unit/converters/pdf-worker.test.ts`::points GlobalWorkerOptions at the self-hosted worker asset and `tests/unit/converters/pdf-worker.test.ts`::caches the configured module across calls; spike evidence in DECISIONS.md 2026-10-20
  - ✅ M5.2 — Text extraction for text-based PDFs, end to end (this supersedes the old M5.2–M5.6 split: scanned detection, typed errors, extraction tests, registration, and the upload e2e all landed in this milestone's four commits):
    - **Layout** `src/converters/pdf/layout.ts` — pure module (no pdfjs import, no UI) with every threshold as a named constant: same-line grouping `|Δy| ≤ 0.3 × max height`, space insertion `gap > 0.2 × line height` (never double spaces), paragraphs join when baseline distance `≤ 1.7 × line height`, headings `≥ 1.2 ×` the length-weighted median font size and `< 120 chars` ranked into `# `/`## `/`### `, bullets/`1. `/`a) ` normalised as tight list blocks, de-hyphenation across line breaks, pages joined by a blank line. Verified by 11 tests in `tests/unit/converters/pdf-layout.test.ts` including the exact golden markdown (`matches the golden two-page markdown`)
    - **Extraction** `src/converters/pdf/extract.ts` — `PdfjsLike` seam; ALWAYS passes `new Uint8Array(bytes.slice(0))` (pdfjs may detach the buffer; originals stay intact for a future OCR fallback); `CancelledError` checked between pages; `ctx.onProgress({ phase: 'pdf', current, total })` per page; `page.cleanup()` per page; `loadingTask.destroy()` in `finally` (pdfjs v6 has no `PDFDocumentProxy.destroy()`)
    - **Converter + scanned detection** `src/converters/pdf.ts` — `getPdfjs()` → `extractPageItems` → `layoutPagesToMarkdown` → `normalizeMarkdown`; `SCANNED_CHARS_PER_PAGE = 20` so `charCount < 20 × numPages` (including 0) throws the new typed `ScannedPdfError` ("This PDF looks scanned (no selectable text). OCR support is not available yet.", mapped in `errorMessage`); `PasswordException` → `PasswordRequiredError`; `InvalidPDFException`/anything else and zero-byte input → `CorruptFileError`. Verified by 8 tests in `tests/unit/converters/pdf.test.ts` through the real legacy build (`@vitest-environment node`)
    - **Register** `pdf` added to `src/core/registry.ts` (lazy entry) and `src/core/pipeline.ts` supported kinds + unsupported-format message; detect already returned `pdf` from the `%PDF-` signature
    - **UI** `.pdf`/`application/pdf` in the DropZone `accept` list and `pdf` in the supported-formats line (`src/app/AppShell.tsx`)
    - **E2E** `tests/e2e/pdf.spec.ts`::uploads a generated PDF and renders the markdown output (asserts `# Quarterly Budget Review` + `- Rent 1200`, fails on any console/CSP error) and `tests/e2e/pdf.spec.ts`::shows the scanned-PDF message for a blank PDF — chromium + mobile-chromium
    - Full pasted evidence in the 2026-10-21 log entry below
  - ✅ M5.3 — Extraction refinements landed this session (2026-10-21):
    - **Header/footer removal** `src/converters/pdf/layout.ts` — new exported `layoutPages(pages, options?)` returning `{ markdown, charCount, removedLineCount }`; `layoutPagesToMarkdown(pages)` kept as a thin wrapper so every M5.2 caller and test is unchanged. Named constants at the top: `HEADER_FOOTER_BAND = 0.08` (band measured from the page bottom), `REPEAT_RATIO = 0.6`, `MIN_PAGES_FOR_REPEAT = 3`. Candidate lines normalised (`lowercase → trim → collapse spaces → digit runs become #`) so `Page 3 of 10` and `Page 4 of 10` share one key; band lines appearing on ≥ 60% of pages (≥ 3 pages only) are removed; bare page numbers (`12`, `Page 12`, `Page 3 of 10`, `- 12 -`) are removed on **any** page count; lines outside the bands are never touched; the length-weighted median used for heading detection is computed from the **surviving** items. Verified by 7 new tests in `tests/unit/converters/pdf-layout.test.ts` (repeated header/footer gone with `removedLineCount` = 10, header on 2 of 5 pages kept, identical text mid-page kept, 2-page doc keeps its header but loses a bare page-number footer, `removeRepeated: false` keeps everything, exact `--- Page 1 ---` / `--- Page 2 ---` marker blocks, wrapper equivalence)
    - **Page heights + UI-thread yielding** `src/converters/pdf/extract.ts` — new `extractPages()` returns `{ items, height }[]` with `height` from `page.view` (y1 − y0, falling back to 0); `extractPageItems()` kept as a wrapper so the M5.2 signature and its 8 tests are unchanged. The extraction loop now awaits `setTimeout(resolve, 0)` after **every** page, alongside the existing cancellation check and per-page progress
    - **Converter wiring + warnings** `src/converters/pdf.ts` — calls `layoutPages` with `pageHeights`; adds info warning `PDF_BANDS_REMOVED` ("Repeated headers, footers and page numbers were removed.") when `removedLineCount > 0`, and warn warning `PDF_LARGE` ("Large PDF (N pages). Conversion can take a while.") when `numPages > 300` (`LARGE_PDF_PAGE_THRESHOLD`, warns and continues, never blocks); passes `ctx.options.pdfPageMarkers` through
    - **Option plumbing** `src/core/types.ts` gains optional `ConvertOptions.pdfPageMarkers?: boolean` (optional, so every existing options object still compiles); `src/core/context.ts` defaults it to `false`
    - **UI setting** `src/app/AppShell.tsx` — `pageMarkers` already existed as a persisted, labelled checkbox but was **never passed to the converter**; new `buildConvertContext(settings)` helper is now used at both `convertFile` sites (upload and retry). Checkbox given `id="page-markers-checkbox"` + `htmlFor`, label renamed to "Add page markers (PDF)". Persists under `unbound-settings-v1`; booleans only, never file content
    - **Tests** 3 new in `tests/unit/converters/pdf.test.ts` (4-page header/footer fixture asserts both bands gone, body kept, `PDF_BANDS_REMOVED` warning; **320-page** fixture asserts the `PDF_LARGE` warning, all 320 pages present, and prints/ asserts a measured **728 ms** against a 60 s budget; `pdfPageMarkers: true` yields `--- Page 1 ---`) and 2 new in `tests/e2e/pdf.spec.ts` (markers on → both marker blocks visible; markers off → absent, body still rendered) × 2 projects
    - **Verification evidence (2026-10-21):** `LINT_EXIT=0`, `TSC_EXIT=0`, `npm run test:unit` → `Test Files 24 passed (24)`, `Tests 175 passed (175)` (run twice with identical output; `TZ=Asia/Kolkata` identical); `npm run build` + `node scripts/check-bundle.mjs` → `Initial JavaScript gzip: 68123 bytes / 256000 bytes`, `Lazy JavaScript chunks: 14`, `BUNDLE_EXIT=0`; `npx playwright test --project=chromium --project=mobile-chromium` → `56 passed`, `E2E_EXIT=0`, no skips (52 was + 2 new tests × 2 projects); `npm run test:unit -- --coverage` → `COV_EXIT=0`, `All files 94.44 % lines`, `pdf.ts` 100%, `layout.ts` 99.63%, no threshold errors
  - ⬜ M5.4 — Still deferred from PDF extraction: table heuristic, bold detection, multi-column handling; OCR for scanned PDFs belongs to M6
- ✅ M6 — OCR (scanned PDF + images)
  - ✅ M6.1 — Self-hosted OCR runtime setup: **tesseract.js 7.0.0**, worker.min.js, core wasm variants, vendored eng.traineddata. Tested in `tests/e2e/ocr-spike.spec.ts` with zero cross-origin requests and zero CSP violations under the real app CSP.
  - ✅ M6.2 — OCR page decision logic & PDF image-op detection: `src/converters/ocr/decide.ts` (`decideOcrPages`, `MIN_CHARS_PER_PAGE = 25`) + real-PDF image-op detection in `src/converters/pdf/extract.ts` (`extractPages` returns `hasImageOps`, only scanned when chars < 25; operator codes pinned to installed pdfjs `OPS`). Verified by 11 tests in `tests/unit/converters/ocr-decide.test.ts` and 7 tests in `tests/unit/converters/pdf-image-ops.test.ts`.
  - ✅ M6.3 — Engine & page rendering helpers:
    - ✅ M6.3a — Self-hosted Tesseract.js engine (`src/converters/ocr/engine.ts`): lazy dynamic import, single worker reuse across calls, AbortSignal immediate termination with typed CancelledError and lazy recreation, typed error mapping to CorruptFileError, logger-driven progress forwarding (`{ phase: 'ocr', current, total: 100 }`), idempotent `terminate()`. Verified by 15 tests in `tests/unit/converters/ocr-engine.test.ts`.
    - ✅ M6.3b — Page rendering helpers (`src/converters/ocr/render.ts`): `computeRenderScale` bounding canvas long edge to 3000px and upscaling small images (< 1000px 2×); `renderPdfPageToCanvas` with UI thread yielding and guaranteed `page.cleanup()`; `releaseCanvas` clearing canvas dimensions and closing ImageBitmap buffers for prompt garbage collection. Verified by 14 tests in `tests/unit/converters/ocr-render.test.ts`.
  - ✅ M6.4 — PDF routing & scanned PDF integration: `src/converters/pdf.ts` detects scanned and mixed pages, routes scanned/image pages to OCR and selectable text to layout engine; skips Tesseract imports for text PDFs; empty PDFs (no text and no images) throw `NoTextFoundError`; merges pages with `--- Page N ---` markers when `pdfPageMarkers` is enabled. Verified by 16 tests in `tests/unit/converters/pdf.test.ts` and 5 tests in `tests/e2e/pdf.spec.ts`.
  - ✅ M6.5 — Confidence warnings & empty result errors: mean confidence < 70 emits `OCR_LOW_CONFIDENCE` warning; whitespace-only OCR results throw `NoTextFoundError('No text found in this image.')`. Verified in `tests/unit/converters/pdf.test.ts` and `tests/unit/converters/image.test.ts`.
  - ✅ M6.6 — Image files converter: `src/converters/image.ts` registered for PNG, JPG/JPEG, WebP, BMP, and GIF (`src/core/registry.ts`, `src/core/pipeline.ts`, `src/core/detect.ts`); decodes via `createImageBitmap` with canvas fallback; bounds dimensions (≤ 3000px, 2× upscale if < 1000px); runs OCR engine and produces normalized markdown. Verified by 9 tests in `tests/unit/converters/image.test.ts`.
  - ✅ M6.7 — OCR UI states: accessible progress bar with `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`; progress details showing "Page X of Y" or percent; working Cancel button wired to `AbortController` in `src/app/AppShell.tsx`; visible language support notice (`.ocr-lang-notice`) informing users that OCR is English-only in v1. Verified by 3 tests in `tests/unit/app-shell-progress.test.tsx` and 2 tests in `tests/e2e/image.spec.ts`.
  - ✅ M6.8 — E2E test sweep: end-to-end browser tests in `tests/e2e/pdf.spec.ts` and `tests/e2e/image.spec.ts` verifying scanned PDF OCR, mixed PDF conversion, image OCR file upload, abort/cancel in under 1 second, zero non-same-origin network requests, and zero CSP violations.
  - ✅ M6.9 — Final docs: `docs/TRACEABILITY.md` rows updated to ✅ with exact test references; `DECISIONS.md` records confidence threshold (< 70%), image downscaling/upscaling bounds, canvas memory disposal, sequential worker execution, and English-only scope; `README.md` updated with supported formats and privacy guarantees; `PROGRESS.md` refreshed with closure evidence.
  - *Explicitly deferred under M6:*
    - Non-English OCR languages: deferred to a future milestone; English-first in v1 with visible UI notice.
    - Rotated pages: deferred; standard orientation handled.
    - Tables in scanned pages: deferred; sequential text layout extracted.
    - PDF embedded-image OCR on request: deferred; scanned pages and full image files converted.
- ⬜ M7 — PPTX
- ⬜ M8 — P1 formats: RTF, HTML file, URL
- ⬜ M9 — P2 formats: EPUB, ZIP/folders
- ⬜ M10 — Edge cases & robustness sweep
- ⬜ M11 — Accessibility, mobile, performance, privacy hardening
- ⬜ M12 — Docs, deploy, final audit

## M2/M3 Self-Audit

| Checklist item                                                                                                                                 | Implementation                                                    | Test path::name                                                                                                                                                                                                                                              | Command                                                               | Result |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ |
| M2 DropZone, JobList, OutputPanel, counters, Markdown/plain toggle, copy and fallback, download, toasts, persistence, error cards, preview cap | `src/app/AppShell.tsx`                                            | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 uses the textarea clipboard fallback when Clipboard API is unavailable                                                               | `npx playwright test --project=chromium --project=mobile-chromium`    | PASS   |
| M2 structure-aware chunker and ChunkList                                                                                                       | `src/core/chunk.ts`, `src/app/AppShell.tsx`                       | `tests/unit/core/chunk.test.ts`::does not split table rows and repeats the table header; `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy                                                               | `npm run test:unit -- --coverage --reporter=verbose` and Chromium E2E | PASS   |
| M2 sequential copy and preamble option                                                                                                         | `src/app/AppShell.tsx`                                            | `tests/e2e/m2-output.spec.ts`::M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy                                                                                                                                                        | Chromium E2E                                                          | PASS   |
| M2 combine mode                                                                                                                                | `src/app/AppShell.tsx`, `src/core/combine.ts`                     | `tests/e2e/m2-output.spec.ts`::M2 supports separate and combined batch output; `tests/unit/core/extended.test.ts`::combines stable file boundaries and maps typed errors                                                                                     | Chromium E2E and unit coverage                                        | PASS   |
| M2 acceptance: text happy path, chunk invariants, counters, copy/download                                                                      | `src/app/AppShell.tsx`, `src/core/chunk.ts`, `src/core/tokens.ts` | `tests/e2e/m2-output.spec.ts`::M2 happy path converts and copies in two user actions; `tests/e2e/m2-output.spec.ts`::M2 downloads exact content with the mode-specific filename; `tests/unit/core/chunk.test.ts`::rejoins generated paragraph bodies exactly | Full runnable Chromium E2E and unit coverage                          | PASS   |
| M3 DOCX 7.2 implementation, fixtures, and tests                                                                                                | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts`    | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images                                                                                                                                                         | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 encrypted DOCX message                                                                                                                      | `src/converters/docx.ts`, `src/core/errors.ts`                    | `tests/unit/converters/docx.test.ts`::rejects an OLE2 encrypted Office wrapper                                                                                                                                                                               | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 golden output and image warning                                                                                                             | `src/converters/docx.ts`, `tests/unit/converters/docx.test.ts`    | `tests/unit/converters/docx.test.ts`::preserves structured DOCX content and warns for omitted images                                                                                                                                                         | `npm run test:unit -- --coverage --reporter=verbose`                  | PASS   |
| M3 browser upload acceptance                                                                                                                   | `tests/e2e/docx.spec.ts`                                          | `tests/e2e/docx.spec.ts`::uploads a generated docx and renders markdown output                                                                                                                                                                               | `npx playwright test --project=chromium --project=mobile-chromium`    | PASS   |

## Closure evidence (refreshed 2026-10-25, at M6 completion)

Current runnable evidence (2026-10-25, M6 completion): **252 of 252 unit tests pass** across 31 test files (zero failures, vitest 5.0.5). **66 Chromium and mobile-Chromium E2E tests pass**, `E2E_EXIT=0`, no skips, including axe options-bar, empty, error-card, preview-cap, scanned/mixed PDF, image OCR, and privacy network sweeps. Coverage `COV_EXIT=0`: `All files` **94.13%** lines (85% gate), `src/converters` **93.9%** lines, `src/converters/pdf` **100%** lines, `src/converters/ocr` **89.88%** lines, `src/core` **93.26%** lines. Initial JS entry **69,450 bytes gzip** of 256,000 budget with 19 lazy chunks. Heavy libraries (pdfjs, SheetJS, Tesseract.js) are strictly segregated in lazy chunks and absent from the initial bundle. All OCR engine assets are self-hosted under `/public/ocr/` (zero cross-origin network requests, zero CSP violations under strict app CSP).

## Iteration Log

### 2026-10-01 — M2/M3 slice

- Added a real markdown-to-plain renderer using the Marked lexer (AST-like token walk), chunking with safe rejoin semantics, and a true DOCX converter via Mammoth.
- Expanded the app shell to handle multiple files, batch modes, edit mode, copy/download fallback, warnings, and persisted settings.
- Added DOCX unit and Playwright tests using generated docx fixtures from `docx`.
- Verification evidence:
  - `npx vitest run tests/unit/core/plain.test.ts tests/unit/core/chunk.test.ts tests/unit/converters/docx.test.ts` ✅ failed before implementation, then passed after the fix.
  - `npm run test:e2e -- --reporter=line` ✅ on the updated browser suite after installing Chromium.
- Added the strict 85% core/converter coverage gate, post-build initial-entry gzip check, captured-output traceability validation, and source/test hygiene enforcement.
- Added real core tests for encoding, detection, normalization, plain rendering, tokens, chunk invariants, combine, queue, errors, registry, and converter fence safety.
- Expanded DOCX fixtures/tests for structured content, tables, nested lists, emphasis, links, footnotes, images, image warnings, and encrypted Office wrappers.
- Added 11 browser tests for M2 controls, batch isolation, chunk controls, settings privacy, preview caps, copy/download, keyboard flow, CSP/font loading, and no-external-request conversion.
- Evidence at the time: 37 unit tests passed; `src/core` 92.10% lines; `src/converters` 100% lines; 30 Chromium/mobile-Chromium E2E tests passed.
- Next steps:
  - Continue by implementing the broader PDF/XLSX/PPTX/OCR families and the remaining plan-specified privacy and accessibility gates.
- Blockers: full WebKit execution is unavailable in this host because `libicudata.so.74` is missing and `apt-get` is unavailable.

### 2026-10-18 — Accessibility and CI repair

- Fixed job list accessibility: changed div to ul/li, moved error/warning elements out of buttons, removed redundant onKeyDown handlers
- Fixed E2E axe tests: replaced getByLabel with getByRole for button selections
- Updated traceability: set R033 and R040 to ✅ citing M2 happy path and six axe tests
- CI configuration: confirmed ubuntu-24.04 pin, verified e2e guards run after test execution
- Green runs: 01efd29 (run 39064632252), ad741e8 (run 39065677279)

### 2026-10-18 — M3 completion: Image handling refined

- Refined DOCX image handling to produce exactly one warning: "N embedded images were not converted"
- Ensured no base64 or data: URIs appear in markdown output
- Added unit test verifying warning format and absence of data: URIs for 2-image DOCX
- All lint, typecheck, unit tests pass
- Chromium E2E tests pass: 44 passed (17.8s)

### 2026-10-20 — M4 completion: XLSX/XLS + CSV/TSV

- Vendored the official SheetJS 0.20.3 tarball (DECISIONS.md 2026-10-19) and added the XLSX/XLS converter (`src/converters/xlsx.ts`): multi-sheet `## Sheet:` sections, ISO dates, merged/hidden/empty-sheet handling, typed password/corrupt errors; lazy-loaded SheetJS.
- Added the CSV/TSV converter (`src/converters/csv.ts`) with a custom RFC-4180 parser. Rationale recorded in DECISIONS.md 2026-10-20 with a pasted spike: SheetJS coerces cell types (`007` → `7`, `1e3` → `1000`), violating the exact-text requirement.
- Reverted `272944c` (quote escaping in markdown table cells): CSV/XLSX values must stay EXACTLY as written in the source file; the one affected CSV assertion was updated to the exact-source-text form.
- Registered `csv` in the converter registry and added `csv` + `xlsx` to the pipeline supported kinds — previously `.csv/.tsv/.xlsx` uploads reached "Unsupported format" even though the converters existed.
- DropZone `accept` list and a "supported formats" line now cover csv, tsv, xlsx, xls, xlsm.
- Tests: **141 unit** (was 129) — +12 CSV exact-text/delimiter tests (007, 1e3, quoted spaces, quoted newline → `<br>`, pipe → `\\|`, TSV by filename, semicolon sniffing, BOM, windows-1252, exact quoted-quote output) plus detect/registry routing and pipeline-level CSV tests. **E2E: 46 passed** (was 44) — new `tests/e2e/csv.spec.ts` on chromium + mobile-chromium.
- Verification evidence (2026-10-20):
  - `npm run lint && npm run typecheck && npm run test:unit` → 20 files, 141 passed.
  - `TZ=Asia/Kolkata npm run test:unit` → 141 passed.
  - `npm run build` + `node scripts/check-bundle.mjs` → initial JS gzip 67,745/256,000 bytes; 12 lazy chunks (csv 0.88 kB, xlsx 161.71 kB stay out of the initial payload).
  - `npm run test:e2e -- --project=chromium --project=mobile-chromium` → 46 passed.
- Blockers: the mobile-webkit e2e project still cannot launch on this machine (`libicudata.so.74` missing; `apt-get` unavailable) — expected and accepted per docs/AGENT_PROMPT.md.

### 2026-10-20 — M4.6 XLSX upload e2e + zip-detection fix, M5.1 PDF setup

- Added `tests/e2e/xlsx.spec.ts`: generates a two-row "Budget" workbook with the installed SheetJS package inside the test, uploads it through the file input, and asserts `## Sheet: Budget` plus the exact `| Item | Amount |` header row in the output panel.
- The first run of that e2e exposed a pre-existing detection bug (not a test problem): SheetJS writes `xl/workbook.xml` at offset ~11 KB in a minimal workbook — past detect's first-4096-byte sample — so every real workbook upload was classified as `zip` and rejected with "Unsupported format for now (zip)". `src/core/detect.ts` now also decodes the zip central directory (located via the end-of-central-directory record with a bounded backward search, plus the leading window for stored entry data such as an EPUB mimetype); plain zips and synthetic zip fixtures keep their previous behavior. Regression tests in `tests/unit/core/detect-zip.test.ts`, including a real SheetJS buffer named `report.bin` to prove content-based detection rather than extension luck.
- M5.1: installed **pdfjs-dist 6.4.299** and **pdf-lib 1.17.1** (dev). `src/converters/pdf/worker.ts` exports `getPdfjs()`, which lazily imports pdfjs and points `GlobalWorkerOptions.workerSrc` at the Vite-emitted copy of `pdfjs-dist/build/pdf.worker.min.mjs?url` (name confirmed by listing `node_modules/pdfjs-dist/build/`). CSP `worker-src 'self' blob:` was already present and byte-identical in `index.html`, `_headers`, `vercel.json` — verified before install, so no CSP edit and no CDN.
- Spike (`/tmp/pdf-spike.mjs`, not committed): a 2-page pdf-lib document loads through `getDocument({ data })` with pdfjs's legacy build in Node; `getTextContent()` items expose `str`, `transform[4]` (x), `transform[5]` (y), `height` (== font size), `width`, `fontName`, `hasEOL`, plus empty spacer items (`str:""`, `hasEOL:true`); non-PDF bytes reject with `InvalidPDFException: Invalid PDF structure.`; pdfjs v6 has no `pdf.destroy()` — use `loadingTask.destroy()`.
- Verification evidence (2026-10-20):
  - `npm run lint && npm run typecheck && npm run test:unit` → 22 files, 146 passed (was 141).
  - `npm run test:unit -- --coverage` → `src/core` 93.44% lines, `src/converters` 92.18% lines, `src/converters/pdf` 100% (85% gate).
  - `npm run build` + `node scripts/check-bundle.mjs` → initial JS gzip 67,944/256,000 bytes; 12 lazy chunks. Temporary, reverted build probe lazily importing the worker module: `pdf-*.js` own chunk (483.74 kB │ gzip 144.43 kB) + `pdf.worker.min-*.mjs` (1,264.34 kB) asset, initial gzip still ~67 KB — proving pdfjs stays out of the initial payload.
  - `npx playwright test --project=chromium --project=mobile-chromium` → 48 passed (was 46; +2 = xlsx spec × 2 projects).
- Blockers: mobile-webkit e2e still cannot launch on this machine (`libicudata.so.74` missing) — accepted per docs/AGENT_PROMPT.md; `format:check` still fails on the pre-existing baseline files (needs its own `chore:` commit).

### 2026-10-21 — M5.2 PDF text extraction (layout, converter, UI, e2e)

- Four commits, pushed after each:
  1. `feat(pdf): add pure text layout to markdown module` — `src/converters/pdf/layout.ts` + `tests/unit/converters/pdf-layout.test.ts` (11 tests, golden two-page markdown asserted as an exact string).
  2. `feat(pdf): add text-based PDF converter with scanned detection` — `src/converters/pdf/extract.ts`, `src/converters/pdf.ts`, `ScannedPdfError` in `src/core/errors.ts` (+ `errorMessage` mapping), `pdf` in `src/core/registry.ts` and `src/core/pipeline.ts`, `tests/unit/converters/pdf.test.ts` (8 tests through the real legacy build).
  3. `feat(pdf): accept PDFs in the UI and add upload e2e` — `.pdf`/`application/pdf` in `src/app/AppShell.tsx` accept list + supported-formats text; `tests/e2e/pdf.spec.ts` (2 tests × 2 projects).
  4. `docs: record M5.2 progress and refresh README` — this entry, closure-evidence refresh, traceability rows, DECISIONS thresholds entry, README.
- Layout first-run failures (fixed in the module, never in the tests): 4 of 11 golden-adjacent assertions failed because paragraph continuation lines were flushed as separate blocks and consecutive list items were joined with blank lines; restructured blocks as arrays of physical lines (`join('\n')` per block, `'\n\n'` between blocks). Also normalised `2) `/`a) ` list markers to `N. `/`a. ` and fixed two fixtures whose width-weighted median skewed the heading threshold.
- Layout constants are all pinned at the top of `layout.ts` and justified in DECISIONS.md 2026-10-21 against the measured spike numbers (paragraph baselines 16–18 pt apart vs 34–50 pt paragraph gaps; `hasEOL` proven unreliable — a title line had `hasEOL:false` — so lines group by y).
- `extractPageItems` always hands pdfjs a **copy** (`new Uint8Array(bytes.slice(0))`) because pdfjs may detach the buffer; a unit test asserts the original fixture bytes are byte-identical after extraction. Cleanup uses `loadingTask.destroy()` in a `finally` block (pdfjs v6 `PDFDocumentProxy` has no `destroy()`).
- Scanned detection: `SCANNED_CHARS_PER_PAGE = 20`; `charCount < 20 × numPages` (including 0) → typed `ScannedPdfError` with the exact message "This PDF looks scanned (no selectable text). OCR support is not available yet.", handled in `errorMessage`. Password (`PasswordException` → `PasswordRequiredError`), garbage (`InvalidPDFException` → `CorruptFileError`), zero-byte (`CorruptFileError`), and aborted-signal (`CancelledError`) paths are all unit-tested.
- Stale-test fix (2026-10-21): `tests/unit/core/registry-more.test.ts`::rejects unregistered kinds had used `'pdf'` as its unregistered example; registering pdf necessarily broke that assertion. The fix changes only the example kind to `'legacy-office'` (legacy `.doc` files, permanently answered with `LegacyDocError`, so it can never be registered) — the assertion `rejects.toBeInstanceOf(UnsupportedFormatError)` and the test name are unchanged, nothing was skipped or loosened, and the suite is now 165/165. Rationale and old/new expected strings are in DECISIONS.md 2026-10-21.
- Verification evidence (2026-10-21):
  - `npm run lint` → `LINT_EXIT=0`; `npm run typecheck` → `TSC_EXIT=0`.
  - `npm run test:unit` → `Test Files 24 passed (24)`, `Tests 165 passed (165)` — zero failures (re-run twice with identical output; the earlier red registry test was fixed by the subject change documented above). `TZ=Asia/Kolkata npm run test:unit` → identical `165 passed (165)`.
  - `npm run test:unit -- --coverage` (with `reportOnFailure`) → `src/core` **93.1%** lines, `src/converters` **92.8%** lines, `src/converters/pdf` **100%** lines, `pdf.ts` 100% — no coverage-threshold errors.
  - `npm run build` → `BUILD_EXIT=0`; `node scripts/check-bundle.mjs` → `Initial JavaScript gzip: 68060 bytes / 256000 bytes`, `Lazy JavaScript chunks: 14`, `BUNDLE_EXIT=0`; build output shows pdfjs in its own lazy chunk `pdf-BtCWNl9F.js 483.74 kB │ gzip: 144.43 kB` plus `pdf.worker.min-*.mjs 1,264.34 kB`, initial entry `index-*.js gzip: 68.06 kB`.
  - `npx playwright test --project=chromium --project=mobile-chromium` → **`52 passed (14.7s)`**, `E2E_EXIT=0` (48 was + pdf spec × 2 projects). The golden-upload test also asserts zero console errors/CSP violations during a real PDF conversion — none observed; no cmap/wasm/font fetch failures appeared (a Node-only `standardFontDataUrl` warning is recorded as a DECISIONS.md finding).
  - `node scripts/check-traceability.mjs` → `Traceability checked: 61 rows; completed rows have test files.`, `TRACE_EXIT=0` (re-run after this docs commit).
  - Deferred from M5.2 to M5.3 (explicitly out of scope): header/footer removal, page-markers setting wiring, table heuristic, bold detection, 500+ page batching with progress and UI-thread yielding.
- Blockers: mobile-webkit e2e still cannot launch on this machine (`libicudata.so.74` missing; no apt) — accepted per docs/AGENT_PROMPT.md; `format:check` still fails on the pre-existing baseline files (needs its own `chore:` commit).

### 2026-10-21 — M5.3 header/footer removal, large-PDF warning, page-markers setting

- Five commits, pushed after each:
  1. `fix(tests): remove eslint-disable from xlsx test` — `tests/unit/converters/xlsx.test.ts` only: the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above `xlsxModule.default as any` was failing `scripts/verify.sh`'s own hygiene grep, so the gate could never pass on `main`. Replaced with a structural `MockXLSX` type (`read`, `utils.decode_range`, `utils.encode_cell`, `utils.sheet_to_json`, each carrying `mockReturnValue`/`mockImplementation`) returned via `as unknown as MockXLSX`. 13 tests / 33 `expect(` calls verified byte-identical; guard grep now genuinely empty.
  2. `feat(pdf): remove repeated headers, footers and page numbers` — `src/converters/pdf/layout.ts` gains `layoutPages(pages, options?)` → `{ markdown, charCount, removedLineCount }` with `HEADER_FOOTER_BAND = 0.08`, `REPEAT_RATIO = 0.6`, `MIN_PAGES_FOR_REPEAT = 3`; `layoutPagesToMarkdown` becomes a thin wrapper. 7 new tests in `tests/unit/converters/pdf-layout.test.ts`; all 11 existing tests byte-identical.
  3. `feat(pdf): strip repeated headers and footers, warn on large PDFs` — `extractPages()` returns `{ items, height }[]` (`height` from `page.view` y1 − y0) and yields to the UI thread after every page; `pdf.ts` uses `layoutPages` with `pageHeights`, adds `PDF_BANDS_REMOVED` + `PDF_LARGE` warnings, passes `pdfPageMarkers`; `ConvertOptions.pdfPageMarkers?: boolean` (optional) with a `false` default in `createConvertContext`. 3 new tests; all 8 existing byte-identical.
  4. `feat(ui): add PDF page markers setting` — `buildConvertContext(settings)` wires the **already-persisted** `pageMarkers` boolean into `options.pdfPageMarkers` at both `convertFile` sites; checkbox labelled "Add page markers (PDF)" with `id`/`htmlFor`; 2 new e2e tests; the stale `getByLabel('Page markers', …)` locator in `tests/e2e/axe-test.spec.ts` updated to the new label.
  5. `docs: record M5.3 progress and refresh README` — this entry, closure-evidence refresh, traceability rows, DECISIONS entries, README.
- The gate was un-runnable before this session: `grep -RInE "eslint-disable" src tests --exclude-dir=fixtures | grep -v justification` returned `tests/unit/converters/xlsx.test.ts:29`, and `scripts/verify.sh` exits 1 on that. Fixed by typing the helper, not by exempting the file — the check keeps its teeth.
- Header/footer algorithm: bands are measured from the **page bottom** (`y ≥ height × 0.92` header, `y ≤ height × 0.08` footer), candidates normalised by lowercasing, trimming, collapsing whitespace and masking digit runs so `Page 3 of 10` and `Page 4 of 10` both become `page # of #`. Band text on ≥ 60% of pages (only when there are ≥ 3 pages) is removed; bare page numbers are removed on any page count; nothing outside the bands is ever removed; `removedLineCount` counts every removed line. The median font size that drives heading detection is recomputed from the surviving items so a large running head cannot demote real headings. Rationale for each constant is in DECISIONS.md 2026-10-21 ("M5.3 header/footer constants, band geometry and the page-markers wiring gap").
- `pageMarkers` turned out to be a **plumbing gap**, not a missing feature: the persisted setting and its labelled checkbox already existed in `src/app/AppShell.tsx` but were never passed into `createConvertContext()`. Adding `buildConvertContext(settings)` fixed both the upload path and the retry path.
- The first run of the page-markers e2e failed 4 times because a leftover `vite preview` process (from the M5.2 build) was being reused by Playwright's `reuseExistingServer`; the app snapshot still showed the old "Page markers" label. Killing the stale server and rebuilding made all 56 pass. Recorded in DECISIONS.md so the next session checks the served build before suspecting selectors.
- Verification evidence (2026-10-21):
  - `npm run lint` → `LINT_EXIT=0`; `npm run typecheck` → `TSC_EXIT=0`.
  - `npm run test:unit` → `Test Files 24 passed (24)`, `Tests 175 passed (175)` — run twice with identical output. `TZ=Asia/Kolkata npm run test:unit` → identical `175 passed (175)`.
  - `npm run test:unit -- --coverage --reporter=verbose` → `COV_EXIT=0`, `All files 94.44 % lines`, `pdf.ts 100%`, `layout.ts 99.63%`, `extract.ts 100%` — no coverage-threshold errors.
  - `npm run build` → `BUILD_EXIT=0`; `node scripts/check-bundle.mjs` → `Initial JavaScript gzip: 68123 bytes / 256000 bytes`, `Lazy JavaScript chunks: 14`, `BUNDLE_EXIT=0` (pdfjs still in its own lazy `pdf-*.js` chunk, gzip 144.43 kB).
  - `npx playwright test --project=chromium --project=mobile-chromium` → **`56 passed`**, `E2E_EXIT=0`, no skips — includes `axe: options bar state should have no serious or critical violations` (passing, both projects) and both new page-markers tests on chromium + mobile-chromium.
  - `node scripts/check-traceability.mjs` → re-run after this docs commit.
- Still deferred from PDF extraction (M5.4 or later): the table heuristic, bold detection, and multi-column handling. OCR for scanned PDFs remains M6.
- Blockers: mobile-webkit e2e still cannot launch on this machine (`libicudata.so.74` missing; no apt) — accepted per docs/AGENT_PROMPT.md; `format:check` still fails on the pre-existing baseline files (47 files; needs its own `chore:` commit and is **not** part of `scripts/verify.sh` or CI).

### 2026-10-25 — M6.1/M6.2 baseline and Dependabot updates

- Baseline verification after merging Dependabot updates (fresh install via `npm ci`):
  - Unit tests: 193 of 193 passed across 26 test files (vitest 5.0.5).
  - E2E tests: 58 of 58 passed across chromium and mobile-chromium.
  - Code coverage: All files 94.95% lines (85% threshold gate).
  - Production build & bundle check: initial JS gzip 68,715 bytes / 256,000 bytes budget (14 lazy chunks).
  - Absolute path and hygiene checks: 100% clean.
  - Traceability: 63 rows verified.
- M6.1 self-hosted OCR runtime validated under CSP in `tests/e2e/ocr-spike.spec.ts` (recognizes "HELLO WORLD", zero cross-origin requests, zero CSP violations).
- M6.2 page decision (`src/converters/ocr/decide.ts`, `decideOcrPages`, `MIN_CHARS_PER_PAGE = 25`) and PDF image-op detection (`src/converters/pdf/extract.ts`) verified with 18 unit tests. Decision values: `'text' | 'image-only' | 'forced' | 'empty'`. Pinned op codes: `paintImageMaskXObject (83)`, `paintImageXObject (85)`, `paintInlineImageXObject (86)`, `paintImageXObjectRepeat (88)`, `paintImageMaskXObjectRepeat (89)`.
- Deferred from PDF (M5.4): table heuristic, bold detection, and multi-column handling.
- Next step: M6.3a OCR engine (`src/converters/ocr/engine.ts`) with lazy-loaded worker and typed error mappings.

### 2026-10-25 — M6.3a OCR engine implementation & verification

- Implemented `src/converters/ocr/engine.ts`:
  - `createOcrEngine({ lang?: string } = {})` returning `recognize(image, { onProgress, signal })` and `terminate()`.
  - Lazy `import('tesseract.js')`: Tesseract.js is dynamic-imported from `engine.ts`; bundle separation will be asserted once `engine.ts` is wired into PDF/image conversion in M6.4.
  - Sequential execution only: ONE recognition at a time. Concurrent calls to `recognize()` reject immediately with `OcrFailedError('OCR engine is busy: concurrent recognition is not supported.')` to preserve bounded memory (single canvas in flight) and unambiguous abort semantics.
  - Single worker created on first recognize and reused across sequential pages/calls.
  - Passes self-hosted, BASE_URL-prefixed options: `workerPath: ${baseUrl}ocr/worker.min.js`, `corePath: ${baseUrl}ocr/core`, `langPath: ${baseUrl}ocr/lang`, `gzip: false`, `workerBlobURL: false`.
  - Immediate worker termination on `AbortSignal` with `CancelledError` and lazy worker recreation on subsequent recognize calls.
  - Typed error mapping: recognition and worker creation rejections map to `OcrFailedError` with worker disposal; `errorMessage()` maps `OcrFailedError` to accurate user guidance ("Reload the page and try again; if it keeps failing, the OCR files may not have loaded.").
  - Typed `OcrImageSource`: narrowed to `HTMLCanvasElement | OffscreenCanvas | ImageBitmap | ImageData`.
  - Progress callback driven by Tesseract logger (`status === 'recognizing text'` mapped to `{ phase: 'ocr', current: Math.round(m.progress * 100), total: 100 }`).
  - Idempotent `terminate()`.
- Added unit tests in `tests/unit/converters/ocr-engine.test.ts` (15 tests) and `tests/unit/core/errors-more.test.ts` covering:
  - Lazy loading only once & module caching.
  - Worker reuse across calls.
  - Language (`fra`), OEM 1, and exact self-hosted options verification.
  - Progress forwarding from logger callback.
  - Abort before start (`CancelledError`, worker not created).
  - Abort mid-flight (immediate `worker.terminate()`, `CancelledError`).
  - Recreate worker on subsequent call after an abort.
  - Error mapping to `OcrFailedError` on worker or recognize failure.
  - Non-Error rejection mapping and typed `OcrFailedError` pass-through.
  - Rejection of concurrent `recognize()` calls with `OcrFailedError`.
  - Idempotent `terminate()`.
  - Abort during in-flight worker creation cleanup.
  - Accurate `OcrFailedError` user advice verification in `errors-more.test.ts`.
- Mutation checks performed and verified failing:
  1. Break worker reuse: failed with `expected "spy" to be called 1 times, but got 2 times`.
  2. Break abort termination: failed 5 tests with `expected "spy" to be called 1 times, but got 0 times`.
  3. Break options (omit `corePath`): failed with `expected "spy" to be called with arguments: [ 'fra', 1, ObjectContaining{...} ]` (`corePath` missing).
  4. Break concurrency rejection (allow concurrent recognize): failed concurrency test with `expected promise to reject with OcrFailedError`.
- Verification results (vitest 5.0.5 after `npm ci`):
  - Unit tests: 208 passed across 27 files (was 193 across 26 files; +15 tests in `tests/unit/converters/ocr-engine.test.ts`, +1 in `tests/unit/core/errors-more.test.ts`).
  - Line coverage: All files 95.00%, `src/converters/**` 93.42%, `src/converters/ocr/engine.ts` 95.45%, `src/core/**` 93.60% (85% gate).
  - E2E tests: 58 passed across chromium and mobile-chromium (19.4s).
  - Bundle size check: initial JS gzip 68,572 bytes / 256,000 bytes budget (14 lazy chunks).
  - Hygiene greps & traceability: clean.
- Next step: M6.3b page rendering helpers (`src/converters/ocr/render.ts`).

### 2026-10-25 — M6.3b PDF page canvas rendering helpers implementation & verification

- Implemented `src/converters/ocr/render.ts`:
  - `computeRenderScale(width, height, options)`: pure function defaulting to 2.0 scale (150-300 DPI OCR balance) and maxLongEdge 3000px (~36 MB RGBA buffer ceiling). Clamps scale down when `longEdge * scale > maxLongEdge` so the long edge equals `maxLongEdge`.
  - `renderPdfPageToCanvas(page, options)`: renders a pdfjs page to canvas (`HTMLCanvasElement` / `OffscreenCanvas`) at computed scale. Yields to UI macrotask before and in `finally` block; guarantees `page.cleanup()` in `finally` to release internal pdfjs buffers.
  - `releaseCanvas(canvas)`: zeroes canvas dimensions (`width = 0, height = 0`) to encourage GC on detached buffers.
  - `createCanvas(width, height)`: environment-aware canvas creator (DOM canvas in browser, `OffscreenCanvas` fallback).
- Added unit tests in `tests/unit/converters/ocr-render.test.ts` (14 tests) covering:
  - Standard page scaling (612x792 -> 2.0, 1224x1584).
  - Large page clamping (3000x4000 -> 0.75, long edge clamped to 3000).
  - Landscape orientation handling (normal and large).
  - Custom scale override.
  - Custom maxLongEdge override.
  - Zero and negative dimension safety.
  - `releaseCanvas` zeroing and null/undefined safety.
  - `createCanvas` dimensions.
  - `renderPdfPageToCanvas` viewport scaling, context/viewport args, `page.cleanup()` execution, and return structure.
  - `page.cleanup()` on async render rejection and synchronous throw.
  - `OcrFailedError` on missing 2D canvas context with cleanup.
- Mutation checks performed and verified failing:
  1. Break clamping in `computeRenderScale`: failed 4 tests with `AssertionError: expected 2 to be 0.75`.
  2. Break cleanup in `renderPdfPageToCanvas`: failed 5 tests with `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`.
  3. Break `releaseCanvas` zeroing: failed 1 test with `AssertionError: expected 1200 to be +0`.
- Verification results:
  - Unit tests: 222 passed across 28 files (was 208 across 27 files; +14 in `ocr-render.test.ts`).
  - Line coverage: All files 94.91%, `src/converters/**` 93.42%, `src/converters/ocr/render.ts` 92.10%, `src/converters/ocr/engine.ts` 95.45%, `src/core/**` 93.60% (85% gate).
  - E2E tests: 58 passed across chromium and mobile-chromium (20.4s).
  - Bundle size check: initial JS gzip 68,572 bytes / 256,000 bytes budget (14 lazy chunks).
  - Hygiene greps & traceability: clean.
- Next step: M6.4 PDF routing (per-page OCR vs text extraction).

### 2026-10-25 — M6.4 PDF routing (scanned and mixed page conversion, cancellation, empty document handling)

- Implemented in `src/converters/pdf.ts` and `src/converters/pdf/layout.ts`:
  - `layoutPages` updated to provide optional `pageMarkdowns?: string[]` returning per-page formatted text alongside combined markdown.
  - Fast-path for text PDFs: if `ocrIndices.length === 0`, skips OCR module imports entirely, bypassing Tesseract.js.
  - Truly empty PDF detection: if `charCount === 0` (no selectable text and no image ops), throws `NoTextFoundError('No text found in this PDF.')`.
  - Lazy OCR import: dynamically loads `createOcrEngine` and `renderPdfPageToCanvas`/`releaseCanvas` only when pages require OCR.
  - Mixed-document routing & page marker alignment: text pages formatted via layout engine, image pages rasterized and OCR'd; merged with `--- Page N ---` markers when `pdfPageMarkers: true`.
  - Low confidence warning: emits `OCR_LOW_CONFIDENCE` when mean confidence < 70% or total characters < 10.
  - AppShell cancellation: tracked via `abortControllersRef = useRef<Map<string, AbortController>>(new Map())`, wired into `ConvertContext.signal`, with "Cancel" button rendered in `.job-actions` during conversion. Immediate worker termination aborts in under 1 second.
- Unit & E2E tests:
  - Replaced stale blank-page scanned test with `throws NoTextFoundError for a blank-page PDF (no text and no images)` in `pdf.test.ts`.
  - Added unit tests for scanned PDF page OCR routing, mixed PDF routing with page markers, low confidence warning, whitespace-only OCR rejection (`NoTextFoundError`), and `CancelledError` propagation with cleanup.
  - Replaced stale E2E test with `shows no-text-found message for a blank PDF with no images` in `pdf.spec.ts`.
  - Added E2E tests for scanned PDF with zero external requests, mixed PDF conversion, and cancel in under 1 second.
- Mutation checks performed and verified failing:
  1. Break empty document check: failed unit test with `AssertionError: expected { markdown: '\n', warnings: [], …(1) } to be an instance of NoTextFoundError`.
  2. Break OCR routing condition: failed 4 unit tests (`routes a scanned PDF page with images to OCR`, `routes mixed PDF pages correctly`, `warns when OCR confidence is low`, `propagates CancelledError`).
  3. Break signal propagation during OCR: failed unit test with `AssertionError: promise resolved "{ …(3) }" instead of rejecting`.
- Verification results:
  - Unit tests: 227 passed across 28 files (all 16 tests in `pdf.test.ts` pass).
  - Line coverage: All files 94.75%, `src/converters/pdf.ts` 96.51%, `src/converters/ocr/engine.ts` 95.45%, `src/converters/ocr/render.ts` 92.10%, `src/converters/ocr/decide.ts` 100%, `src/converters/pdf/extract.ts` 100%, `src/converters/pdf/layout.ts` 100% (85% gate).
  - E2E tests: 64 passed across chromium and mobile-chromium (was 58; +6 tests from new scanned, mixed, and cancel tests across 2 projects).
  - Bundle size check: initial JS gzip 68,922 bytes / 256,000 bytes budget (18 lazy chunks; Tesseract chunk is `index-DatDqUtQ.js` 15.70 kB / 6.70 kB gzip, `engine-T_Z68q_j.js` 2.18 kB / 1.11 kB gzip, absent from initial bundle).
  - Traceability check: R007 updated to ✅ with passing unit and E2E references; R057 updated with fresh test names.
- Next step: M6.5 confidence warnings & post-OCR cleanup, M6.6 image file converter (`.png`, `.jpg`, `.webp`).

### 2026-10-25 — M6 completion: Image OCR, scaling bounds, progress UI, privacy & docs

- Implemented Image OCR Converter (`src/converters/image.ts`) supporting PNG, JPG/JPEG, WebP, BMP, and GIF:
  - Magic-number and extension-based detection integrated in `src/core/detect.ts` (`image` kind).
  - Registered in converter registry (`src/core/registry.ts`) and wired into pipeline (`src/core/pipeline.ts`).
  - DropZone accept list and UI supported formats updated in `src/app/AppShell.tsx`.
  - Image decoding via browser-native `createImageBitmap` with canvas fallback for SVG/unsupported bit depths.
  - Image dimensions bounded in `src/converters/ocr/render.ts`: downscales images wider than 3000px (clamping long edge to 3000px to bound memory to ~36 MB RGBA), and upscales small images (< 1000px 2× upscale) for enhanced OCR character recognition.
  - Strict canvas memory management: `releaseCanvas` zeroes width/height and calls `bitmap.close()` to guarantee prompt browser garbage collection.
- OCR Progress UI & Accessibility (`src/app/AppShell.tsx` and `src/styles/base.css`):
  - Accessible progress bar with `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.
  - Descriptive progress details rendered in job item: "Page X of Y" for multi-page documents or percent for single-page image files.
  - Working Cancel button wired to `AbortController` in job actions, terminating Tesseract worker in under 1 second.
  - Visible language limitation note (`.ocr-lang-notice`) informing users that OCR is currently English-only in v1 and additional languages are planned for future updates.
- OCR Confidence & Error Handling:
  - Mean confidence < 70 emits `OCR_LOW_CONFIDENCE` warning per REQUIREMENTS and PLAN §7.5.
  - Whitespace-only or empty OCR results throw `NoTextFoundError('No text found in this image.')`.
- Privacy & Offline Assurance:
  - Validated self-hosted OCR engine assets under `/public/ocr/` with strict CSP (`connect-src 'self'`, `worker-src 'self' blob:`).
  - E2E privacy tests in `tests/e2e/image.spec.ts` and `tests/e2e/pdf.spec.ts` assert zero non-same-origin network requests and zero CSP violations during image and PDF OCR conversions.
- Verification Results:
  - Unit tests: 252 passed across 31 files (vitest 5.0.5, 0 failed).
  - Line coverage: All files 94.13%, `src/converters/**` 93.9%, `src/converters/ocr/**` 89.88%, `src/converters/pdf/**` 100%, `src/core/**` 93.26% (85% gate).
  - E2E tests: 66 passed across chromium and mobile-chromium (19.9s).
  - Production build: initial JS gzip 69,450 bytes / 256,000 bytes budget (19 lazy chunks; pdfjs, SheetJS, and Tesseract.js strictly segregated in lazy chunks).
  - Traceability check: all 63 rows verified clean (`node scripts/check-traceability.mjs`, exit 0).
  - Hygiene: 0 absolute local paths, 0 unjustified skips or eslint-disable directives.
- Deferred from M6:
  - Non-English OCR languages (deferred to future milestone; English-first in v1 with UI notice).
  - Rotated pages (deferred; standard orientation handled).
  - Tables in scanned pages (deferred; sequential text layout extracted).
  - PDF embedded-image OCR on request (deferred; scanned pages and full image files converted).
