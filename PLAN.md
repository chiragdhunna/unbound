# PLAN.md — Unbound: Build Plan for the Coding Agent

> **Audience:** an autonomous AI coding agent. **Author role:** Solution Architect.
> **Source of truth for *what* to build:** `docs/REQUIREMENTS.md` (the Unbound requirements document).
> **This file defines *how* to build it, in what order, and how "done" is proven.**
> If this plan and the requirements conflict, the requirements win for scope; this plan wins for implementation choices. Record any deviation in `DECISIONS.md`.

---

## 0. Rules of Engagement (read first, every iteration)

1. **Never claim done without evidence.** "Done" = the gate script (`scripts/verify.sh`) exits 0 **and** every row in `docs/TRACEABILITY.md` is ✅ with a real test path that exists and passes.
2. **No stubs.** No `TODO`, `FIXME`, `throw new Error('not implemented')`, `it.skip`, `test.todo`, empty catch blocks, or mocked-out converters in shipped code. The gate greps for these.
3. **Never weaken a test, budget, or threshold to make it pass.** Fix the code. If a requirement is truly infeasible, document why in `DECISIONS.md` and implement the closest honest behavior, surfaced to the user in the UI.
4. **Work in small vertical slices.** Each slice: implement → unit test → wire into UI → e2e test → commit.
5. **Persist state in files, not in your head.** Maintain `PROGRESS.md` (checklist + last-iteration notes) and `DECISIONS.md` (ADR log). Re-read them at the start of every iteration.
6. **Do not add features beyond the requirements** except items explicitly marked *(stretch)* here. Non-goals (LLM chat, summarization, custom OCR engine, collaboration, accounts) stay out.
7. **Privacy is a feature, not a note.** No analytics, no telemetry, no third-party network calls during conversion. This is enforced by an automated e2e test.
8. **Commit often** with conventional commits (`feat(pdf): …`, `test(xlsx): …`, `chore: …`).

---

## 1. Product Summary

**Unbound** — drop any file → get clean markdown/plain text → one-click copy → paste into any LLM chat. Fully **browser-side**, no account, no backend for v1.

**Success criteria (measurable):**
| # | Criterion | How proven |
|---|---|---|
| S1 | Drop → converted → copied in ≤ 3 user steps | e2e happy-path test counts interactions |
| S2 | Text-based doc < 20 pages / 10 MB converts < 5 s | perf test with fixture, budget asserted |
| S3 | Zero network requests to third parties during conversion | Playwright network-interception test |
| S4 | All P0 + P1 + P2 formats in the requirements table supported | per-format unit + e2e tests |
| S5 | Initial JS payload ≤ 250 KB gzip; heavy libs lazy-loaded | `scripts/check-bundle.mjs` |
| S6 | Works on mobile viewport (375×667) and desktop | Playwright device projects |
| S7 | Lighthouse accessibility ≥ 95; axe-core: 0 serious/critical violations | e2e axe test |

---

## 2. Architecture Decisions (ADR summary)

| ID | Decision | Rationale |
|---|---|---|
| ADR-1 | **Pure client-side SPA.** React 18 + Vite + TypeScript (strict). No backend in v1. | Privacy, simplicity, static hosting. |
| ADR-2 | **PPTX is parsed client-side** (JSZip + XML parse). No Lambda. | Resolves Open Question #3: PPTX is just zipped XML; keeping v1 fully client-side is simpler and more private. |
| ADR-3 | **Converters are plugins** behind one `Converter` interface + lazy-loaded registry. | Each heavy lib (pdf.js, tesseract, mammoth, SheetJS, JSZip) is dynamically imported on first use only. |
| ADR-4 | **Canonical output = Markdown string.** Plain-text mode = a separate `markdownToPlain()` renderer (remark AST walk), not regex stripping. | Correct handling of tables/lists/code; single source of truth. No heavyweight IR. |
| ADR-5 | **CPU-heavy work off the main thread** via a Web Worker pool. **Caveat:** `DOMParser` does not exist in workers. Use DOM-free parsers in workers (`fast-xml-parser` for OOXML). For DOM-dependent steps (HTML→MD via turndown, Readability) run a **spike in M1**: try `linkedom` inside the worker; if unreliable, run those converters on the main thread with cooperative yielding (yield every ≤16 ms). Record the outcome in `DECISIONS.md`. | Keeps UI responsive (NFR performance) without breaking on worker API gaps. |
| ADR-6 | **OCR is fully self-hosted.** Bundle `tesseract.js` worker + core WASM + English traineddata in `/public/ocr/`; set `workerPath`, `corePath`, `langPath` explicitly. Other languages download **on explicit user opt-in** with a visible "this downloads language data from <host>" notice. | tesseract.js defaults to a CDN; silently using it would violate the privacy requirement (5.4). |
| ADR-7 | **Open Question #1 (batch default):** separate outputs by default, with a "Combine all" toggle that concatenates with `# File: name` headers. | Matches requirement leaning. |
| ADR-8 | **Open Question #2 (chunk size):** chunk by **estimated tokens** (default 12k tokens ≈ 50k chars), with a chars/tokens unit switch. Token estimate is heuristic (script-aware chars/token), always displayed with "≈". | Users manage token limits; chars alone misleads for CJK/code. |
| ADR-9 | **Open Question #4 (quick-paste mode):** implement as a settings toggle. Because browsers require a **user gesture** for clipboard writes (Safari especially), auto-copy after async conversion may be rejected → **fallback:** show a prominent "Copied?/Tap to copy" toast button. Never silently fail. | Real browser constraint; must be handled, not ignored. |
| ADR-10 | **URL input (P1) limitation:** browsers block cross-origin fetches (CORS). Implement direct `fetch`; on CORS/network failure show actionable guidance (save page as HTML → drop it in, or paste HTML). Optional user-configured proxy via `VITE_FETCH_PROXY_URL` (off by default, clearly labelled as *not* private). Ship a documented sample proxy in `docs/optional-proxy/` (not deployed). | Honest handling of a hard platform constraint. |
| ADR-11 | **SheetJS supply chain:** the `xlsx` package on the npm registry is stale/vulnerable. Install the current release from the official SheetJS CDN tarball (`https://cdn.sheetjs.com/`). If the sandbox cannot reach it, fall back to `exceljs` (+ `papaparse` for CSV) and log the decision. | Security hygiene. |
| ADR-12 | **State:** Zustand store for job queue/settings; settings persisted in `localStorage` (never file contents). | Small, testable, no provider boilerplate. |
| ADR-13 | **Styling:** plain CSS with design tokens (CSS variables) — no UI framework. Fonts self-hosted via `@fontsource/jetbrains-mono` and `@fontsource/ibm-plex-mono`. | No external font requests (privacy), tiny bundle. |

