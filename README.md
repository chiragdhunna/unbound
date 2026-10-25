<p align="center">
  <a href="https://unbound-amber-eight.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-unbound--amber--eight.vercel.app-F59E0B?style=for-the-badge&logo=vercel&labelColor=0D1117" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/100%25_Client--Side-No_Backend-10B981?style=for-the-badge&labelColor=0D1117" alt="100% Client-Side" />
  <img src="https://img.shields.io/badge/React_18-TypeScript_Strict-3B82F6?style=for-the-badge&labelColor=0D1117" alt="React 18 + TypeScript" />
  <a href="https://github.com/chiragdhunna/unbound/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/chiragdhunna/unbound/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=0D1117" alt="CI Status" /></a>
</p>

<h1 align="center">
  ⚡ Unbound
</h1>

<p align="center">
  <strong>Turn any file into clean, paste-ready markdown — so you're never blocked by an LLM's attachment limits again.</strong>
</p>

<p align="center">
  <a href="https://unbound-amber-eight.vercel.app/"><strong>🌐 Try the Live App → unbound-amber-eight.vercel.app</strong></a>
</p>

<p align="center">
  <em>Drop a PDF, DOCX, spreadsheet, image, or code file → get structured markdown → copy → paste into ChatGPT, Claude, Gemini, or Grok. <br/>
  Everything runs in your browser. No uploads. No backend. No accounts.</em>
</p>

---

## ✨ What is Unbound?

Every major LLM chat — ChatGPT, Claude, Grok, Gemini — limits file **attachments** but imposes no real limit on **pasted text**. Unbound converts your documents into clean, structured markdown that you can paste directly into any LLM prompt, bypassing attachment restrictions entirely.

```
  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────────┐
  │ Drop file │ ──▶ │  Auto-detect  │ ──▶ │  Convert to  │ ──▶ │  Copy & Paste  │
  │ (.pdf,    │     │  type by magic │     │  Markdown    │     │  into any LLM  │
  │  .png…)   │     │  bytes + ext   │     │  or Plain    │     │  chat box      │
  └──────────┘     └──────────────┘     └─────────────┘     └───────────────┘
```

### 🎯 Key Features

- **🔒 100% Private** — Files never leave your browser. No server, no analytics, no CDN
- **📋 One-Click Copy** — Convert → Copy → Paste in ≤ 3 steps
- **📊 Smart Chunking** — Large outputs auto-split into paste-sized segments with `Part X of Y`
- **🔍 Magic-Byte Detection** — File types detected by content signatures, not just extensions
- **📱 Mobile Friendly** — Works on phones and tablets for on-the-go pasting
- **♿ Accessible** — Keyboard navigable, screen-reader labels, WCAG contrast ratios

---

## 📁 Supported Formats

