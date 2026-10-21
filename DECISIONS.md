# DECISIONS

## 2026-09-30 — Requirements path normalization

- **Context:** `PLAN.md` requires `docs/REQUIREMENTS.md` as the requirements source of truth, while the repository had `Requirements.md` at root.
- **Decision:** Moved the file to `docs/REQUIREMENTS.md` without changing content.
- **Consequences:** Plan and automation can consistently read requirements from a stable path.

## 2026-09-30 — M0 tooling baseline

- **Context:** The repository had no app scaffold or verification tooling required by M0.
- **Decision:** Added a Vite + React + TypeScript strict scaffold with ESLint, Prettier, Vitest, Playwright, and `scripts/verify.sh` as the initial gate.
- **Consequences:** We now have a deterministic baseline to grow milestone-by-milestone, with a single command to validate each iteration.

## 2026-09-30 — M1 initial vertical slice scope

- **Context:** M1 requires core engine pieces and an end-to-end vertical slice before broader format support.
- **Decision:** Implemented the first M1 slice for `txt/md/json/xml/code` only, with shared detection + converter registry and explicit unsupported-format messaging for all other kinds.
- **Consequences:** Core pipeline and tests are in place while keeping behavior honest; remaining M1 work focuses on queueing, cancellation/progress, and full detection matrix breadth.

## 2026-10-01 — Gate integrity for M2/M3

- **Context:** The prior working-tree gate used a global 60% threshold, had no standalone bundle or traceability validator, measured bundle output before rebuilding, and its hygiene expression matched the verifier itself and fixture text.
- **Decision:** `vitest.config.ts` includes only `src/core/**/*.ts` and `src/converters/**/*.ts` with an 85% line threshold. `scripts/check-bundle.mjs` runs after `npm run build`, measures only the HTML-referenced initial entry gzip against 250 KB, and rejects DOCX code in that entry. `scripts/check-traceability.mjs` validates every completed matrix row has an existing named test file. Hygiene scans all `src/` and test logic while excluding only `tests/fixtures/**`; `scripts/verify.sh` is outside the scanned paths.
- **Consequences:** The gate cannot pass by lowering thresholds or counting lazy converter chunks as initial payload. Open later-milestone rows remain visibly incomplete rather than being falsely marked done.

## 2026-10-01 — M2/M3 implementation details

- **Context:** The plan calls for an AST/token walk for plain text, semantic DOCX structure, strict CSP, and fixture-only dependencies kept out of the runtime bundle.
- **Decision:** `markdownToPlain()` uses Marked’s parsed token tree and recursively walks headings, inline tokens, lists, tables, code, and links; it does not strip Markdown with regular expressions. Mammoth HTML is converted through Turndown/GFM, while the test-only `docx` generator is a devDependency; runtime conversion remains Mammoth. Vite disables asset inlining so self-hosted fonts remain same-origin under the strict CSP.
- **Consequences:** Plain output preserves code and link destinations, DOCX tables/lists/footnotes are testable as Markdown, and the initial entry does not contain fixture or DOCX conversion code.

## 2026-10-01 — M2 browser assertion correction

- **Context:** The toast behavior was correct, but a Playwright `role=status` name query treated visible text as an accessible name and failed to locate the live region. The large-output test also queried the main Copy button without scoping it away from per-chunk buttons.
- **Decision:** Keep the existing `aria-live="polite"` toast behavior; assert its visible text and scope the main Copy query to the output article. Unique per-chunk accessible names make each chunk action independently addressable.
- **Consequences:** The tests now verify behavior without changing a valid toast implementation or weakening the copy assertions.

## 2026-10-19 — Vendored SheetJS tarball for XLSX/XLS/CSV

- Context: the `xlsx` package on the npm registry is stale and vulnerable; exceljs cannot read legacy .xls. The dev machine's npm 12 refuses remote-URL dependencies (allow-remote = none, error EALLOWREMOTE).
- Decision: commit the official tarball from https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz as vendor/xlsx-0.20.3.tgz and depend on it via "file:vendor/xlsx-0.20.3.tgz". sha512: a0b0eade3c3b01c2ea2961f60210a9553665f267fa5f661178ff8d7a1d12254cd5fc1759623b61f78b46e6da22301d4f3eb62dc4e09f6a850292fb6e1fedc024
- Consequences: installs need no network for this package; upgrade by replacing the tarball and the hash. The converter must lazy-load the library.

## 2026-10-20 — CSV uses a custom RFC-4180 parser; SheetJS coerces types