---

## 3. Tech Stack (pin exact versions at install; commit lockfile)

- **Runtime/build:** Node ≥ 20, Vite, TypeScript (`strict`, `noUncheckedIndexedAccess`), React 18
- **Quality:** ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, Vitest (+ coverage-v8), Playwright, `@axe-core/playwright`
- **Conversion libs:** `pdfjs-dist`, `tesseract.js` (+ `tesseract.js-core`, `@tesseract.js-data/eng`), `mammoth`, `turndown` + `turndown-plugin-gfm`, SheetJS (see ADR-11), `papaparse`, `jszip`, `fast-xml-parser`, `@mozilla/readability`, `linkedom` (spike), `unified` + `remark-parse` + `remark-gfm` (plain-text renderer), `chardet`-style logic via `TextDecoder` (no dependency unless needed)
- **State/util:** `zustand`
- **Test fixture generation (devDeps):** `docx`, `pptxgenjs`, SheetJS, `pdf-lib`, `@napi-rs/canvas`, `jszip`
- **Hosting:** static (GitHub Pages + Vercel configs both provided)

---

## 4. Repository Layout

```
unbound/
├─ PLAN.md  PROGRESS.md  DECISIONS.md  README.md  LOOP_PROMPT.md
├─ docs/
│  ├─ REQUIREMENTS.md            # the provided requirements doc (verbatim)
│  ├─ TRACEABILITY.md            # requirement → code → test matrix (see §15)
│  ├─ optional-proxy/            # sample CORS proxy (documented, not deployed)
│  └─ ARCHITECTURE.md            # short diagram + module map (write at the end)
├─ public/ocr/                   # tesseract worker, core wasm, eng traineddata
├─ scripts/
│  ├─ verify.sh                  # THE gate (see §14)
│  ├─ make-fixtures.ts           # deterministic fixture generator
│  ├─ check-bundle.mjs           # bundle budget enforcement
│  └─ check-traceability.mjs     # matrix validator
├─ src/
│  ├─ app/                       # App shell, layout, routes (none needed), providers
│  ├─ ui/                        # DropZone, OptionsBar, JobList, OutputPanel, ChunkList, Toasts…
│  ├─ core/
│  │  ├─ types.ts                # Converter, ConvertResult, Warning, Progress …
│  │  ├─ detect.ts               # file-type detection (magic bytes + zip introspection + ext + MIME)
│  │  ├─ registry.ts             # kind → lazy converter loader
│  │  ├─ queue.ts                # job queue, concurrency, cancel, progress
│  │  ├─ pipeline.ts             # detect → convert → post-process
│  │  ├─ markdown.ts             # table builder, escaping, fence helper, normalizer
│  │  ├─ plain.ts                # markdownToPlain()
│  │  ├─ tokens.ts               # token/word/char estimation
│  │  ├─ chunk.ts                # structure-aware chunker
│  │  ├─ combine.ts              # multi-file combine
│  │  └─ errors.ts               # typed errors (PasswordRequired, Corrupt, Unsupported, NoText …)
│  ├─ converters/
│  │  ├─ text.ts  code.ts  csv.ts  xlsx.ts  docx.ts  pptx.ts  pdf.ts
│  │  ├─ ocr.ts  image.ts  rtf.ts  html.ts  epub.ts  zip.ts
│  ├─ workers/                   # worker entry + RPC wrapper
│  ├─ store/                     # zustand slices
│  ├─ styles/                    # tokens.css, base.css, components
│  └─ main.tsx
├─ tests/
│  ├─ fixtures/                  # generated + tiny committed binaries
│  ├─ unit/                      # mirrors src/
│  └─ e2e/
└─ .github/workflows/ci.yml  deploy.yml
```