| Format | Extension(s) | Status | Details |
|:-------|:-------------|:------:|:--------|
| **Plain Text** | `.txt` | ✅ Working | Pass-through with encoding auto-detection (UTF-8, UTF-16, Windows-1252) |
| **Markdown** | `.md`, `.markdown` | ✅ Working | Pass-through, preserves structure |
| **JSON** | `.json` | ✅ Working | Syntax-highlighted fenced code block |
| **XML** | `.xml` | ✅ Working | Syntax-highlighted fenced code block |
| **Code** | `.js`, `.ts`, `.py`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.rb`, `.php`, `.swift`, `.kt`, `.sql`, `.sh`, `.yaml` + more | ✅ Working | Language-tagged fenced code blocks |
| **DOCX** | `.docx` | ✅ Working | Headings, lists, tables, links via Mammoth; images counted & warned |
| **XLSX / XLS** | `.xlsx`, `.xls`, `.xlsm` | ✅ Working | Multi-sheet `## Sheet:` sections, GFM tables, ISO dates, merged cells, hidden sheets |
| **CSV / TSV** | `.csv`, `.tsv` | ✅ Working | Exact cell text preserved (leading zeros, quoted spacing, BOM, Windows-1252) |
| **PDF** _(text-based)_ | `.pdf` | ✅ Working | Headings, paragraphs, lists extracted; headers/footers/page numbers auto-stripped |
| **PDF** _(scanned / mixed)_ | `.pdf` | ✅ Working | Self-hosted Tesseract.js 7.0; scanned & mixed PDF page routing, page markers, cancel < 1s, empty document detection (English-first in v1) |
| **Images** | `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.gif` | ✅ Working | OCR via self-hosted Tesseract.js 7.0; downscaled > 3000px, upscaled 2× < 1000px, English-first in v1 |
| **PPTX** | `.pptx` | 🔜 Planned | JSZip + DOMParser, slide boundaries + speaker notes |
| **RTF** | `.rtf` | 🔜 Planned | Custom lightweight text extractor |
| **HTML File** | `.html`, `.htm` | 🔜 Planned | Readability + Turndown for main-content extraction |
| **URL** | — | 🔜 Planned | Direct fetch with CORS fallback guidance |
| **EPUB** | `.epub` | 🔜 Planned | JSZip + spine-order chapter extraction |
| **ZIP / Folders** | `.zip` | 🔜 Planned | Recursive conversion of supported files within |

> [!TIP]
> Unbound detects file types by **magic bytes + MIME + extension** — so even a PDF named `report.txt` will be correctly identified and converted.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 22** (see `engines` in `package.json`)

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/chiragdhunna/unbound.git
cd unbound

# Install dependencies
npm ci

# Start development server
npm run dev
```

### Available Commands

| Command | Description |
|:--------|:------------|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm run preview` | Preview the production build locally |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests (Chromium + Mobile) |
| `npm run verify` | Full gate: lint → typecheck → build → unit → E2E → budget |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier format verification |

> [!NOTE]
> **SheetJS is vendored.** The `xlsx` package is installed from a local tarball `vendor/xlsx-0.20.3.tgz` because the npm registry copy is stale. Do **not** run `npm audit fix --force`; upgrade by replacing the tarball (see `DECISIONS.md`).

> [!NOTE]
> **WebKit E2E needs system libraries.** On machines without them, run with Chromium only: `npm run test:e2e -- --project=chromium --project=mobile-chromium`. CI covers WebKit.

---

## 🏗️ Architecture

Unbound is a **browser-only**, **zero-backend** application. Every conversion happens client-side using JavaScript/TypeScript libraries.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐ │
│  │ DropZone │──▶│ Detector │──▶│ Registry │──▶│Converter│ │
│  │  (Input) │   │ (Magic   │   │ (Lazy    │   │ (DOCX,  │ │
│  │          │   │  Bytes)  │   │  Import) │   │  PDF…)  │ │
│  └──────────┘   └──────────┘   └──────────┘   └────┬────┘ │
│                                                     │      │
│  ┌──────────────────────────────────────────────────▼────┐ │
│  │              Output Pipeline                          │ │
│  │  Markdown → Plain toggle │ Chunker │ Counters │ Copy  │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Module Map

| Module | Path | Purpose |
|:-------|:-----|:--------|
| **Detection** | `src/core/detect.ts` | Magic-byte signatures + MIME + extension → file kind |
| **Registry** | `src/core/registry.ts` | Lazy-loaded converter dispatch |
| **Pipeline** | `src/core/pipeline.ts` | Orchestrates detection → conversion → output |
| **Errors** | `src/core/errors.ts` | Typed error hierarchy (`PasswordRequired`, `CorruptFile`, etc.) |
| **Chunker** | `src/core/chunk.ts` | Structure-aware splitting with table-header repetition |
| **Encoding** | `src/core/encoding.ts` | UTF-8/16/Windows-1252 detection and decoding |
| **Converters** | `src/converters/*.ts` | One module per format (DOCX, XLSX, CSV, PDF, Image, etc.) |
| **App Shell** | `src/app/AppShell.tsx` | React UI: DropZone, JobList, OutputPanel, settings |