- Context: `src/converters/csv.ts` could have reused the already-vendored SheetJS library for CSV/TSV parsing instead of shipping a second parser. Requirements mandate that CSV values stay EXACTLY as written in the source file.
- Decision: CSV/TSV keeps its own RFC-4180-style parser (quoted fields, `""` and `\"` escapes, newlines inside quotes, BOM/windows-1252 via `decodeText`, delimiter sniffing for tab/semicolon/comma, TSV forced by `.tsv` filename or MIME). SheetJS remains XLSX/XLS-only.
- Reason (demonstrated by a 10-line spike with `XLSX.read(csv, {type:'string'})` on `id,val\n007,1e3\n" spaced ",x`; spike not committed):
  - `sheet_to_json: [{"id":7,"val":1000},{"id":" spaced ","val":"x"}]`
  - `A2 cell: n 7` — SheetJS turned `007` into the number `7`, losing the leading zeros
  - `B2 cell: n 1000` — `1e3` became `1000`, changing the exact source text
  - SheetJS also does not preserve leading/trailing spaces inside quoted cells.
- Consequences: CSV output preserves source text exactly (`007`, `1e3`, quoted spacing, quoted quotes); XLSX/XLS keep SheetJS type/date/merge handling. The custom parser is covered by exact-string unit tests including BOM, windows-1252, semicolon and TSV routing.

## 2026-10-20 — pdfjs-dist chosen; worker self-hosted via ?url; CSP worker-src added

- Context: M5 needs a text-extraction library that works in the browser without a backend. Correction to the title: `worker-src 'self' blob:` was **already present and byte-identical** in `index.html`, `_headers` and `vercel.json` (verified by grep before installing anything), so nothing was added to the CSP; the entry records that the requirement is satisfied and that the policy was left untouched rather than changed.
- Decision: use **pdfjs-dist 6.4.299** (installed from the npm registry as a regular dependency) with pdfjs's **legacy build** (`pdfjs-dist/legacy/build/pdf.mjs`) wherever a non-browser environment needs it, and **pdf-lib 1.17.1** as a devDependency to generate PDF fixtures in tests and spikes. `src/converters/pdf/worker.ts` exports a single async `getPdfjs()` that (a) lazily `import('pdfjs-dist')` — pdfjs must never be a top-level import of anything in the initial bundle — and (b) sets `GlobalWorkerOptions.workerSrc` to the self-hosted asset from `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (file name confirmed by listing `node_modules/pdfjs-dist/build/`; no CDN anywhere).
- Evidence (spike at /tmp/pdf-spike.mjs, not committed): a 2-page pdf-lib document loads via `getDocument({ data })` in Node, `getTextContent()` items expose `{str, transform[4]=x, transform[5]=y, height (== font size), width, fontName, hasEOL}` plus empty spacer items with `str:""`/`hasEOL:true`; non-PDF bytes reject with `InvalidPDFException: Invalid PDF structure.`; v6 has no `pdf.destroy()` — use `loadingTask.destroy()`.
- Consequences: PDF extraction (M5.2) can be built on a stable, self-hosted worker under the existing CSP. The real pdfjs module loads fine under vitest/jsdom (it prints "Please use the `legacy` build in Node.js environments." there — harmless for a library-loading test), so the worker unit test needs no mocks. Nothing imports `worker.ts` yet, so Vite currently emits no pdfjs chunk; the extraction converter in M5.2 is what pulls it in lazily.

## 2026-10-21 — M5.2 layout thresholds, byte-copy extraction, scanned heuristic