---

## 5. Core Contracts (implement exactly; extend only with reason)

```ts
export type FileKind =
  | 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'csv' | 'text' | 'markdown'
  | 'image' | 'rtf' | 'html' | 'json' | 'xml' | 'code' | 'epub' | 'zip'
  | 'legacy-office' | 'encrypted-office' | 'unknown';

export interface Warning { code: string; message: string; severity: 'info' | 'warn'; page?: number }

export interface ConvertStats {
  pages?: number; slides?: number; sheets?: number; files?: number;
  ocrPages?: number; ocrConfidence?: number; // 0–100 mean word confidence
  truncated?: boolean;
}

export interface ConvertResult { markdown: string; warnings: Warning[]; stats: ConvertStats }

export interface ConvertOptions { ocrLanguage: string; forceOcr: boolean; }

export interface ConvertContext {
  signal: AbortSignal;                                  // cancel support
  onProgress: (p: { phase: string; current: number; total: number }) => void;
  requestPassword: (reason: 'required' | 'incorrect') => Promise<string | null>; // null = user cancelled
  options: ConvertOptions;
}

export interface Converter {
  kind: FileKind;
  convert(input: { name: string; bytes: ArrayBuffer; mime: string }, ctx: ConvertContext): Promise<ConvertResult>;
}
```

Typed errors (`core/errors.ts`): `UnsupportedFormatError`, `CorruptFileError`, `PasswordRequiredError`, `NoTextFoundError`, `TooLargeError`, `CancelledError`. The UI maps each to a human-readable message with a suggested next step. **No generic "something went wrong" for known cases.**

---

## 6. Pipeline & Detection

**Flow:** `File(s)` → `detect()` → `registry.load(kind)` → `convert()` → `normalize()` → store → UI.

**`detect()` algorithm (magic bytes beat extension; log mismatch as an info warning):**
1. Read first 4 KB. Match signatures: `%PDF-`, `PK\x03\x04` (ZIP family), `D0 CF 11 E0` (OLE2), `{\rtf`, PNG, JPEG, GIF, WEBP (`RIFF….WEBP`), BMP.
2. **ZIP family** → open with JSZip (list entries only, no extraction): `word/document.xml` → docx; `ppt/presentation.xml` → pptx; `xl/workbook.xml` → xlsx; `mimetype` = `application/epub+zip` (+ `META-INF/container.xml`) → epub; otherwise → generic zip.
3. **OLE2** → if extension is docx/pptx/xlsx → `encrypted-office` (password-protected OOXML is stored as OLE); `.xls` → xlsx converter (SheetJS reads it); `.doc`/`.ppt` → `legacy-office` (friendly "save as .docx/.pptx" message).
4. No binary signature: verify text (no NUL bytes in sample; decodes as UTF-8/UTF-16/fallback windows-1252), then resolve by extension: `md/markdown`, `txt`, `csv/tsv`, `json`, `xml`, `html/htm`, known code extensions → `code`, else `text`.
5. Anything else → `unknown` → friendly unsupported-format error that names the detected type and lists supported ones.

**Text decoding helper (shared):** honor BOMs (UTF-8/UTF-16LE/BE), try strict UTF-8, fall back to windows-1252, and emit an info warning when the fallback is used.

**Normalizer (post-process, all formats):** normalize line endings to `\n`; strip zero-width/BOM chars; collapse 3+ blank lines to 2; trim trailing whitespace (except inside fences); ensure single trailing newline; never alter content inside code fences.

---

## 7. Converter Specifications

### 7.1 TXT / MD (P0)
Pass through the same pipeline (decode → normalize). Markdown input is left as-is.

### 7.2 DOCX (P0)
- `mammoth.convertToHtml` with a style map (Title→h1, Heading 1–6→h1–h6, List Paragraph→list, footnotes kept).
- Convert HTML→MD with turndown + GFM plugin (tables, strikethrough). Headings ATX style, `-` bullets, fenced code.
- Images: drop and emit one warning `IMAGES_OMITTED` with the count ("N images omitted; text inside images is not captured").
- Detect encrypted DOCX (OLE2 container) → `PasswordRequiredError` path: message explains the file is encrypted and must be saved without a password (client-side decryption of Office encryption is out of scope; say so honestly).

