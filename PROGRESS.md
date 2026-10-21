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
  - ✅ M4.3 — CSV/TSV converter (`src/converters/csv.ts`, custom RFC-4180 parser — SheetJS coerces `007`→`7` and `1e3`→`1000`, see DECISIONS.md 2026-10-20): quoted fields preserved exactly (`007`, `1e3`, leading/trailing spaces), `\"\"`/`\\\"` escapes, newlines in quotes → `<br>`, pipes → `\\|`, TSV by `.tsv` filename or MIME, semicolon/comma/tab sniffing, UTF-8 BOM stripped, windows-1252 fallback with warning. Verified by 23 named tests in `tests/unit/converters/csv.test.ts`
  - ✅ M4.4 — Register + detect: `csv` registered in `src/core/registry.ts`; `csv` + `xlsx` added to `src/core/pipeline.ts` supported kinds (previously unreachable from the app); detect already maps `.csv/.tsv` → `csv` and `.xlsx/.xls/.xlsm` → `xlsx`. Verified by `tests/unit/core/registry-more.test.ts`::detects csv/tsv files and routes them to the csv converter and `tests/unit/core/pipeline.test.ts`::converts a File named a.csv into the exact markdown table
  - ✅ M4.5 — UI accept-list + e2e: DropZone file input `accept` list and "supported formats" text now include csv, tsv, xlsx, xls, xlsm (`src/app/AppShell.tsx`); browser e2e uploads a generated `.csv` and asserts the rendered table — `tests/e2e/csv.spec.ts`::uploads a generated csv and renders the table in the output panel (passes on chromium and mobile-chromium)
  - ✅ M4.6 — Browser XLSX upload e2e + zip-detection fix: `tests/e2e/xlsx.spec.ts`::uploads a generated xlsx and renders the sheet table in the output panel generates a workbook with SheetJS inside the test and asserts `## Sheet: Budget` plus the exact `| Item | Amount |` header row. The first run exposed a pre-existing bug: SheetJS writes `xl/workbook.xml` ~11 KB into a minimal workbook, past detect's first-4096-byte sample, so real uploads classified as `zip` → "Unsupported format". `src/core/detect.ts` now also reads entry names from the zip central directory (located via the end-of-central-directory record, bounded search); regression tests in `tests/unit/core/detect-zip.test.ts`, including a real SheetJS buffer with a misleading `.bin` name
- 🟨 M5 — PDF (text)
  - ✅ M5.1 — Library + self-hosted worker setup: **pdfjs-dist 6.4.299** (registry dependency) and **pdf-lib 1.17.1** (devDependency, test/spike fixtures). `src/converters/pdf/worker.ts` lazily `import('pdfjs-dist')` — pdfjs must never be a top-level import of anything in the initial bundle — and sets `GlobalWorkerOptions.workerSrc` from `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (file name confirmed by listing `node_modules/pdfjs-dist/build/`; no CDN). CSP `worker-src 'self' blob:` was already present and byte-identical in `index.html`, `_headers` and `vercel.json` (verified by grep before install) — no CSP change was needed. Verified by `tests/unit/converters/pdf-worker.test.ts`::points GlobalWorkerOptions at the self-hosted worker asset and `tests/unit/converters/pdf-worker.test.ts`::caches the configured module across calls; spike evidence in DECISIONS.md 2026-10-20
  - ✅ M5.2 — Text extraction for text-based PDFs, end to end (this supersedes the old M5.2–M5.6 split: scanned detection, typed errors, extraction tests, registration, and the upload e2e all landed in this milestone's four commits):
    - **Layout** `src/converters/pdf/layout.ts` — pure module (no pdfjs import, no UI) with every threshold as a named constant: same-line grouping `|Δy| ≤ 0.3 × max height`, space insertion `gap > 0.2 × line height` (never double spaces), paragraphs join when baseline distance `≤ 1.7 × line height`, headings `≥ 1.2 ×` the length-weighted median font size and `< 120 chars` ranked into `# `/`## `/`### `, bullets/`1. `/`a) ` normalised as tight list blocks, de-hyphenation across line breaks, pages joined by a blank line. Verified by 11 tests in `tests/unit/converters/pdf-layout.test.ts` including the exact golden markdown (`matches the golden two-page markdown`)
    - **Extraction** `src/converters/pdf/extract.ts` — `PdfjsLike` seam; ALWAYS passes `new Uint8Array(bytes.slice(0))` (pdfjs may detach the buffer; originals stay intact for a future OCR fallback); `CancelledError` checked between pages; `ctx.onProgress({ phase: 'pdf', current, total })` per page; `page.cleanup()` per page; `loadingTask.destroy()` in `finally` (pdfjs v6 has no `PDFDocumentProxy.destroy()`)
    - **Converter + scanned detection** `src/converters/pdf.ts` — `getPdfjs()` → `extractPageItems` → `layoutPagesToMarkdown` → `normalizeMarkdown`; `SCANNED_CHARS_PER_PAGE = 20` so `charCount < 20 × numPages` (including 0) throws the new typed `ScannedPdfError` ("This PDF looks scanned (no selectable text). OCR support is not available yet.", mapped in `errorMessage`); `PasswordException` → `PasswordRequiredError`; `InvalidPDFException`/anything else and zero-byte input → `CorruptFileError`. Verified by 8 tests in `tests/unit/converters/pdf.test.ts` through the real legacy build (`@vitest-environment node`)
    - **Register** `pdf` added to `src/core/registry.ts` (lazy entry) and `src/core/pipeline.ts` supported kinds + unsupported-format message; detect already returned `pdf` from the `%PDF-` signature
    - **UI** `.pdf`/`application/pdf` in the DropZone `accept` list and `pdf` in the supported-formats line (`src/app/AppShell.tsx`)
    - **E2E** `tests/e2e/pdf.spec.ts`::uploads a generated PDF and renders the markdown output (asserts `# Quarterly Budget Review` + `- Rent 1200`, fails on any console/CSP error) and `tests/e2e/pdf.spec.ts`::shows the scanned-PDF message for a blank PDF — chromium + mobile-chromium
    - Full pasted evidence in the 2026-10-21 log entry below
  - ⬜ M5.3 — Extraction refinements **deferred from M5.2**: header/footer (repeating text) removal, page-markers setting wiring, table heuristic, bold detection, 500+ page batching with progress and UI-thread yielding
