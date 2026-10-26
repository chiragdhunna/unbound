> **HISTORICAL — superseded.** Historical continuation prompt from an earlier milestone. The project has moved on; see AGENTS.md, PLAN.md, and docs/REQUIREMENTS.md for current guidance.

# UNBOUND — CONTINUATION PROMPT (paste this whole file into your coding agent)

You are a careful senior engineer continuing an existing project called **Unbound**
(repo: https://github.com/chiragdhunna/unbound). It is a **client-side file-to-Markdown/plain-text
converter** so users can paste huge documents into ChatGPT/Claude/Gemini/Grok instead of attaching files.

Your job: **finish the project to the v1 requirements in `docs/REQUIREMENTS.md`**, one small verified
step at a time, committing and pushing to the remote after every step.

Read this entire prompt before doing anything. Follow it literally. If a rule here conflicts with your
instincts, follow the rule.

---

## PART 0 — NON-NEGOTIABLE RULES

1. **One step at a time.** Do exactly one sub-step (a numbered item below), verify it, commit, push, then
   move to the next. Never batch several sub-steps into one commit.
2. **Never claim something works without proof.** "Works" means you ran the command and saw it pass.
   Paste the real command output (last ~20 lines) into your reply and into `PROGRESS.md`.
3. **Never weaken tests to get green.** Do not delete tests, add `.skip`/`.only`, loosen assertions, lower
   coverage thresholds, or disable lint rules. If a test is wrong, explain why in `DECISIONS.md`, then fix it
   properly.
4. **Full-file replacements.** When you change a file, output and write the **entire new file**, not a diff
   or a fragment. Keep all existing exports/behavior unless the step says to change them.
5. **Fix root causes, not symptoms.** If a bug appears, find the systematic cause (wrong abstraction, missing
   validation in the shared pipeline) and fix it there once, instead of patching individual outputs.
6. **Do not invent APIs.** Before using any library function, open
   `node_modules/<pkg>/package.json` and its `.d.ts` types (or README) to confirm the exact function names
   and signatures. If unsure, write a 10-line spike test first.
7. **Privacy is a hard requirement.** All conversion runs in the browser. **No file content may ever be sent
   to any server.** No analytics, no remote fonts, no CDN scripts, no remote worker/wasm/language-data
   downloads (see CSP in `index.html`, `_headers`, `vercel.json`). Everything must be bundled/self-hosted.
7b. **Do not add a backend** unless `DECISIONS.md` explicitly approves one. PPTX must be client-side
   (see M7).
8. **Match the existing code style.** Before writing a new converter, read `src/core/types.ts`,
   `src/core/errors.ts`, `src/core/registry.ts`, `src/core/detect.ts`, and `src/converters/docx.ts` and
   copy the same patterns exactly (typed errors, warnings, return shape, registration).
9. **Keep the initial bundle small.** Heavy libs (pdfjs, tesseract, xlsx, jszip) MUST be loaded with dynamic
   `import()` only when that file type is actually used. The repo has a post-build initial-entry gzip check;
   it must keep passing.
10. **Stop conditions.** If you fail on the same error 3 times: stop, write the blocker into
    `PROGRESS.md` under "Blockers" (what you tried, exact error text), commit + push that note, then move to
    the next independent sub-step or stop and report. Do not loop forever and do not fake progress.

---

## PART 1 — SESSION START CHECKLIST (do this at the start of EVERY session)

Run and read, in this order:

```bash
git branch --show-current
git status
git pull --rebase origin $(git branch --show-current)
git log --oneline -15
cat AGENTS.md PLAN.md DECISIONS.md PROGRESS.md docs/REQUIREMENTS.md docs/TRACEABILITY.md
ls src src/core src/converters src/app tests tests/unit tests/e2e scripts
npm ci
npm run verify
```

Then:
- Write down (in your reply) the **first unchecked item** in `PROGRESS.md`. That is where you resume.
- If `npm run verify` fails **before you change anything**, fixing that is your first task (commit it as
  `fix: restore green baseline`).
- If `README.md` "Current status" disagrees with `PROGRESS.md`, trust the **code + test results**, then fix the
  docs at the end of the next milestone.

---

## PART 2 — CURRENT STATE (as of 2026-10-18, from README/PROGRESS/package.json)

Done and verified (per PROGRESS.md):
- M0 scaffold: Vite + React 18 + strict TypeScript, ESLint, Prettier, Vitest, Playwright, CI, `scripts/verify.sh`.
- M1 core engine: types, typed errors, detection (signatures + extensions), converter registry,
  text/json/xml/code/markdown converters.
- M2 app shell: DropZone, JobList, OutputPanel, counters, markdown/plain toggle, copy (+ textarea fallback),
  download, batch separate/combine, chunking with per-chunk copy + sequential copy, CSP, privacy footer,
  persisted settings.
- M3 DOCX (via Mammoth): converter + unit tests + e2e.

NOT done (all still ⬜ in PROGRESS.md): M4 XLSX/XLS/CSV, M5 PDF text, M6 OCR (scanned PDF + images),
M7 PPTX, M8 RTF/HTML/URL, M9 EPUB/ZIP/folders, M10 edge cases, M11 a11y/mobile/perf/privacy hardening,
M12 docs/deploy/final audit.

Known open items inside "done" milestones:
- M3 leftover: negative-path coverage for legacy `.doc` (OLE2) and password-protected docx, full image/footnote
  handling per PLAN.md.
- M2 line "Full browser-level keyboard/accessibility matrix and the full plan-specified chunking semantics" is
  marked ✅ but is vague — re-verify it in M11 against PLAN.md.
- PROGRESS.md has an EMPTY heading "2026-10-01 — M2/M3 closure evidence". Fill it or delete it (docs commit).
- WebKit Playwright project cannot launch on the dev host (`libicudata.so.74` missing). Do NOT remove it. Make
  sure CI (ubuntu-24.04) installs it with `npx playwright install --with-deps webkit chromium` and runs it.
- `package.json` currently has NO pdfjs-dist, xlsx/SheetJS, tesseract.js, jszip, or readability dependency.
  They must be added in the milestones below.

---

## PART 3 — THE DEFINITION OF DONE (from docs/REQUIREMENTS.md)

The project is complete only when ALL of these are true:

File types
- P0: PDF text, PDF scanned (OCR fallback with auto-detection), DOCX, PPTX, XLSX/CSV, TXT/MD → work.
- P1: images (OCR), RTF, HTML file, URL → work.
- P2: JSON/XML/code, EPUB, ZIP + folders → work.

Functional (section 5)
- Drag-drop + browse, multi-file, friendly "unsupported format" error.
- Detect type by **extension + MIME + magic bytes**, not extension alone.
- Markdown default; plain-text toggle.
- OCR: progress indicator + low-confidence warning.
- Multi-sheet → `## Sheet: <name>`; multi-slide → `## Slide N`.
- Output panel, **one-click copy**, live char/word/token counts, auto-chunk above a configurable threshold
  with "Part X of Y" + per-chunk copy, download as .md/.txt.
- Batch: separate by default + "combine all" option.

Privacy (5.4): client-side only; UI states clearly what happens; nothing persisted/uploaded.

Usability (5.5): upload → convert → copy in ≤3 steps; no login; good on mobile.

Non-functional (6): typical doc (<20 pages/10 MB) converts in <5 s for text formats; graceful failure with clear
errors; no LLM-provider coupling; keyboard + screen-reader accessible.

Edge cases (9): password-protected PDF/DOCX/PPTX/XLSX, corrupted files, huge files (warn), embedded-image text
(warn), non-English text/OCR, files with no extractable text ("no text found").

Design: dark terminal look, amber/gold accents, JetBrains Mono / IBM Plex Mono (already in deps; keep it).

---

## PART 4 — GIT PROTOCOL (follow after EVERY sub-step)

Use this exact loop. No exceptions.

```bash
# 1. Verify the sub-step (all must pass)
npm run typecheck
npm run lint
npm run format:check      # if it fails: npx prettier --write <the files you changed>, then re-run
npm run test:unit
# (run e2e when the sub-step touches UI or an upload flow)
npm run test:e2e -- --project=chromium --project=mobile-chromium
# (run the full gate before the LAST commit of a milestone)
npm run verify

# 2. Stage ONLY the files you intentionally changed
git status
git add <file1> <file2> ...        # NEVER `git add .` or `git add -A` blindly
git diff --cached --stat           # confirm: no node_modules, dist, coverage, test-results, playwright-report, .env

# 3. Commit with a Conventional Commit message (see list below)
git commit -m "feat(xlsx): add SheetJS converter with multi-sheet markdown tables"

# 4. Push immediately
git push origin HEAD

# 5. Confirm and report
git log -1 --stat
git status
```

If `git push` is rejected:
```bash
git pull --rebase origin $(git branch --show-current)
npm run typecheck && npm run lint && npm run test:unit   # re-verify after rebase
git push origin HEAD
```
**Never use `--force` or `--force-with-lease`.** If the rebase has conflicts you cannot resolve confidently,
stop and report the conflicting files. If the branch is protected and push is refused, create
`feat/complete-v1`, push that branch (`git push -u origin feat/complete-v1`), keep working there, and tell the
user.

Commit message prefixes: `feat(scope):`, `fix(scope):`, `test(scope):`, `docs:`, `chore:`, `ci:`, `refactor(scope):`.
Scopes: `core`, `detect`, `ui`, `xlsx`, `pdf`, `ocr`, `pptx`, `rtf`, `html`, `url`, `epub`, `zip`, `a11y`, `perf`, `privacy`.

**Commit cadence per milestone (typical):**
1. `chore(<scope>): add <dependency>` (package.json + package-lock.json only)
2. `test(<scope>): add fixtures and failing tests` (optional if tests and impl are small — then combine in 3)
3. `feat(<scope>): implement converter`
4. `feat(<scope>): register converter + detection + UI wiring`
5. `test(<scope>): add e2e upload test`
6. `docs: update PROGRESS.md, TRACEABILITY.md, DECISIONS.md, README for <milestone>`

Each of those is its own commit and its own push. Every commit must leave the repo green
(typecheck + lint + unit tests passing).

---

## PART 5 — THE GENERIC RECIPE FOR EVERY CONVERTER (use for M3–M9)

For each new format, do these in order:

1. **Read** the template: `src/converters/docx.ts` and its test `tests/unit/converters/docx.test.ts`.
2. **Install** the dependency (commit separately). Check the package's types.
3. **Create fixtures programmatically** in the test (generate the file bytes in code, like the DOCX tests do
   with the `docx` package) or add tiny binary fixtures under `tests/fixtures/` (keep each < 50 KB).
   Never download fixtures from the internet.
4. **Write failing unit tests first** (happy path, multi-section structure, empty file, corrupted file,
   password-protected if applicable, warnings).
5. **Implement** `src/converters/<format>.ts` following the same function signature as the other converters.
   Return Markdown; the shared pipeline produces plain text from it (do not write a second code path).
6. **Typed errors only.** Use the error classes in `src/core/errors.ts` (add new codes there if needed, with a
   user-friendly message). Never `throw new Error('...')` from a converter and never swallow errors silently.
7. **Register** it in the registry and add detection rules in `src/core/detect.ts` (extension + MIME + magic
   bytes). Add detection unit tests.
8. **Lazy-load** the heavy library with `await import('...')` inside the converter.
9. **UI wiring:** make sure the DropZone `accept` list, the "supported formats" text, and error cards cover it.
10. **E2E:** add a Playwright spec that uploads a generated file and asserts the output panel text and counters.
11. **Docs:** tick items in `PROGRESS.md` (with pasted evidence), add a row in `docs/TRACEABILITY.md`, record
    decisions in `DECISIONS.md`.

---

## PART 6 — MILESTONES TO COMPLETE (in this order)

### M3 — finish DOCX (small)
- 3.1 Add unit tests: legacy `.doc` (OLE2 header `D0 CF 11 E0 A1 B1 1A E1`) gives a clear "legacy .doc not
  supported, save as .docx" typed error; password-protected docx (OLE2 wrapper around encrypted package) gives the
  "password-protected" error.
- 3.2 Handle footnotes/endnotes (append as `## Footnotes` list) and images (emit a single warning
  "N embedded images were not converted" — no base64 in output). Add tests.
- 3.3 Docs commit: tick M3 fully in `PROGRESS.md`.

### M4 — XLSX / XLS / CSV
Library: **SheetJS**. IMPORTANT: the `xlsx` package on the npm registry is an old, vulnerable version
(0.18.5). Install the maintained build from SheetJS's own server by following
https://docs.sheetjs.com/docs/getting-started/installation/nodejs (a `.tgz` URL dependency). If the network is
blocked, record that in `DECISIONS.md` and, as a last resort, use `xlsx@0.18.5` with a documented risk note —
but ask the user first. Do not parse untrusted workbooks with formulas evaluated.
- 4.1 Install dep (separate commit).
- 4.2 Converter rules:
  - One `## Sheet: <name>` section per worksheet, in workbook order; skip fully empty sheets (warn).
  - Convert each sheet to a **GFM markdown table**: first non-empty row = header; escape `|` as `\|`; replace
    newlines in cells with `<br>`; trim trailing empty columns/rows; empty header cell → `Column N`.
  - Dates must render as ISO `YYYY-MM-DD` (use `cellDates: true` and format), numbers as displayed text
    (`raw: false`) so percentages/currencies look right.
  - Merged cells: repeat value only in the top-left cell; add a warning that merged cells exist.
  - Hidden sheets: include but label `(hidden)`.
  - Very wide/tall sheets: no truncation in output, but chunking must repeat the table header (chunker already
    does this — verify with a test).
  - Password-protected → typed "password-protected" error. `.xls` supported through the same library.
  - **CSV/TSV:** parse with SheetJS too (or a small RFC-4180 parser), handle quoted commas/newlines and
    UTF-8 BOM, output as a table under `## Sheet: <filename>`.
- 4.3 Tests: multi-sheet, merged cells, dates, pipes in cells, empty sheet, csv with quotes, corrupted file.
- 4.4 Register + detect (`.xlsx`, `.xls`, `.xlsm`, `.csv`, `.tsv`; ZIP magic `50 4B 03 04` + `xl/` entry for xlsx;
  OLE2 magic for xls).
- 4.5 E2E upload test, then docs commit.

### M5 — PDF (text-based)
Library: **pdfjs-dist** (use the version compatible with Vite; check its README for the Vite worker setup).
Self-host the worker via `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (verify the exact path
in `node_modules`). **No CDN worker.** Make sure CSP allows the worker (`worker-src 'self' blob:`) and update
`index.html`, `_headers`, `vercel.json` consistently.
- 5.1 Install dep (separate commit). Add the worker setup in one module `src/converters/pdf/worker.ts`.
- 5.2 Extraction algorithm (`src/converters/pdf/text.ts`):
  - For each page, `getTextContent()`; group items into lines by their Y coordinate (tolerance ≈ 2–3 pt),
    sort lines top-to-bottom, items left-to-right; join with a space when the horizontal gap > ~1 char width.
  - Detect paragraph breaks from vertical gaps larger than ~1.5× the median line height.
  - **Heading detection:** compute the median font size over the document; lines whose font size ≥ 1.2× median
    and are short (< 120 chars) become `#`/`##`/`###` by relative size rank. Bold/short ALL-CAPS lines may become
    `###`. Keep this heuristic in ONE well-tested function.
  - List detection: lines starting with `•`, `-`, `–`, `*`, `1.`, `1)`, `a)` → markdown list items.
  - De-hyphenate words broken across lines (`exam-\nple` → `example`) only when the next line starts lowercase.
  - Remove repeated headers/footers (same text on > 60% of pages in the top/bottom 8% band) and page numbers;
    add a warning when something was removed.
  - Separate pages with a blank line and an HTML comment-free marker `---` plus `Page N` only if the user setting
    "page markers" is enabled (default off). Add that setting to the persisted settings.
  - Optional simple table heuristic: if ≥ 3 consecutive lines share aligned column X-positions, emit a markdown
    table; otherwise leave as text. Do not over-engineer; correctness over cleverness.
- 5.3 Scanned detection (`isScannedPdf`): if extracted non-whitespace chars per page < 20 on average (or > 70%
  of pages are below that), return a typed signal `NeedsOcr` so M6 can take over. Until M6 exists, show a clear
  "This looks like a scanned PDF — OCR coming" error card; after M6 it routes automatically.
- 5.4 Errors: `PasswordException` → typed "password-protected PDF" error; `InvalidPDFException` → "corrupted PDF";
  zero text → "no text found". 500+ pages → warn and process pages in batches with progress, yielding to the UI
  thread (`await` a macrotask between batches) so the page never freezes.
- 5.5 Tests: generate PDFs in tests (e.g., with `pdf-lib` as a devDependency or hand-built minimal PDF bytes),
  covering headings, lists, multi-page, empty, corrupted. Unit-test the heading/line-grouping functions with
  synthetic text-item arrays so tests don't depend on pdf rendering.
- 5.6 Register + detect (`%PDF-` magic), E2E, docs commit.

### M6 — OCR (scanned PDF + images)
Library: **tesseract.js**. **Self-host everything**: worker script, wasm core and language data
(`eng.traineddata`) under `public/tesseract/` and pass `workerPath`, `corePath`, `langPath`
explicitly so nothing is fetched from a CDN. Update CSP (`worker-src`, `connect-src 'self'`, `wasm-unsafe-eval`
as needed) in all three places. Keep these assets out of the initial bundle (lazy).
- 6.1 Install dep + copy assets via a script `scripts/copy-ocr-assets.mjs` run from `postinstall` or `prebuild`
  (commit the script, not the large binaries if they can be generated; if not, commit them under `public/`
  and note size in DECISIONS.md).
- 6.2 `src/converters/ocr/engine.ts`: create ONE worker, reuse it across pages, terminate on completion or error.
  Expose `recognize(imageOrCanvas, {lang, onProgress, signal})`. Support cancellation with `AbortSignal`.
- 6.3 Images (JPG/PNG/WebP/BMP/GIF first frame): decode → OCR → markdown paragraphs. Downscale images wider than
  ~3000 px; upscale tiny text images (< 1000 px wide) 2× before OCR.
- 6.4 Scanned PDF: use pdfjs to render each page to a canvas at scale ≈ 2 (≈ 200 DPI), OCR page by page, join with
  page separators. Process pages sequentially (memory safety).
- 6.5 Progress UI: per-file progress bar with "Page 3/12 — 41%" and a Cancel button, `role="progressbar"` with
  `aria-valuenow`. Update through a callback, not through polling.
- 6.6 Quality: compute mean word confidence; if < 60 add a warning "OCR confidence is low (NN%) — check the
  output"; mark pages below 40 in the warning text. If the result is empty → "no text found".
- 6.7 Language: default English. Add a small language selector (English + a short list) ONLY if the language data
  is self-hosted; otherwise show a note "English-first in v1; other languages are not supported yet" (this is
  allowed by REQUIREMENTS §9). Record the choice in `DECISIONS.md`.
- 6.8 Wire PDF `NeedsOcr` → OCR route automatically with a warning "Scanned PDF detected — using OCR".
- 6.9 Tests: unit-test the pipeline with a mocked engine (don't run real OCR in unit tests). One e2e test with a
  tiny generated PNG containing large black text on white (e.g., "HELLO 123") — assert the output contains
  `HELLO`. Mark the e2e with a generous timeout. Docs commit.

### M7 — PPTX (client-side; NO backend)
Decision to record in `DECISIONS.md`: PPTX is parsed in the browser with **JSZip + DOMParser** — this resolves
the open question in REQUIREMENTS §11 in favor of "fully client-side". Install `jszip` (lazy import).
- 7.1 Install dep (separate commit).
- 7.2 Parsing rules (`src/converters/pptx.ts`):
  - Slide order comes from `ppt/presentation.xml` `<p:sldIdLst>` resolved through
    `ppt/_rels/presentation.xml.rels` — **not** by sorting filenames.
  - Per slide: read `ppt/slides/slideN.xml`. Text lives in `<a:t>` inside `<a:p>` inside `<p:sp>`/`<p:txBody>`.
    Paragraph = one `<a:p>`; join runs inside it with no separator; paragraphs with `<a:br/>` get a newline.
  - Title: shape with `<p:ph type="title">` or `ctrTitle` → heading `## Slide N: <title>`; if no title →
    `## Slide N`.
  - Bullets: use `<a:pPr lvl="k">` for indentation (2 spaces per level) with `- `; numbered via `<a:buAutoNum>`.
  - Tables `<a:tbl>` → markdown tables. Grouped shapes (`<p:grpSp>`) → recurse. Reading order: sort shapes by
    (y, x) offset from `<a:off>` when available, but keep the title first.
  - **Speaker notes:** find the slide's rels (`ppt/slides/_rels/slideN.xml.rels`) → `notesSlide` target → extract
    text from the body placeholder; emit under `### Speaker notes` inside that slide's section. Ignore slide-number
    placeholders.
  - Images/charts/SmartArt: count and warn once "N images/charts on slides were not converted"; chart titles and
    series names may be extracted if easy, else skip.
  - Hidden slides (`show="0"`) → include with `(hidden)` suffix.
- 7.3 Errors: OLE2 header → "password-protected or legacy .ppt (not supported; save as .pptx)"; missing
  `ppt/presentation.xml` → "corrupted PPTX"; zero text → "no text found". Guard against zip bombs (cap total
  uncompressed size ≈ 200 MB and entry count) — put this guard in a shared helper `src/core/zip-guard.ts` that M9
  will reuse.
- 7.4 Tests: generate a PPTX in the test by building the XML parts with JSZip (2 slides, notes, a table, nested
  bullets, a hidden slide). Assert exact markdown.
- 7.5 Register + detect, E2E, docs commit.

### M8 — P1 formats: RTF, HTML file, URL
- 8.1 **RTF** (`src/converters/rtf.ts`): write a small tolerant RTF text extractor in TypeScript (no heavy
  dependency): track group depth; skip destination groups (`fonttbl`, `colortbl`, `stylesheet`, `info`, `pict`,
  `{\*...}`); handle `\par`→paragraph, `\line`→newline, `\tab`, `\'hh` (cp1252 bytes), `\uN?` (signed 16-bit
  unicode + skip fallback char), `\~` nbsp, escaped `\\ \{ \}`; bold/italic (`\b`, `\i`) → `**`/`*` only if
  simple and safe, otherwise plain. Tests with several hand-written RTF strings. Magic `{\rtf`.
- 8.2 **HTML file** (`src/converters/html.ts`): parse with `DOMParser`; remove `script, style, nav, footer, aside,
  form, iframe, noscript, svg`; use `@mozilla/readability` for main-content extraction (lazy import); fall back to
  `<body>` if Readability returns null; convert with Turndown (+ GFM plugin, both already installed) with
  `headingStyle: 'atx'`, fenced code blocks, tables. Resolve nothing over the network; strip images to alt text
  (warn). Sanitize: never insert HTML into the DOM of the app, only into a detached `DOMParser` document.
- 8.3 **URL input**: add a "Convert a URL" field. Browsers block most cross-origin fetches (CORS), so:
  - Try `fetch(url, {mode:'cors'})` with a 15 s timeout and 10 MB cap. Only `http:`/`https:` allowed.
  - On CORS/network failure show an explicit card: "This site doesn't allow in-browser fetching. Save the page
    as HTML and drop the file here, or paste the page's HTML." and offer a "Paste HTML" textarea that feeds the
    HTML converter.
  - Update CSP `connect-src` accordingly (it will need to allow https for this feature) and state this clearly in
    the privacy footer ("URL mode makes a direct request from your browser to the URL you enter").
  - **Do NOT build a proxy server** unless the user approves it in `DECISIONS.md`. Add an "Open question for
    user: optional serverless proxy for URL mode" note instead.
- 8.4 Tests, E2E (mock `page.route` for the URL), register + detect, docs commit.

### M9 — P2 formats: EPUB, ZIP, folders
- 9.1 **EPUB** (`src/converters/epub.ts`): JSZip → read `META-INF/container.xml` → find OPF → read manifest +
  `<spine>` order → each XHTML item through the HTML→Markdown path (reuse M8 Turndown config) → join with
  `## <chapter title or filename>`; add the book title/author from OPF metadata as a header. Skip cover/nav
  items. DRM-protected (has `META-INF/encryption.xml` with non-font entries) → typed error.
- 9.2 **ZIP** (`src/converters/zip.ts`): iterate entries with the shared `zip-guard` (entry cap e.g. 2,000; total
  uncompressed cap; per-file cap; reject path traversal `..`). Skip junk (`__MACOSX/`, `.DS_Store`, `node_modules/`,
  `.git/`, binaries without a converter) and list skipped files in a warning. Convert each supported file by
  sending bytes through the SAME registry/pipeline (no special cases). Output each file under
  `## File: <relative/path>` — stable, sorted order — then the converted content in the appropriate fenced/markdown
  form. A per-file failure must not fail the whole ZIP; include `> ⚠ Failed: <reason>` under that file's header.
- 9.3 **Folders:** support `<input webkitdirectory>` and dropping folders (`DataTransferItem.webkitGetAsEntry`,
  recursive `readEntries` until empty). Treat a dropped folder exactly like a ZIP result (same boundary format).
- 9.4 Tests, E2E (generated zip with a txt, a docx, and a junk file), docs commit.

### M10 — Edge-case and robustness sweep (REQUIREMENTS §9)
Create `tests/unit/edge-cases.test.ts` + `tests/e2e/edge-cases.spec.ts` with one test per bullet:
- password-protected PDF / DOCX / PPTX / XLSX → specific message each
- corrupted file of each type → clear message (no stack trace shown to the user, no blank output)
- zero-byte file; file with wrong extension (e.g., a PDF named `.txt`) → detect by magic bytes and convert correctly
  (with a warning "detected as PDF")
- huge file warning thresholds (e.g., > 50 MB or > 300 PDF pages → warn before processing; allow "continue")
- embedded-image text warning for PDF/DOCX/PPTX
- non-Latin text (Hindi, Chinese, Arabic, emoji) survives round trip through each text-based converter, chunker,
  copy, and download without mojibake (UTF-8 everywhere; CSV with BOM; text files with UTF-16 BOM or Windows-1252 —
  `src/core/encoding.ts` should already handle detection; extend if not)
- "no text found" message for empty PDF/image
- cancel mid-conversion; removing a file while it is converting; converting 20 files in a batch without freezing the UI
Fix every failure at the shared-pipeline level (detection, errors, queue) rather than per converter.

### M11 — Accessibility, mobile, performance, privacy hardening
- **A11y:** keyboard-only flow for drop zone (Enter/Space opens file picker), job list, copy, download, chunk
  copy; visible focus rings; `aria-live="polite"` status for conversion progress and "Copied!" toasts; all controls
  labelled; color contrast ≥ 4.5:1 for amber-on-dark text; reduced-motion respected. Run `@axe-core/playwright` on
  the empty state, converting state, success state, error state, chunked state — **zero violations**.
- **Mobile:** test at 375×667 and 390×844 (Playwright `mobile-chromium`): no horizontal scroll, tap targets ≥ 44 px,
  the Copy button reachable without scrolling past the output, file picker works (no drag-drop required).
- **Performance:** build budget check keeps passing; heavy libs only in lazy chunks (assert with a test that parses
  `dist` output or the existing gzip check); a 20-page text PDF and a 5 MB XLSX convert in < 5 s in a unit/e2e
  timing test (use a generous CI margin, e.g. 10 s, but log the actual time). Output panel must virtualize or cap
  preview rendering for outputs > 500k chars (a "preview capped" notice already exists — verify it).
- **Privacy:** e2e test that records all network requests during a conversion of EACH supported type and asserts
  **zero** requests to any non-same-origin host (except the explicit URL-mode test). Confirm CSP headers are
  identical in `index.html`, `_headers`, and `vercel.json`. Confirm nothing but UI settings is written to
  `localStorage` (never file content or file names).
- **WebKit:** make sure `.github/workflows` installs WebKit and runs it; remove any "cannot run" excuses by
  getting CI green on all three browsers (chromium, mobile-chromium, webkit).
- **Quick paste mode** (open question in REQUIREMENTS §11): implement as an opt-in setting "Auto-copy when done"
  (default OFF); auto-copy only works after a user gesture, so when the browser blocks it show a one-tap "Copy"
  toast. Record the decision.

### M12 — Docs, deploy, final audit
- Rewrite `README.md`: what it is, supported formats table (with limits), privacy statement, dev commands, how
  to add a converter, deployment, known limitations (English-first OCR, heuristics for PDF headings, URL CORS).
  Remove the stale "Not yet implemented" text.
- Finalize `docs/TRACEABILITY.md`: every requirement in REQUIREMENTS.md §4, §5, §6, §9 → implementation file → test
  name → command → result. Every row ✅ or an explicit, justified ⬜ with an issue note.
- Deployment: verify `vite.config.ts` `base` matches the host (Vercel root `/` or GitHub Pages `/unbound/`);
  `vercel.json` and `_headers` contain the security headers; a production `npm run build && npm run preview` smoke
  test passes with all formats.
- Update `AUDIT_REPORT.md` with the final self-audit (PASS/FAIL per requirement with command evidence).
- Final: `npm run verify` green on a clean clone (`git clone` into a temp dir, `npm ci`, `npm run verify`).
- Tag release: `git tag v1.0.0 && git push origin v1.0.0` ONLY if everything above is green.

---

## PART 7 — AFTER EVERY SUB-STEP, DO THIS BOOKKEEPING

1. Edit `PROGRESS.md`: tick the item (⬜ → ✅, or 🟨 if partial) and append an Iteration Log entry with date,
   what changed, the commands you ran, and **pasted output**. Never tick without evidence.
2. Update `docs/TRACEABILITY.md` if a requirement became satisfied.
3. Record any non-obvious choice in `DECISIONS.md` (decision, alternatives, reason).
4. Commit these docs in the milestone's final `docs:` commit and push.

---

## PART 8 — YOUR REPLY FORMAT AFTER EACH SUB-STEP

```
STEP: <e.g. M4.2 XLSX converter>
WHAT I CHANGED: <files, one line each>
VERIFIED WITH: <commands> → <pass/fail + key numbers>
COMMIT: <hash> "<message>"  PUSHED: yes/no (+ branch)
NEXT STEP: <the next numbered item from this prompt>
BLOCKERS / QUESTIONS FOR USER: <or "none">
```

Then immediately continue with the NEXT STEP unless a blocker/question requires the user.

---

## PART 9 — THINGS THE USER MUST DECIDE (ask once, then continue with the default)

1. URL mode: stay direct-fetch only (default), or add an optional serverless proxy later?
2. OCR languages: English-only v1 (default) or add a self-hosted language list?
3. SheetJS install source if the SheetJS server is unreachable from your network.
4. Deploy target: Vercel (default, `vercel.json` exists) or GitHub Pages.

BEGIN NOW with PART 1 (session start checklist). Then start at the first unchecked item (expected: M3.1).
L. At the end of EVERY milestone, the docs commit must update PROGRESS.md (tick
   items with pasted evidence), docs/TRACEABILITY.md, and the README "Current
   status" section so they match the code. Never leave them stale.
M. Commit messages must be ONE plain line: no literal "\n", no co-author trailers.

N. README.md is a living document. Every commit that adds, changes or removes a
   user-visible capability must be followed in the SAME milestone by a docs commit
   that updates the README "supported formats" table and "Current status" to match
   PROGRESS.md. Never claim a format works without a passing test.