### 7.3 XLSX / XLS / CSV (P0)
- CSV/TSV: `papaparse` (auto-detect delimiter, handle quoted newlines, BOM).
- XLSX/XLS: SheetJS, cached formula **values** (not formulas).
- Output per sheet: `## Sheet: <name>` then a GFM table. First non-empty row = header. Escape `|` and newlines in cells (`<br>` for newlines). Trim fully empty trailing rows/cols. Expand merged cells by repeating the value into the top-left only and leave others blank.
- Hidden sheets: include with a note `(hidden)`. Empty sheet: `_(empty sheet)_`.
- Dates formatted ISO (`YYYY-MM-DD`) unless the cell has time.
- Guard: if a sheet exceeds 200k cells, convert in streaming row batches with progress and emit a warning with the row count; never freeze the UI.

### 7.4 PDF — text (P0)
- `pdfjs-dist` (worker configured by Vite `?worker` / `?url`).
- Per page `getTextContent()` → reconstruct lines by grouping items on Y (tolerance ≈ 0.4 × median font height), order by X, insert spaces by gap heuristic.
- **Structure heuristics:** compute the median body font size. Lines with size ≥ 1.25× median (or bold + larger) → headings (`#`/`##`/`###` by size rank). Lines starting with bullets (`•`, `–`, `-`, `*`) or `1.`/`1)` → list items. Join hard-wrapped lines within a paragraph; detect paragraph breaks by vertical gap > 1.5× line height. De-hyphenate line-end hyphens. Drop repeated headers/footers/page numbers that appear on > 50% of pages at the same Y band.
- **Tables (best effort):** detect ≥ 3 consecutive lines whose items align into ≥ 2 consistent column X-positions → GFM table; if unsure, keep as aligned text rather than corrupting it.
- Insert `<!-- page N -->` or `---` page separators **only if** a "Include page markers" setting is on (default off; token overhead).
- Password-protected: catch pdf.js `PasswordException` → `ctx.requestPassword()` → retry; wrong password re-prompts; cancel → `CancelledError`.
- Large files: process page-by-page with progress; > 200 pages shows a pre-warning; output stays incremental so memory stays bounded.

### 7.5 PDF — scanned / image-only + Images (P0 / P1)
- **Scanned detection per page:** page is "image-only" if extracted non-whitespace chars < 25 (configurable) **and** the page has image ops. Pages failing this route to OCR; mixed documents get per-page decisions. `forceOcr` option overrides.
- Render page to canvas at 2× (cap long edge ~3000 px), send to tesseract.js (single reused worker, sequential pages, progress per page).
- Image files (JPG/PNG/WEBP/GIF/BMP): downscale if > 4000 px, optional contrast/grayscale preprocessing, OCR.
- **Quality warning:** compute mean word confidence; < 70 → `OCR_LOW_CONFIDENCE` warning (shown prominently with the score); < 40 or < 10 chars → "OCR output looks unreliable".
- Embedded-image text in text PDFs: if a text page also contains large images (> 30% of page area) emit a one-time warning `EMBEDDED_IMAGES_MAY_CONTAIN_TEXT` with a "Run OCR on this PDF" action (re-runs with `forceOcr`).
- No text at all after OCR → `NoTextFoundError` ("no text found").
- OCR progress UI: per-page progress bar + ETA; cancel button works (terminate worker).
- Non-English: language selector (default English; list of common languages). Non-English data is downloaded only after explicit consent (ADR-6). For non-Latin scripts in **text** PDFs, verify extraction works (fixture with CJK/Devanagari/Arabic) and document the limitation for RTL ordering.

### 7.6 PPTX (P0)
- JSZip + `fast-xml-parser`.
- Slide order from `ppt/presentation.xml` `sldIdLst` → `ppt/_rels/presentation.xml.rels` (**do not** sort by filename).
- Per slide: `## Slide N` + title (from placeholder `type="title"|"ctrTitle"`) as `### <title>` if present; body text paragraphs (`a:p` → join `a:r/a:t`), bullet levels via `a:pPr@lvl` → nested list; tables (`a:tbl`) → GFM; grouped shapes traversed recursively.
- Speaker notes: follow slide rels to `notesSlide`, emit `**Notes:**` subsection. Skip empty notes placeholders / slide-number fields.
- Hidden slides (`show="0"`) included with `(hidden)` label.
- Charts/images/SmartArt: emit a single warning listing counts of non-text objects omitted.

### 7.7 RTF (P1)
Client-side tokenizer (no pandoc): handle groups, skip destinations (`fonttbl`, `colortbl`, `stylesheet`, `info`, `pict`, `*` destinations), `\par`→paragraph, `\tab`, `\'hh` (codepage aware), `\uN?` (signed 16-bit), `\line`, basic bold/italic → `**`/`_`, lists best effort. Unit-test against fixtures including unicode + escapes.

### 7.8 HTML file & URL (P1)
- Parse → `@mozilla/readability` → turndown(GFM). If Readability fails (non-article page), fall back to `<body>` minus `nav/header/footer/aside/script/style/noscript`.
- Never insert parsed HTML into the live DOM; scripts never execute.
- URL input: see ADR-10. Use `AbortController` with a 15 s timeout. Resolve relative links against the page URL; keep link text + href as `[text](url)`.