---

## 🔒 Privacy & Security

> [!IMPORTANT]
> **Your files never leave your browser.** Unbound has no backend, no analytics, no tracking, and no accounts.

- **Content-Security-Policy** is enforced identically in `index.html`, `_headers`, and `vercel.json`:
  - `default-src 'self'` · `worker-src 'self' blob:` · No CDN scripts, fonts, workers, or WASM
- The **pdf.js worker** is the Vite-emitted copy from `node_modules` (same-origin), never a CDN
- Only **UI settings** (never file content or names) are stored in `localStorage`
- Heavy libraries (pdfjs, SheetJS, tesseract) are **lazy-loaded** only when needed — the initial bundle stays under 70 KB gzip

### 🧠 How OCR Works (and why nothing leaves your browser)

Most web-based OCR tools send your documents to a cloud service for recognition. **Unbound does not.**
- All OCR processing executes locally inside a Web Worker via **Tesseract.js (v7.0.0)** compiled to WebAssembly (WASM). Verified end-to-end in unit and Playwright E2E suites with zero external requests and zero CSP violations.
- The worker script, WASM engine, and language models run entirely from same-origin static assets (`/ocr/worker.min.js`, `/ocr/core/`, `/ocr/lang/`).
- The design guarantees that even on scanned documents and image files, **zero bytes of document content or image data are transmitted across the network**.

### 📦 Self-Hosted OCR Assets
- **Automatic Asset Sync:** A `prebuild` hook (`scripts/sync-ocr-assets.mjs`) synchronizes `worker.min.js`, `tesseract.js`, and the three LSTM core variants (`lstm`, `simd-lstm`, `relaxedsimd-lstm`) directly from `node_modules` into `public/ocr/`.
- **Git-Ignored Binaries:** Generated runtime assets in `public/ocr/` are git-ignored and regenerated deterministically on every build.
- **Vendored Language Model:** `public/ocr/lang/eng.traineddata` (tessdata_fast, ~4.1 MB) is vendored and tracked in git so no runtime CDN downloads are needed.

---

## 📐 How to Add a New Converter

Follow the established pattern in `src/converters/docx.ts`:

1. **Create** `src/converters/<format>.ts` exporting a `convert(bytes, ctx)` function matching the `Converter` type
2. **Return** a `ConvertResult` with markdown output, warnings array, and stats
3. **Use typed errors** from `src/core/errors.ts` — never `throw new Error('...')`
4. **Lazy-load** heavy dependencies with `await import('...')` inside the converter
5. **Register** in `src/core/registry.ts` with a lazy entry
6. **Add detection rules** in `src/core/detect.ts` (extension + MIME + magic bytes)
7. **Update the UI** accept list in `src/app/AppShell.tsx`
8. **Write tests** — unit tests in `tests/unit/converters/` + E2E in `tests/e2e/`

---

## 🧪 Test Suite

| Layer | Count | Tool | Coverage |
|:------|------:|:-----|:---------|
| **Unit** | 268 | Vitest (v5.0.5) | 94.13% lines (85% gate) |
| **E2E** | 78 | Playwright (Chromium + Mobile) | Axe accessibility scans included |
| **Bundle** | — | Custom gzip check | 70,507 B / 256,000 B budget |

```bash
# Run all checks at once
npm run verify

# Unit tests with coverage
npm run test:unit -- --coverage

# E2E with specific browsers
npm run test:e2e -- --project=chromium --project=mobile-chromium
```

---

## 🎨 Design System

Unbound features a purposeful terminal-inspired design system built on custom CSS variables (`src/styles/tokens.css`):

