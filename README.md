# Unbound

> Turn any document into clean, paste-ready markdown in your browser — bypassing LLM attachment limits.

[![Live Demo](https://img.shields.io/badge/Live_Demo-unbound--amber--eight.vercel.app-F59E0B?style=for-the-badge&logo=vercel&labelColor=0D1117)](https://unbound-amber-eight.vercel.app/)
[![CI Status](https://img.shields.io/github/actions/workflow/status/chiragdhunna/unbound/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=0D1117)](https://github.com/chiragdhunna/unbound/actions/workflows/ci.yml)
[![100% Client-Side](https://img.shields.io/badge/100%25_Client--Side-Zero_Backend-10B981?style=for-the-badge&labelColor=0D1117)](https://unbound-amber-eight.vercel.app/)
[![React 18 + TypeScript](https://img.shields.io/badge/React_18-TypeScript_Strict-3B82F6?style=for-the-badge&labelColor=0D1117)](https://unbound-amber-eight.vercel.app/)

**🌐 Production URL:** [https://unbound-amber-eight.vercel.app/](https://unbound-amber-eight.vercel.app/)

![Unbound Redesigned Terminal Interface (Dark Theme)](docs/screenshots/home-dark.png)

### Why Unbound?

- **Paste-ready markdown for LLM chats:** Convert files into clean, structured text that pastes directly into ChatGPT, Claude, Gemini, or Grok without running into file attachment restrictions.
- **Files never leave your browser:** 100% client-side conversion. Zero uploads, zero telemetry, zero server-side storage, and zero external network requests.
- **Works on scanned PDFs and photos of text:** Automatically detects scanned pages and standalone images, running local self-hosted OCR via WebAssembly without cloud APIs.

---

## Table of Contents

- [Supported Formats](#supported-formats)
- [How OCR Works](#how-ocr-works)
- [Privacy & Security](#privacy--security)
- [Supported Browsers](#supported-browsers)
- [Limits & Performance](#limits--performance)
- [Design System & Interface](#design-system--interface)
- [Current Status](#current-status)
- [Known Limitations](#known-limitations)
- [Documentation](#documentation)
- [Getting Started & Verification Gate](#getting-started--verification-gate)
- [Tech Stack](#tech-stack)

---

## Supported Formats

Unbound detects file types via **magic bytes, MIME type, and extension** (`src/core/detect.ts`), correctly identifying files even if their extensions are missing or misleading.

### Supported File Types

| Format | Extension(s) | Processing Method | Notes |
|:-------|:-------------|:------------------|:------|
| **Plain Text** | `.txt` | Pure client decoder | Auto-detects UTF-8, UTF-16, and Windows-1252 encodings. |
| **Markdown** | `.md`, `.markdown` | Pass-through | Preserves headers, lists, code fences, and formatting. |
| **JSON** | `.json` | Formatter | Pretty-printed with 2-space indentation in a syntax-highlighted code fence. |
| **XML** | `.xml` | Pass-through | Wrapped in an XML-tagged fenced code block. |
| **Code** | `.js`, `.ts`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.cs`, `.rb`, `.php`, `.swift`, `.kt`, `.sql`, `.sh`, `.yaml`, `.yml` | Syntax fence | Tagged with appropriate language identifier; handles nested backtick runs safely. |
| **CSV / TSV** | `.csv`, `.tsv` | Custom RFC-4180 parser | Sniffs delimiters (`,`, `;`, `\t`), strips BOMs, preserves exact literal cell text (leading zeros, exponent notation, quoted spacing). |
| **DOCX** | `.docx` | Mammoth.js + Turndown | Converts headings, lists, tables, and links to markdown; counts and warns about omitted embedded images. |
| **XLSX / XLS / XLSM** | `.xlsx`, `.xls`, `.xlsm` | Vendored SheetJS (0.20.3) | Emits `## Sheet: <name>` sections, GFM tables, ISO formatted dates, replicates merged top-left cells, and flags hidden sheets. |
| **PDF (Text)** | `.pdf` | `pdfjs-dist` legacy build | Strips running headers/footers (≥ 60% pages) and bare page numbers; classifies font sizes into `#`, `##`, `###` headings; de-hyphenates words across line breaks. |
| **PDF (Scanned & Mixed)** | `.pdf` | Per-page OCR routing | Evaluates each page: pages with `< 25` characters and graphics operators route automatically to self-hosted OCR. |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.gif` | Self-hosted Tesseract.js | Decoded locally via Canvas/ImageBitmap; scaled to bounded dimensions; OCR recognized to structured text. |

### Unsupported File Types & Explicit Error Messages

When an unsupported or restricted file is uploaded, Unbound throws a typed error displaying an actionable message:

| Format / Scenario | Error Type | Exact User-Facing Message |
|:------------------|:-----------|:--------------------------|
| **Legacy Word (`.doc`)** | `LegacyDocError` | `Legacy binary .doc files are not supported. Use a modern .docx format instead.` |
| **PowerPoint (`.pptx`)** | `UnsupportedFormatError` | `Unsupported format for now (pptx). Supported: txt, md, json, xml, code, pdf, docx, xlsx, xls, xlsm, csv, tsv, and image (png, jpg, webp, bmp, gif) files.` |
| **E-Books (`.epub`)** | `UnsupportedFormatError` | `Unsupported format for now (epub). Supported: txt, md, json, xml, code, pdf, docx, xlsx, xls, xlsm, csv, tsv, and image (png, jpg, webp, bmp, gif) files.` |
| **Password-Protected PDF** | `PasswordRequiredError` | `Password-protected PDF files are not supported. Save the file without a password and try again.` |
| **Corrupted / Invalid File** | `CorruptFileError` | `File appears corrupted or unreadable. Choose another copy of the file.` |

---

## How OCR Works

Unbound performs optical character recognition entirely client-side using self-hosted **Tesseract.js 7.0.0** compiled to WebAssembly (WASM). No document pixels or recognized text ever touch an external API.

```
┌─────────────────┐     ┌──────────────────────┐     ┌────────────────────────┐
│  Page / Image   │ ──▶ │  Canvas Scaler       │ ──▶ │  Tesseract WASM Worker │
│  (PDF or File)  │     │  (2× up to 3000px)   │     │  (Self-Hosted Local)   │
└─────────────────┘     └──────────────────────┘     └───────────┬────────────┘
                                                                 │
                                ┌────────────────────────────────▼────────────┐
                                │ Normalized Markdown Output                  │
                                │ + Quality / Embedded Image Warnings         │
                                └─────────────────────────────────────────────┘
```

- **Per-Page Routing Decision:** For PDF documents, each page is evaluated independently in `src/converters/ocr/decide.ts`. A page is routed to OCR if it contains `< 25` non-whitespace characters and includes image/drawing operators (`hasImageOps`).
- **Fail-Open Operator Inspection:** If pdf.js encounters an error reading `getOperatorList()` on a low-text page, the system fails open by marking `hasImageOps = true`, ensuring degraded or non-standard scans still route to OCR.
- **Embedded-Image Detection & Cost Cap:** Text pages are inspected for embedded images occupying `≥ 30%` of page area. To prevent unbounded latency on large documents, operator list scanning on text pages is capped to the first 20 text pages (`MAX_TEXT_PAGES_FOR_IMAGE_DETECTION = 20`). When detected, an `EMBEDDED_IMAGES_MAY_CONTAIN_TEXT` warning appears alongside a one-click **"Run OCR on this PDF"** button that forces full-document OCR (`forceOcr: true`).
- **Image Scaling & Memory Bounds:**
  - Standalone images and PDF page canvases are scaled via `computeImageScale` and `computeRenderScale`:
  - **Upscaling:** Images with both dimensions `< 1000px` are upscaled `2×` to improve character separation.
  - **Downscaling:** Images with a maximum dimension `> 3000px` are clamped so their longest edge is exactly `3000px` (~36 MB uncompressed RGBA canvas buffer).
  - Canvases are explicitly zeroed (`canvas.width = 0; canvas.height = 0`) via `releaseCanvas()` immediately after recognition to trigger garbage collection.
- **Single Reused Sequential Worker:** A single Web Worker instance is lazily instantiated and reused across pages. Concurrent recognition calls are rejected with `OcrFailedError` to prevent runaway memory consumption.
- **Sub-Second Cancellation:** Clicking the Cancel button triggers an `AbortController`. The engine listens to `signal.abort()` and terminates the underlying Web Worker immediately, aborting within `< 1` second (measured ~18 ms in-page).
- **Confidence & Quality Warnings:**
  - Mean word confidence `< 70%`: emits `LOW_OCR_CONFIDENCE` (`"Low OCR confidence (N%). Text may contain errors."`).
  - Mean word confidence `< 40%` or `< 10` recognized non-whitespace characters: emits `"OCR output looks unreliable (N%)."`.
- **Language Scope:** v1 is scoped to **English-first** using the vendored `eng.traineddata` model. A visible notice in the UI informs users of this scope.

---

## Privacy & Security

Unbound was built from the ground up for strict local privacy:

- **No Remote Conversion Calls:** No servers, no microservices, and no analytics SDKs. Conversion code executes strictly in the user's browser sandbox.
- **Strict Content-Security-Policy (CSP):** Identically configured in `index.html`, `_headers`, and `vercel.json`:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'
  ```
- **Self-Hosted OCR Assets:** All OCR assets are hosted at same-origin paths under `/ocr/` and loaded locally:
  - Worker: `/ocr/worker.min.js`
  - WASM Cores: `/ocr/core/tesseract-core-*.wasm.js` (`lstm`, `simd-lstm`, `relaxedsimd-lstm`)
  - Language Data: `/ocr/lang/eng.traineddata` (vendored fast model, ~4.1 MB)
  - No CDNs, no external unpkg/jsdelivr links.
- **Zero Network Traffic & Zero CSP Violations:** Verified by Playwright E2E suites (`tests/e2e/pdf.spec.ts`, `tests/e2e/image.spec.ts`) asserting 0 non-same-origin network requests and 0 console security warnings during active OCR.
- **Local Settings Storage Only:** Only UI preferences (e.g. theme, copy preferences, page marker toggles) are stored in `localStorage`. File names and contents are never persisted.

---

## Supported Browsers

Unbound runs on modern evergreen browsers supporting ES2022, WebAssembly (`wasm-unsafe-eval`), Web Workers, and the HTML5 Canvas / OffscreenCanvas APIs.

- **Tested & Verified in CI:**
  - **Chromium** (Desktop Linux, Windows, macOS)
  - **Mobile Chromium** (Pixel 5 emulation)
  - **Mobile WebKit** (iPhone 12 / Safari emulation in GitHub Actions CI)
- **Untested:** Desktop Firefox is currently untested in CI.
- **Older Browser Compatibility & Graceful Errors:** The application runs the `pdfjs-dist/legacy/build/pdf.mjs` build to avoid recent ECMAScript stage 3/4 requirements (e.g. `Map.prototype.getOrInsertComputed` missing in Chromium < 142). If a user accesses Unbound using an outdated browser missing required Canvas or WASM features, the converter catches the missing API and displays an actionable error:
  `"Your browser is missing a feature required to process this PDF (...). Please update your browser."` (never misreported as `"No text found"`).

---

## Limits & Performance

| Dimension | Measured Value | Implementation & Enforcement |
|:----------|:---------------|:-----------------------------|
| **Initial JS Bundle** | **70,509 B gzip** | Strictly enforced under 256,000 B budget (`scripts/check-bundle.mjs`). Heavy dependencies (pdfjs, SheetJS, tesseract.js) live in 19 lazy-loaded chunks. |
| **Output Preview Cap** | **200,000 characters** | UI preview caps display at 200,000 chars to maintain 60fps rendering. The **Copy** and **Download** actions always operate on the full uncapped output. |
| **Large Document Warning** | **300 pages** | Documents exceeding 300 pages display an advisory note. Page loops yield to the browser UI thread via macrotask yields (`setTimeout(0)`). |
| **OCR Memory Ceiling** | **≤ 3000 px max edge** | Canvas buffers are capped at a 3000px long edge (~36 MB uncompressed RGBA) and zeroed out upon job completion. |
| **Image Detection Bound** | **First 20 text pages** | Bounded via `MAX_TEXT_PAGES_FOR_IMAGE_DETECTION = 20`. Keeps operator list overhead to 0% for pages 21+. |
| **Cancel Response Time** | **~18 ms in-page** | Worker termination occurs in `< 1` second on both desktop and mobile viewports. |

### Embedded Image Detection Benchmark (Task 1 Measurements)

Measured median conversion times (`pdfConverter.convert`) across 3 runs on 300-page benchmark documents:

| Test Fixture (300 Pages) | Detection OFF | Detection ON | Overhead (%) | Overhead Ratio |
|:-------------------------|:-------------:|:------------:|:------------:|:--------------:|
| **Pure Text PDF** | 575.5 ms | 710.8 ms | +23.5% | 1.235× |
| **Mixed PDF (every 10th page image)** | 554.7 ms | 667.8 ms | +20.4% | 1.204× |

*Decision:* Because detection overhead exceeded the 15% threshold (+23.5% and +20.4%), detection was capped to the first 20 text pages. Low-text OCR routing remains active on every page.

---

## Design System & Interface

Unbound features a terminal-inspired interface built on CSS custom properties (`src/styles/tokens.css`):

| Feature | Light Theme | Dark Theme |
|:--------|:------------|:-----------|
| **Theme Aesthetic** | High-contrast warm paper | Dark terminal console |
| **Accent & Brand** | Warm amber (`#8a4800`, 5.8:1 contrast) | Bright terminal amber (`#ffb41f`, 9.5:1 contrast) |
| **Typography** | `JetBrains Mono` & `IBM Plex Mono` | `JetBrains Mono` & `IBM Plex Mono` |
| **Contrast Compliance** | Strict WCAG AA (≥ 4.5:1 text, ≥ 3:1 UI) | Strict WCAG AA (≥ 4.5:1 text, ≥ 3:1 UI) |
| **Accessibility** | 0 axe-core violations | 0 axe-core violations |

```carousel
![Terminal Dark Theme DropZone Hero](docs/screenshots/home-dark.png)
<!-- slide -->
![Warm Paper Light Theme DropZone Hero](docs/screenshots/home-light.png)
<!-- slide -->
![Converted Markdown Output with Token & Character Counters](docs/screenshots/converted-output.png)
<!-- slide -->
![Active OCR Progress Bar and Cancel Action](docs/screenshots/ocr-progress.png)
<!-- slide -->
![Sticky Mobile Copy Button on Narrow Viewports](docs/screenshots/mobile-copy.png)
```

- **Hero DropZone:** Prominent upload target with format tags, file picker, and folder upload support.
- **Semantic Status Chips:** Job cards display status using both SVG icons and text (e.g. checkmark for `Done`, spinner for `Converting…`, alert for `Error`), never relying on color alone.
- **Sticky Mobile Copy:** On mobile viewports (≤ 640px), the output panel copy button pins stickily to the bottom of the screen (`position: sticky`), enabling instant copying without scrolling back to top.
- **Motion Preference Guard:** Includes `@media (prefers-reduced-motion: reduce)` rules that automatically disable animations and transitions for users with motion sensitivities.

---

## Current Status

> Synchronized with [`PROGRESS.md`](PROGRESS.md) and verified on **2026-10-25**.

| Milestone | Scope | Status |
|:----------|:------|:------:|
| **M0** | Scaffold, linting, typecheck, CI gate, bundle checker | ✅ Complete |
| **M1** | Core engine (types, magic-byte detection, registry, pipeline) | ✅ Complete |
| **M2** | UI AppShell (DropZone, output panel, copy/download, chunking, settings) | ✅ Complete |
| **M3** | DOCX conversion via Mammoth.js + Turndown | ✅ Complete |
| **M4** | Spreadsheets: XLSX / XLS / XLSM (vendored SheetJS) and CSV / TSV | ✅ Complete |
| **M5** | PDF text extraction (pdfjs-dist legacy build, layout, headers/footers) | ✅ Complete |
| **M6** | OCR Engine (scanned PDF routing, image conversion, progress, cancel, warnings) | ✅ Complete |
| **UI Redesign** | Design system tokens, hero DropZone, status chips, sticky copy, a11y | ✅ Complete |

### Latest Verification (Fresh Run: 2026-10-25)

```
Unit Tests  ··········  286 / 286 passed  (32 files)
E2E Tests   ··········   78 / 78 passed   (Chromium + Mobile Chromium)
Coverage    ··········  95.73% lines      (85% gate requirement)
Bundle Size ··········  70,509 B gzip     (256,000 B initial JS budget)
Lazy Chunks ··········  19 chunks         (tesseract, pdfjs, xlsx kept out of initial bundle)
Security    ··········  0 vulnerabilities (npm audit --omit=dev --audit-level=high)
```

---

## Known Limitations

- **English-Only OCR (v1):** OCR is currently scoped to English using the vendored `eng.traineddata` model. A visible note in the UI informs users. Non-English language models are planned for future releases.
- **Unstructured Scanned Tables:** OCR extracts sequential lines of text; complex tables and multi-column layouts inside scanned pages are not reconstructed into markdown grid syntax.
- **Complex Scans & Handwriting:** Low-quality scans, blurry camera photos, or handwriting produce lower recognition rates; Unbound flags these with a `"looks unreliable"` warning when confidence is `< 40%`.
- **Large Scan Processing Time:** Sequential WASM OCR execution on 50+ page scanned documents can take several minutes depending on CPU performance.
- **DOCX Images:** Images inside `.docx` files are not extracted or OCR'd; an informational warning (`IMAGES_OMITTED`) is emitted.

---

## Documentation

| Document | Description |
|:---------|:------------|
| [`PLAN.md`](PLAN.md) | Implementation blueprint, milestone definitions, and acceptance criteria. |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Authoritative scope, format support requirements, and design constraints. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Detailed module architecture, pipeline flow, and Mermaid sequence diagrams. |
| [`PROGRESS.md`](PROGRESS.md) | Append-only milestone progress log, verification records, and audit history. |
| [`DECISIONS.md`](DECISIONS.md) | Architectural decision records (ADRs) with rationale and consequences. |
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | Requirement-to-test mapping matrix verified by automated gate script. |

---

## Getting Started & Verification Gate

### Prerequisites

- **Node.js ≥ 22** (`package.json` engines requirement)
- **npm ≥ 10**

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/chiragdhunna/unbound.git
cd unbound

# Install dependencies (SheetJS installed from vendor/xlsx-0.20.3.tgz)
npm ci

# Start the Vite development server (runs sync-ocr-assets prebuild automatically)
npm run dev
```

### Running the Verification Gate

The comprehensive local gate script runs all checks enforced by CI:

```bash
# Run full verification gate (lint, typecheck, build, unit+coverage, bundle, traceability)
bash scripts/verify.sh

# Run unit tests with V8 coverage report
npm run test:unit -- --coverage

# Run Playwright E2E tests (Chromium + Mobile Chromium)
npm run test:e2e -- --project=chromium --project=mobile-chromium

# Check initial bundle gzip size against budget
node scripts/check-bundle.mjs

# Verify traceability requirement mappings
node scripts/check-traceability.mjs
```

> [!NOTE]
> `npm run build` triggers `prebuild` (`scripts/sync-ocr-assets.mjs`), synchronizing Tesseract worker and WASM assets from `node_modules` into `public/ocr/`. These assets are git-ignored and deterministically rebuilt.

> [!NOTE]
> Mobile WebKit E2E tests require system WebKit dependencies that may not be present in local Linux environments. GitHub Actions CI acts as the definitive authority for WebKit verification.

---

## Tech Stack

| Component | Technology | Description |
|:----------|:-----------|:------------|
| **UI Framework** | React 18 | Declarative component UI with zero component library dependencies. |
| **Language** | TypeScript (Strict) | Strict typing across all core modules and converter interfaces. |
| **Build & Bundler** | Vite 6 | Lightning-fast HMR and optimized Rollup code splitting. |
| **PDF Extraction** | `pdfjs-dist` (6.4.299) | Legacy build for cross-browser parsing and canvas rendering. |
| **OCR Engine** | `tesseract.js` (7.0.0) | Local WASM LSTM neural net engine with self-hosted assets. |
| **DOCX Parsing** | Mammoth.js (1.8.0) | Semantic HTML extraction from Word documents. |
| **Spreadsheet Parsing** | SheetJS (0.20.3) | Vendored tarball parsing `.xlsx`, `.xls`, `.xlsm` workbooks. |
| **Markdown Conversion**| Turndown + GFM plugin | Clean HTML-to-ATX markdown transformation. |
| **Testing** | Vitest & Playwright | Fast unit tests with V8 coverage; cross-browser E2E testing with `axe-core`. |

---

<p align="center">
  <strong>⚡ Unbound</strong> — Break free from attachment limits.<br/>
  <sub>Client-side document conversion for the modern LLM workflow.</sub>
</p>