### 7.9 JSON / XML / code (P2)
- Fenced code block with language tag from extension. JSON: valid → pretty-print (2 spaces) with a toggle to keep original; invalid → raw with info warning. XML: pass through.
- **Fence safety:** choose fence length = (longest backtick run in content) + 1, minimum 3.

### 7.10 EPUB (P2)
JSZip → `META-INF/container.xml` → OPF → `spine` order → each XHTML through the HTML path (turndown) → `# <Chapter>` sections; title/author from metadata as a front-matter block. Skip images/CSS. DRM-encrypted EPUBs (`META-INF/encryption.xml` with non-font algorithms) → clear error.

### 7.11 ZIP / folders (P2)
- Accept `.zip` and folder drops (`webkitGetAsEntry` recursion + `<input webkitdirectory>`).
- For each entry: detect → convert via the normal registry → emit `# File: path/to/file.ext` boundary, then content. Sort paths naturally; skip `.git/`, `node_modules/`, `__MACOSX/`, `.DS_Store`, lockfiles, and binaries (list skipped in a summary block at the top).
- **Zip-bomb/limits:** max 2,000 entries, max 500 MB total uncompressed, max nesting depth 2, per-entry timeout; exceeding limits → partial result + warning (never crash).
- Output begins with a generated file tree.

---

## 8. Output Features

### 8.1 Modes
- **Markdown (default)** vs **Plain text** toggle → `markdownToPlain()`: headings as plain lines, lists as `- ` lines, tables as tab-separated rows, emphasis markers removed, code fences removed (content kept), links as `text (url)`. Toggle is instant (recompute from cached markdown; never re-convert).
- **Include page/slide markers** toggle (PDF/PPTX).

### 8.2 Counters
Live **characters / words / ≈ tokens** for the currently displayed output (and per chunk). Token heuristic in `core/tokens.ts`: Latin/prose ≈ chars/4; code/JSON-heavy ≈ chars/3.2; CJK ≈ 1 token per 1.2 chars; blend by script proportion. Always labelled "≈". Unit-tested with known strings and monotonicity properties.

### 8.3 Copy
`navigator.clipboard.writeText` inside the click handler; fallback to hidden `<textarea>` + `execCommand('copy')`. Success/failure toast (aria-live). Must handle multi-MB strings. Button state: "Copy" → "Copied ✓" (2 s).

### 8.4 Download
`.md` or `.txt` per mode via `Blob` + `URL.createObjectURL` (revoke after use). Filename: `<original-name>.md|txt`; combined: `unbound-combined-<date>.md`.

### 8.5 Auto-chunking
- Threshold configurable (default 12k tokens ≈ 50k chars); chunk unit switch tokens/chars.
- **Structure-aware splitting** priority: `##` section boundary → blank-line paragraph → line → sentence → hard split (last resort). **Never split inside a code fence**; never split a table row; if a table must split, repeat its header row in the next chunk and close/reopen fences properly.
- Each chunk gets a header line `[Part i of N]` (toggleable) and an optional preamble toggle: "This is part i of N of '<file>'. Wait for all parts before answering."
- UI: list of chunks with per-chunk size, **Copy** button each, plus "Copy next" sequential helper that advances automatically and marks copied chunks.
- Property tests: concatenating chunk bodies (minus headers) reproduces the original text exactly; no chunk exceeds the limit unless a single unsplittable unit does (then warn).

### 8.6 Batch
- Multi-file drop → independent jobs. Mode toggle **Separate (default)** / **Combined**. Combined = `# File: <name>` headers, stable order, unified counters and chunking. Per-file copy/download always available; "Copy all" and "Download all (zip)" in separate mode *(zip download: stretch)*.
- Failed files never block others; each shows its own error card with retry.

### 8.7 Quick-paste mode
Setting: after conversion completes, auto-copy and skip preview focus. Implement the gesture fallback from ADR-9.

---

## 9. UI / UX Specification

**Aesthetic:** dark terminal, amber/gold accent, monospace everywhere (JetBrains Mono for UI, IBM Plex Mono for output text).

**Tokens (`styles/tokens.css`):**
```
--bg:#0b0b0a; --surface:#141412; --surface-2:#1b1b18; --border:#2b2a25;
--text:#e9e5d8; --muted:#8f8a7b; --amber:#ffb000; --amber-dim:#b37a00;
--ok:#7fd962; --warn:#ffcf4d; --danger:#ff6b6b; --radius:6px;
```
Verify text/background contrast ≥ 4.5:1 (amber-on-bg and muted-on-bg included); adjust tokens if the check fails.