| Token Category | Description |
|:---------------|:------------|
| **Theme Modes** | Dark terminal aesthetic by default with high-contrast light theme support (`@media (prefers-color-scheme: light)` and `[data-theme='light']`) |
| **Brand & Accents** | Warm terminal amber (`#ffb41f` dark, `#8a4800` light) with subtle glows and distinct focus rings |
| **Typography** | Self-hosted `JetBrains Mono` and `IBM Plex Mono` via `@fontsource` with complete scale (`--text-2xs` to `--text-4xl`) |
| **Spacing & Radius** | Proportional spacing scale (`--space-0-5` to `--space-12`) and rounded radii (`--radius-sm` to `--radius-2xl`, `--radius-full`) |
| **Contrast & A11y** | Strictly WCAG AA compliant (≥ 4.5:1 text, ≥ 3:1 graphical components) with 0 axe violations |
| **Motion** | Built-in `@media (prefers-reduced-motion: reduce)` guard disabling animations for reduced-motion preferences |

### 🌟 Redesigned Components

- **Hero DropZone:** Spacious drag-and-drop hero section with file upload badge, format guidance badges, and distinct primary ("Choose files") and secondary ("Choose folder") action buttons.
- **Semantic Status Chips:** Job cards feature inline status chips combining an SVG icon and text (checkmark for "Done", animated spinner for "Converting…", alert for "Error", clock for "Queued") — never color alone.
- **OCR Progress & Cancel:** Sleek high-contrast progress bar with clear page and percent indicators ("Page X of Y — Z%") and a responsive, styled Cancel button.
- **Sticky Mobile Copy:** Output toolbar and primary Copy button pin stickily to the mobile viewport (`position: sticky`), making one-tap copying effortless during mobile scrolling.
- **Actionable OCR Warnings:** Visual callouts for OCR quality with a prominent "Run OCR on this PDF" action button for documents containing large embedded images.
- **Modular Component Architecture:** Cleanly separated React components (`DropZone`, `JobCard`, `OptionsBar`, `OutputPanel`, `StatusIcon`, `WarningIcon`) under `src/app/components/`.

---

## 📊 Current Status

> Matches [`PROGRESS.md`](PROGRESS.md) exactly — last verified **2026-10-25**.

| Milestone | Description | Status |
|:----------|:------------|:------:|
| M0 | Scaffold, tooling, CI gates | ✅ Done |
| M1 | Core engine (types, detection, registry, converters) | ✅ Done |
| M2 | App shell (DropZone, copy, chunking, batch, settings) | ✅ Done |
| M3 | DOCX via Mammoth | ✅ Done |
| M4 | XLSX / XLS / CSV / TSV | ✅ Done |
| M5 | PDF text extraction (pdfjs-dist) | ✅ Done |
| M6 | OCR (scanned PDF + images) | ✅ Done |
| Redesign | Design system, hero dropzone, chips, sticky copy, a11y | ✅ Done |
| M7 | PPTX | ⬜ Planned |
| M8 | RTF, HTML file, URL | ⬜ Planned |
| M9 | EPUB, ZIP, folders | ⬜ Planned |
| M10 | Edge-case robustness sweep | ⬜ Planned |
| M11 | Accessibility, mobile, perf, privacy hardening | ⬜ Planned |
| M12 | Docs, deploy, final audit | ⬜ Planned |

### Latest Verification (2026-10-25)

```
  Unit Tests  ··········  268 / 268 passed  (31 files)
  E2E Tests   ··········   78 / 78 passed   (chromium + mobile-chromium)
  Coverage    ··········  94.13% lines       (85% gate)
  Bundle Size ··········  70,507 B gzip      (256,000 B budget)
  Lazy Chunks ··········  19 chunks          (tesseract, pdfjs, xlsx stay out of initial payload)
```

---

## ⚠️ Known Limitations