- Context: M5.2 turns pdf.js text items into markdown. Every threshold is a judgement call, so each one is pinned as a NAMED CONSTANT at the top of `src/converters/pdf/layout.ts` and justified against numbers measured by the M5.1 spike (`/tmp/pdf-spike.mjs`) rather than guessed.
- Decision (thresholds and their measured basis):
  - **`SAME_LINE_Y_TOLERANCE = 0.3`** — two items share a line when `|y1 − y2| ≤ 0.3 × max(height1, height2)`. The spike showed baselines within one line effectively share y (drift well under a point), while consecutive baselines of one paragraph are **16–18 pt apart** (1.3–1.5× a 12 pt font); 0.3 × 12 = 3.6 pt sits safely between the two populations.
  - **`PARAGRAPH_GAP_FACTOR = 1.7`** — lines join into one paragraph when baseline distance `≤ 1.7 × previous line height`. Measured: intra-paragraph **16–18 pt** vs paragraph gaps **34–50 pt** (2.8× or more). 1.7 lands in the empty band between 1.5× and 2.8×, so both sides have ≥ 1.1× headroom.
  - **`SPACE_GAP_FACTOR = 0.2`** — insert exactly one space between items when `next.x − (prev.x + prev.width) > 0.2 × line height`, never next to an existing space. Word gaps are far smaller than a line height; glyph gaps are ~0, so 0.2× separates "adjacent glyphs" from "separate words" without inventing double spaces.
  - **`HEADING_SIZE_FACTOR = 1.2` / `HEADING_MAX_CHARS = 120`** — a line is a heading when `height ≥ 1.2 ×` the length-weighted median font size, its text is < 120 chars, and it is not a list item. The spike measured title **24 pt** vs body **12 pt**: the weighted median over all pages is 12 (body dominates by width), so 1.2 × 12 = 14.4 cleanly admits the title and rejects body lines, while short bold-ish body lines at ~1.0× stay out. Distinct heading heights are ranked descending → `# `, `## `, `### `, smaller than third stays `### `.
  - **Length-weighted median** (each item contributes `round(width)` copies) — a lone 24 pt title on an otherwise 12 pt document must not drag the median up; weighting by width makes the answer reflect what the reader actually sees.
  - **`hasEOL` is deliberately UNUSED** — the spike caught a title line with `hasEOL:false`, proving it unreliable. Lines are grouped by y; paragraph/list boundaries use the distance thresholds above.
  - **De-hyphenation** only when a joined line ends with `letter + "-"` and the next starts with a lowercase letter; never applied to list items (a `- ` bullet would otherwise be mangled).
  - **Pages joined by a blank line**; no page markers and no header/footer removal in M5.2 (both deferred to M5.3 with the table heuristic, bold detection, and 500+ page batching).
- Decision (extraction mechanics): `extractPageItems` ALWAYS hands pdfjs `new Uint8Array(bytes.slice(0))` because pdfjs may transfer/detach the ArrayBuffer it is given — the caller's bytes stay intact for a future OCR fallback (regression-tested by asserting byte-identity after extraction). Cleanup is `loadingTask.destroy()` in a `finally` block (v6 `PDFDocumentProxy` has no `destroy()`), `page.cleanup()` per page, `ctx.signal` checked between pages (→ `CancelledError`), progress reported per page as `{phase:'pdf', current, total}`. A `PdfjsLike` interface (only `getDocument`) is the seam that lets tests inject both a fake and the real Node build.
- Decision (scanned heuristic): `SCANNED_CHARS_PER_PAGE = 20`; `charCount < 20 × numPages` (including 0) throws typed `ScannedPdfError` ("This PDF looks scanned (no selectable text). OCR support is not available yet.", returned as-is by `errorMessage`). Why 20/page: a real text page carries hundreds of non-whitespace chars (the golden fixture alone is ~250/page), so 20 is ~10× below any genuine text page while still tolerating sparse title-only pages; a pure image PDF yields 0, far below the bar. `PasswordException` → `PasswordRequiredError`; `InvalidPDFException`/anything else and zero-byte input → `CorruptFileError` (zero-byte is rejected before pdfjs is even loaded).
- Consequences: all layout rules are unit-testable without pdfjs (synthetic item arrays — required because the pdf-lib fixture produces one item per line while real PDFs produce many per line), thresholds can be tuned in one place with their evidence attached, and M5.3 owns the deferred list. Stale-test note: registering `pdf` made `tests/unit/core/registry-more.test.ts`::rejects unregistered kinds fail (it used `'pdf'` as its unregistered example); per explicit instruction the test was left untouched and the unit suite reports 1 failing / 164 passing rather than being edited.

## 2026-10-21 — Finding: pdfjs standardFontDataUrl warning in Node (no impact observed in browser)

- Context: during `tests/unit/converters/pdf.test.ts` (Node environment, legacy build), pdfjs prints `Warning: UnknownErrorException: Ensure that the 'standardFontDataUrl' API parameter is provided.` when laying out the Helvetica fixture. It did not fail any test and did not change extracted text (standard-font metrics are only needed for canvas rendering/glyph widths edge cases).
- Observation from the browser e2e: `tests/e2e/pdf.spec.ts` records all console errors/CSP-violation messages during a real PDF conversion and asserts the list is empty — it passed on chromium and mobile-chromium, i.e. no failed worker, cmap, wasm, or font fetches appeared for text-based Latin PDFs under the current CSP.
- Decision: do NOT work around it with remote URLs (a CDN fetch would violate the CSP and the no-third-party rule anyway) and do NOT loosen the CSP. Record it as a finding: **non-Latin/CJK PDFs will likely need self-hosted `cmap`/`standardFontDataUrl` data later** (served same-origin from `public/`, opt-in, only when a document actually needs it).
- Consequences: text extraction for typical (Latin, embedded-font) PDFs is unaffected today; the M6/M10 sweep should add a non-Latin fixture and, if its rendering path complains, bundle the small data files locally.