**Layout (single screen, no routing):**
1. Header: wordmark `unbound_` (blinking cursor, disabled under `prefers-reduced-motion`) + tagline.
2. **DropZone:** large, dashed amber border, click/drag/paste-files support, keyboard operable (Enter/Space opens picker), "Choose files" and "Choose folder" buttons, optional URL field (P1).
3. **Options bar:** Markdown | Plain · Separate | Combined · Quick paste · Page markers · OCR language · Chunk threshold. Persist in `localStorage`.
4. **Job list:** per file — name, detected type badge, size, status (queued / converting / done / error), progress bar with phase text, warnings (collapsible), cancel/retry/remove.
5. **Output panel:** toolbar (Copy, Download, counts), scrollable monospace read-only text with an **Edit** toggle. **Preview cap:** if output > 1M chars, render the first 200k chars with a notice ("showing first 200,000 of N characters — Copy and Download use the full text"). Copy/Download always use the full string.
6. **Chunk panel** appears when over threshold.
7. Footer: truthful privacy line. It must be **dynamic**: "Files never leave your device" by default; switches to an explicit notice if the user enables a non-English OCR download or a proxy.

**States to design & test:** empty, dragging-over, converting, OCR-in-progress, success, success-with-warnings, each error type, password prompt dialog (focus-trapped, Esc to cancel), oversize warning, unsupported format.

**Mobile:** ≥ 44 px touch targets, single column, sticky Copy button at the bottom of the output panel, file input `accept` covers all supported types, drag-drop not required.

**Accessibility:** semantic landmarks, labelled controls, visible focus ring, `aria-live="polite"` for progress/toasts, dialog roles, full keyboard flow, `prefers-reduced-motion`, no color-only status.

*(stretch)* Installable PWA (manifest + service worker caching app shell and OCR assets for offline use).

---

## 10. Privacy & Security Requirements

- No analytics, no error-reporting SDKs, no CDN assets. Fonts and OCR assets self-hosted.
- Strict **CSP** meta/headers: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'` (+ opt-in hosts only when enabled). Provide `vercel.json`/`_headers` equivalents and document GitHub Pages meta-tag limits.
- Output rendered **only as text** (`textContent`/`<textarea>`); no `dangerouslySetInnerHTML`.
- Uploaded files are never persisted (no IndexedDB/localStorage of content). Revoke object URLs. Terminate workers after idle.
- **Automated proof (S3):** Playwright test that blocks all non-`localhost` requests, converts each fixture type, and asserts zero blocked/attempted external requests (except in the explicit opt-in tests, which assert the notice appears first).
- Dependency audit: `npm audit --omit=dev` must show no high/critical issues (document accepted exceptions).

---

## 11. Performance Budgets

| Budget | Target |
|---|---|
| Initial JS (gzip) | ≤ 250 KB; each converter chunk lazy-loaded |
| TXT/MD/CSV 10 MB | < 2 s |
| Text PDF 20 pages / ≤ 10 MB | < 5 s |
| DOCX / PPTX / XLSX ≤ 10 MB | < 5 s |
| UI long tasks during conversion | no main-thread task > 100 ms (measure in e2e via `PerformanceObserver` for worker-backed converters) |
| OCR | progress updates ≥ 1 per page; cancel responds < 1 s |

Enforce size budgets in `check-bundle.mjs`; enforce time budgets in a `tests/perf/` suite (generous CI multiplier documented, but the budgets themselves must not be raised to pass).

---

## 12. Testing Strategy

**Fixtures** (`scripts/make-fixtures.ts`, deterministic, committed output kept small):
- DOCX (headings, nested lists, table, bold/italic, image, footnote), PPTX (title/body/table/notes/hidden slide/grouped shapes/reordered slides), XLSX (multi-sheet, merged cells, formulas, hidden sheet, pipes/newlines in cells, dates), CSV (quoted newlines, `;` delimiter, BOM, windows-1252), text PDF (headings, lists, two-column, header/footer, hyphenation, CJK), scanned PDF (text rasterized to image via `@napi-rs/canvas` → embedded with `pdf-lib`), mixed PDF, image PNG/JPG with text, RTF (unicode/escapes), HTML article + non-article page, EPUB (3 chapters), ZIP (nested, junk dirs, oversized-entry simulation), JSON valid/invalid, code with backtick fences.
- Negative fixtures: truncated/corrupt variant of each binary format, zero-byte file, renamed-extension mismatch (e.g. PDF named `.docx`), password-protected PDF (generate with `qpdf --encrypt` if available; otherwise craft and commit a tiny encrypted PDF), OLE2-wrapped encrypted docx stub, legacy `.doc` stub.

**Unit tests (Vitest):** every converter (golden markdown comparisons + targeted assertions), detection matrix, encoding fallback, normalizer, plain-text renderer, tokens, chunker (**property-based** invariants), combine, queue (concurrency, cancel, failure isolation), errors → UI message map. Coverage gate: ≥ 85 % lines on `src/core` and `src/converters`.

**E2E (Playwright, Chromium + WebKit mobile emulation):** happy path per format; batch separate/combined; chunking and sequential copy; plain toggle; download contents; password flow (wrong → right → cancel); OCR progress + cancel; low-confidence warning; unsupported/corrupt/empty files; quick-paste + gesture fallback; URL CORS failure guidance; folder/zip; keyboard-only flow; axe scans on every major state; privacy network test; perf budgets.