- ⬜ M6 — OCR (scanned PDF + images)
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

## Closure evidence (refreshed 2026-10-21)

Current runnable evidence (2026-10-21, supersedes the 2026-10-20 numbers): **164 of 165 unit tests pass** (24 files) — the single failure is `tests/unit/core/registry-more.test.ts`::rejects unregistered kinds, which uses `'pdf'` as its example of an _unregistered_ kind; registering `pdf` necessarily resolves that promise, the test was **not** edited (rule: never edit existing tests to make them pass), and the red state was accepted explicitly (see DECISIONS.md 2026-10-21 and the log entry below). **52 Chromium/mobile-Chromium E2E tests passed**; coverage `src/core` **93.1%** lines and `src/converters` **92.8%** lines (85% gate, no threshold errors; `src/converters/pdf` **100%** lines); initial JS entry **68,060 bytes gzip** of 256,000 budget with 14 lazy chunks. pdfjs is proven lazy in the committed tree: the registry's `pdf` entry pulls `src/converters/pdf.ts`, which emits `pdf-*.js` as its own chunk (483.74 kB │ gzip 144.43 kB) plus the self-hosted worker asset `pdf.worker.min-*.mjs` (1,264.34 kB), with initial gzip unchanged at ~68 KB.

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
- Known red test, accepted explicitly: `tests/unit/core/registry-more.test.ts`::rejects unregistered kinds asserts `loadConverter('pdf')` rejects, using `'pdf'` as its unregistered example — registering pdf necessarily breaks that assertion. Per instruction the test was left untouched and the suite is reported red (1 failing) rather than edited.
- Verification evidence (2026-10-21):
  - `npm run lint` → `LINT_EXIT=0`; `npm run typecheck` → `TSC_EXIT=0`.
  - `npm run test:unit` → `Test Files 1 failed | 23 passed (24)`, `Tests 1 failed | 164 passed (165)` — only the stale registry assertion above. `TZ=Asia/Kolkata npm run test:unit` → identical `1 failed | 164 passed`.
  - `npm run test:unit -- --coverage` (with `reportOnFailure`) → `src/core` **93.1%** lines, `src/converters` **92.8%** lines, `src/converters/pdf` **100%** lines, `pdf.ts` 100% — no coverage-threshold errors (exit 1 is the known red test).
  - `npm run build` → `BUILD_EXIT=0`; `node scripts/check-bundle.mjs` → `Initial JavaScript gzip: 68060 bytes / 256000 bytes`, `Lazy JavaScript chunks: 14`, `BUNDLE_EXIT=0`; build output shows pdfjs in its own lazy chunk `pdf-BtCWNl9F.js 483.74 kB │ gzip: 144.43 kB` plus `pdf.worker.min-*.mjs 1,264.34 kB`, initial entry `index-*.js gzip: 68.06 kB`.
  - `npx playwright test --project=chromium --project=mobile-chromium` → **`52 passed (14.7s)`**, `E2E_EXIT=0` (48 was + pdf spec × 2 projects). The golden-upload test also asserts zero console errors/CSP violations during a real PDF conversion — none observed; no cmap/wasm/font fetch failures appeared (a Node-only `standardFontDataUrl` warning is recorded as a DECISIONS.md finding).
  - `node scripts/check-traceability.mjs` → `Traceability checked: 61 rows; completed rows have test files.`, `TRACE_EXIT=0` (re-run after this docs commit).
- Deferred from M5.2 to M5.3 (explicitly out of scope): header/footer removal, page-markers setting wiring, table heuristic, bold detection, 500+ page batching with progress and UI-thread yielding.
- Blockers: mobile-webkit e2e still cannot launch on this machine (`libicudata.so.74` missing; no apt) — accepted per docs/AGENT_PROMPT.md; `format:check` still fails on the pre-existing baseline files (needs its own `chore:` commit).