| Area | Limitation | Planned Resolution |
|:-----|:-----------|:-------------------|
| **Scanned PDFs** | Converted via self-hosted OCR (English-first in v1); tables in scanned pages & rotated pages deferred | Working as intended |
| **Image OCR** | Supported for PNG, JPG, WebP, BMP, GIF; downscaled > 3000px, upscaled 2× < 1000px; English-first in v1 | Working as intended |
| **PDF Tables** | Complex tables & multi-column layouts not reconstructed | M5.4 (table heuristic) |
| **PDF Headers/Footers** | Auto-removed when on ≥60% of pages (≥3 pages); minority-page headers kept | By design |
| **PDF Page Markers** | Off by default; toggle "Add page markers (PDF)" in settings | Available now |
| **Large PDFs** | 300+ pages convert but show a duration warning | Working as intended |
| **DOCX Images** | Counted and warned about, not extracted as text | By design |
| **XLSX Formulas** | Never evaluated — values emitted as reported by the library | Security decision |
| **CSV Values** | Exact source text preserved (SheetJS coerces, so custom parser is used) | By design |
| **OCR Languages** | English-first in v1 with self-hosted eng.traineddata; other languages not supported yet (visible note in UI) | Future enhancement |
| **WebKit E2E** | Cannot run locally without system libs; CI covers it | CI-only |

---

## 📂 Project Documentation

| Document | Description |
|:---------|:------------|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Requirements source of truth |
| [`PLAN.md`](PLAN.md) | Implementation order and acceptance criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module boundaries and data flow |
| [`PROGRESS.md`](PROGRESS.md) | Milestone checklist and latest verification results |
| [`DECISIONS.md`](DECISIONS.md) | Architectural decisions and their consequences |
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | Requirement ↔ test mapping |

---

## 🛠️ Tech Stack

| Category | Technology |
|:---------|:-----------|
| **Framework** | React 18 + TypeScript (strict mode) |
| **Build Tool** | Vite 6 |
| **PDF Parsing** | pdfjs-dist 6.4 (self-hosted worker) |
| **DOCX Parsing** | Mammoth.js |
| **Spreadsheets** | SheetJS (vendored 0.20.3) + custom CSV parser |
| **HTML → Markdown** | Turndown + GFM plugin |
| **OCR** | Tesseract.js 7 (self-hosted wasm + worker) |
| **Unit Tests** | Vitest + Testing Library + Coverage V8 |
| **E2E Tests** | Playwright + axe-core |
| **Linting** | ESLint 9 + Prettier |
| **CI** | GitHub Actions (ubuntu-24.04) |
| **Deployment** | Vercel (static) |

---

## 🚢 Deployment & CI/CD

Unbound deploys as a **static site** — no server required.

### 🌐 Live Production

The application is deployed continuously via Vercel:
- **Production URL:** [https://unbound-amber-eight.vercel.app/](https://unbound-amber-eight.vercel.app/)
- **Automatic CD:** Every push to `main` builds and deploys directly to production.
- **Preview Deployments:** Pull requests automatically receive isolated preview URLs for testing.

### Local Build & Preview

```bash
# Build for production
npm run build

# Preview locally
npm run preview
```

### Security Headers

Security headers and Content-Security-Policy are configured identically across:
- [`index.html`](index.html) — `<meta>` CSP tag
- [`_headers`](_headers) — Netlify/Cloudflare-style headers
- [`vercel.json`](vercel.json) — Vercel deployment headers

### 🔄 CI/CD Pipeline (`.github/workflows/ci.yml`)

GitHub Actions runs the comprehensive `scripts/verify.sh` gate on every push to `main` and all pull requests:
- **Linting:** ESLint 9 + strict typing rules
- **Typecheck:** `tsc -b` with strict TypeScript configuration
- **Format & Hygiene:** Prettier check and source hygiene verification
- **Build & Budget:** Production build + gzip entry budget verification (< 256 KB)
- **Unit Tests:** Vitest with strict 85% line coverage minimum
- **E2E Tests:** Playwright running cross-browser tests (Chromium + WebKit) and accessibility scans (axe-core)

---

<p align="center">
  <strong>⚡ Unbound</strong> — Break free from attachment limits.<br/>
  <sub>Built with 🧡 by <a href="https://github.com/chiragdhunna">Chirag Dhunna</a></sub>
</p>