**Manual-equivalent checks the agent must automate or script:** mobile viewport screenshot review (store under `tests/e2e/__screenshots__`), Lighthouse CI accessibility ≥ 95.

---

## 13. Milestones (execute in order; do not start a milestone until the prior one's acceptance passes)

### M0 — Scaffold, tooling, gates
- Init Vite+React+TS strict, ESLint/Prettier, Vitest, Playwright, CI workflow, `scripts/verify.sh` (initially runs what exists; grows with the project), `PROGRESS.md`, `DECISIONS.md`, `docs/TRACEABILITY.md` seeded with **every** requirement line from `docs/REQUIREMENTS.md` (status ⬜).
- Design tokens + self-hosted fonts + empty app shell.
- **Accept:** `verify.sh` runs green on the skeleton; CI green; traceability file lists all requirements.

### M1 — Core engine
- `types`, `errors`, `detect` (+ tests incl. mismatch & zip introspection), `registry`, `queue` (concurrency, cancel, progress), worker RPC, normalizer, encoding helper.
- **Spike (ADR-5):** decide worker vs main-thread for DOM-dependent converters; write the decision in `DECISIONS.md` with evidence.
- Converters: text/markdown/json/xml/code.
- **Accept:** detection matrix tests pass; queue tests pass; dropping a `.txt`/`.json`/`.md` yields output in the UI.

### M2 — Output experience & app shell
- DropZone, JobList, OutputPanel, counters, markdown/plain toggle, copy (+fallback), download, toasts, options persistence, error cards, preview cap.
- Chunker + ChunkList + sequential copy + preamble option; combine mode.
- **Accept:** e2e happy path (S1) on text files; chunk property tests pass; counters correct; copy/download verified in e2e.

### M3 — DOCX
- Implement 7.2 + fixtures + tests + encrypted-docx message.
- **Accept:** golden output matches; images warning present; e2e passes.

### M4 — XLSX / XLS / CSV
- Implement 7.3 (ADR-11) + large-sheet batching.
- **Accept:** multi-sheet golden output; pipe/newline escaping; 10 MB perf budget.

### M5 — PDF (text)
- Implement 7.4 incl. heuristics, header/footer removal, password flow (dialog + worker round-trip), page markers setting.
- **Accept:** golden tests on fixtures (heading/list/paragraph fidelity), password tests, 20-page perf budget.

### M6 — OCR (scanned PDF + images)
- Self-hosted tesseract assets (ADR-6), 7.5 in full, per-page routing, confidence warnings, progress + cancel, language opt-in UX.
- **Accept:** scanned fixture text recovered (assert key phrases; fuzzy match ≥ 90 %); mixed PDF routes correctly; cancel < 1 s; privacy test still zero external requests.

### M7 — PPTX
- Implement 7.6 (client-side, ADR-2).
- **Accept:** slide order correct for reordered fixture; notes and tables present; hidden slide labelled.

### M8 — P1 formats: RTF, HTML file, URL
- Implement 7.7, 7.8, ADR-10 (incl. docs for optional proxy).
- **Accept:** fixtures pass; URL CORS-failure guidance e2e passes.

### M9 — P2 formats: EPUB, ZIP/folders
- Implement 7.10, 7.11 with limits and file tree.
- **Accept:** nested zip and junk-dir filtering correct; limit tests produce partial result + warning, no crash.

### M10 — Edge cases & robustness sweep
- Walk §"Edge Cases" of the requirements line by line: password-protected, corrupted, 500-page PDF (generated) warnings + bounded memory, embedded-image text flag, non-English, no-text-found, mismatched extension, zero-byte, duplicate filenames, very long single line, huge single-cell spreadsheet.
- Quick-paste mode + gesture fallback.
- **Accept:** each edge case has a named test; no uncaught exceptions in any negative fixture (assert via `page.on('pageerror')`).

### M11 — Accessibility, mobile, performance, privacy hardening
- axe scans, keyboard-only e2e, mobile projects, CSP headers/meta, bundle budget, perf suite, Lighthouse CI, `npm audit`.
- *(stretch)* PWA.
- **Accept:** S2, S3, S5, S6, S7 all proven by automated checks.

### M12 — Docs, deploy, final audit
- `README.md` (what/why/how, supported formats table, privacy statement, limitations incl. CORS and encrypted Office files, dev commands), `docs/ARCHITECTURE.md`, deploy workflows (GitHub Pages with correct `base`, Vercel config), LICENSE, third-party license notices for bundled OCR data.
- **Final audit (see §16).** Only then create `.unbound-complete`.

---

## 14. The Gate — `scripts/verify.sh` (must exit non-zero on any failure)

