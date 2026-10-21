# Unbound

Unbound turns the files you'd attach to an LLM chat — documents, spreadsheets, CSVs, PDFs, code, plain text — into clean, paste-ready markdown or plain text. **Conversion happens entirely in your browser**: files are read with the File API, parsed by bundled JavaScript, and never uploaded anywhere. There is no backend, no account, no analytics, and no CDN — see [Privacy and security](#privacy-and-security).

## Supported formats

| Format                       | Status  | Notes                                                                                                                                                                |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TXT / MD / JSON / XML / code | working | Pass-through with syntax-aware fenced output; encoding auto-detected                                                                                                 |
| DOCX                         | working | Headings, lists, tables, links, footnotes; images omitted with a warning                                                                                             |
| XLSX / XLS / XLSM            | working | Multi-sheet `## Sheet:` sections, ISO dates, merged-cell and hidden-sheet handling                                                                                   |
| CSV / TSV                    | working | Exact cell text preserved (leading zeros, quoted spacing, BOM, windows-1252)                                                                                         |
| PDF (text-based)             | working | Headings, paragraphs, and lists from embedded text; scanned PDFs show a clear message until OCR lands; complex tables and multi-column layouts are not reconstructed |
| OCR (scanned PDFs, images)   | planned | Planned with tesseract.js, self-hosted worker/wasm/language data                                                                                                     |
| PPTX, RTF, HTML file, URL    | planned | P1 formats                                                                                                                                                           |
| EPUB, ZIP / folders          | planned | P2 formats                                                                                                                                                           |

## Getting started

Requires **Node.js >= 22** (see `engines` in `package.json`).

```bash
npm ci
npm run dev        # start the dev server
npm run build      # production build
npm run test:unit  # vitest unit tests
npm run test:e2e   # Playwright e2e tests
npm run verify     # lint + typecheck + build + unit + e2e + gates
```

Two notes about dependencies:

- **SheetJS is vendored.** The `xlsx` package is installed from the local tarball `vendor/xlsx-0.20.3.tgz` because the npm registry copy is stale. Do **not** run `npm audit fix --force`; upgrade by replacing the tarball (see `DECISIONS.md`).
- **WebKit e2e needs system libraries.** On machines without them, run `npm run test:e2e -- --project=chromium --project=mobile-chromium`. CI covers WebKit.

## Privacy and security

- Everything runs in your browser; files are never uploaded, and there is no server component.
- A strict Content-Security-Policy is applied identically in `index.html`, `_headers`, and `vercel.json` (`default-src 'self'`, `worker-src 'self' blob:`); no CDN scripts, fonts, workers, or wasm are fetched from third parties.
- The pdf.js worker is the copy Vite emits from `node_modules` (same-origin), never a CDN.
- No analytics, no tracking, no accounts. Only UI settings (never file content or file names) are stored, in `localStorage`.

## Project docs

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — requirements source of truth
- [PLAN.md](PLAN.md) — implementation order and acceptance criteria
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module boundaries and data flow
- [PROGRESS.md](PROGRESS.md) — milestone checklist and latest verification results
- [DECISIONS.md](DECISIONS.md) — decisions and their consequences
- [docs/TRACEABILITY.md](docs/TRACEABILITY.md) — requirement ↔ test mapping

## Current status

Matches [PROGRESS.md](PROGRESS.md) exactly (2026-10-21):

- **M0–M4 complete**: core engine, output shell/copy/chunking, DOCX (Mammoth), XLSX/XLS/XLSM (vendored SheetJS), CSV/TSV (custom exact-text parser) — all with unit and browser tests.
- **M5 (PDF) in progress**: M5.1 (pdfjs-dist 6.4.299 + self-hosted worker under the existing CSP) and M5.2 (text-based PDF extraction: layout, scanned detection, password/corrupt errors, registration, upload e2e) are done. Header/footer removal, page markers, a table heuristic, bold detection, and 500+ page batching are deferred to M5.3; OCR (M6) is not implemented yet.
- Verified 2026-10-21: **165 of 165 unit tests** pass (24 files, zero failures), **52 e2e tests** (chromium + mobile-chromium), coverage `src/core` 93.1% / `src/converters` 92.8% lines (85% gate), initial JS **68,060 bytes gzip** of a 256,000-byte budget.

## Known limitations

- Scanned/image-only PDFs are detected and reported with a clear message ("OCR support is not available yet"); OCR itself lands with M6.
- PDF extraction preserves headings, paragraphs, and lists, but complex tables and multi-column layouts are not reconstructed, and repeating headers/footers are not yet stripped (M5.3). Non-Latin/CJK PDFs may need self-hosted cmap/font data later (see `DECISIONS.md`).
- DOCX images are counted and warned about, not extracted.
- XLSX/CSV values are emitted as the library reports them (XLSX) or exactly as written (CSV); formulas are never evaluated.
- WebKit e2e cannot run on machines missing its system libraries (CI runs it).