Runs, in order, stopping at first failure and printing which check failed:
1. `npm ci` (or lockfile integrity check)
2. `npm run lint` and `npm run typecheck`
3. `npm run test:unit -- --coverage` with thresholds (≥ 85 % on core + converters)
4. `npm run build`
5. `node scripts/check-bundle.mjs` (initial JS ≤ 250 KB gzip; heavy libs only in async chunks)
6. `npx playwright test` (all projects, including privacy, a11y, perf)
7. `node scripts/check-traceability.mjs` — every row ✅, every cited test file exists, and the cited test name is found in the test output
8. **Hygiene grep:** fail on `TODO|FIXME|XXX|not implemented|it\.skip|test\.skip|test\.todo|describe\.skip|console\.log` in `src/` and `tests/` (allow `console.log` only in `scripts/`)
9. `npm audit --omit=dev --audit-level=high`

---

## 15. Traceability Matrix (`docs/TRACEABILITY.md`)

Table columns: `Req ID | Requirement (verbatim, short) | Implementation (file) | Test (path::name) | Status`.
Seed rows (extend with every bullet in the requirements):

| Req | Topic |
|---|---|
| R4.* | One row per file type in §4 table (PDF text, PDF scanned, DOCX, PPTX, XLSX/CSV, TXT/MD, images, RTF, HTML/URL, JSON/XML/code, EPUB, ZIP/folders) |
| R5.1 | Drag-drop/browse; batch (concat **or** separate, user-selectable); friendly unsupported-format error |
| R5.2 | Detection by ext **and** MIME/magic; markdown default; plain toggle; OCR progress + confidence warning; section delimiters (`## Sheet:`, `## Slide N`) |
| R5.3 | Scrollable panel; one-click copy; live chars/words/≈tokens; auto-chunk with per-chunk copy; download .md/.txt |
| R5.4 | Client-side conversion; explicit UI when anything leaves device; no persistence |
| R5.5 | ≤ 3 steps; no login; desktop + mobile |
| R6 | Performance, graceful failure, provider-agnostic, size caps with messaging, accessibility |
| R7 | Stack & architecture conformance (React+Vite, libs, static deploy) |
| R8 | Happy path user flow e2e |
| R9 | Each edge-case bullet (6 rows) |
| R11 | Each open question → resolved via ADR-7/8/2/9 |

A row is ✅ only when its test exists, runs in the gate, and passes.

---

## 16. Definition of Done & Final Audit

Before creating `.unbound-complete`, the agent must **personally re-verify, with fresh command output**, each of:

1. `bash scripts/verify.sh` exits 0 (paste the final summary into `PROGRESS.md`).
2. Every requirement in `docs/REQUIREMENTS.md` (sections 2, 4, 5, 6, 7, 8, 9, 11) has a ✅ traceability row — re-read the requirements file top to bottom and tick each bullet against the matrix; add missing rows rather than skipping.
3. Every format in the §4 table converts in the **built** app (`npm run preview`), proven by e2e — not just in unit tests.
4. No `TODO/FIXME/skip/not implemented` remains; no dead code or unused dependencies (`npx depcheck` clean or justified).
5. Privacy test green; CSP present; no external requests in the network log for any fixture.
6. Mobile (375×667) and desktop screenshots reviewed for layout defects (overflow, unreachable buttons).
7. README, ARCHITECTURE, DECISIONS up to date and accurate (limitations stated honestly: encrypted Office files, CORS on URL fetch, OCR accuracy, RTL ordering).
8. A clean clone → `npm ci && npm run build && npm run preview` works (run it in a temp dir).
9. `git status` clean; all work committed.

Only when all nine are true: write `.unbound-complete` containing the date and the verify summary.

---

## 17. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| pdf.js structure inference is imperfect | Conservative heuristics (prefer plain paragraphs over wrong headings/tables); golden tests; document limits |
| OCR asset size (~MBs) hurts load | Lazy-load only when OCR is needed; cache headers; optional PWA precache |
| Clipboard restrictions (iOS/Safari, async gesture loss) | Copy in click handler; fallback path; toast with manual-copy button |
| Workers lack DOM APIs | ADR-5 spike + main-thread-with-yielding fallback |
| Huge outputs freeze the UI | Preview cap, worker conversion, chunking, virtual-safe rendering |
| Password-protected Office files can't be decrypted client-side | Detect + honest message; not silently failing |
| CORS blocks URL input | ADR-10 guidance + optional proxy |
| Library vulnerabilities/supply chain | ADR-11, `npm audit` gate, pinned lockfile |
| Agent "declares victory" early | Gate script + traceability validator + final audit checklist + `.unbound-complete` only after §16 |

---

## 18. Working Conventions

- **`PROGRESS.md` format:** top = checklist of milestones (⬜/🟨/✅) with sub-tasks; bottom = *Iteration Log* (date, what changed, what's next, blockers). Update at the **end of every iteration**.
- **`DECISIONS.md`:** one entry per non-obvious choice (context, options, decision, consequences).
- **Branching:** work on `main` or a single feature branch; commit after each passing slice.
- **When blocked:** pick the most conservative workable alternative, document it, continue. Do not stop to ask unless a credential/secret or an irreversible external action is required.
- **Code style:** small pure functions in `core/`; converters never touch the DOM directly unless declared main-thread; no `any` (use `unknown` + narrowing); every public function has a unit test.
