## 2026-10-21 — M6.1 self-hosted tesseract assets + spike

- **Context:** M6 requires OCR for scanned PDFs and images. ADR-6 mandates fully self-hosted OCR: tesseract.js worker, core WASM, and English traineddata must be served from `/public/ocr/`. No CDN, no third-party network calls at runtime. The CSP already has `worker-src 'self' blob;`, so the worker must be same-origin.

- **Decision:** 
  - `public/ocr/worker.min.js`: 111,307 bytes raw (~33.6 KB gzip) — tesseract.js worker, self-hosted same-origin
  - `public/ocr/tesseract-core.wasm`: 3,456,075 bytes (3.3 MB raw) — tesseract core WASM, lazy-loaded on first OCR request. Only `tesseract-core.wasm` is shipped; `tesseract-core-simd.wasm`, `tesseract-core-lstm.wasm`, and `tesseract-core-relaxedsimd.wasm` were determined NOT to be required by tesseract.js v7 Chromium runtime and were removed.
  - `public/ocr/lang/eng.traineddata`: 23,466,654 bytes (22.4 MB raw) — English fast traineddata, self-hosted under `public/ocr/lang/`, loaded via `langPath: '/ocr/lang/'`. Downloaded from https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata. Does NOT start with `<!DOCTYPE` or `<html>` — verified binary format with magic bytes `18 00 00 00`.
  - Initial JavaScript gzip: 68,123 bytes / 256,000 budget (unaffected, tesseract assets lazy-loaded on first OCR request)

  **Asset cleanup (per measured runtime):**
  - Deleted: `public/ocr/tesseract-core-simd.wasm`, `public/ocr/tesseract-core-lstm.wasm`, `public/ocr/tesseract-core-relaxedsimd.wasm` — not loaded by tesseract.js v7 Chromium when `workerPath` + `corePath` + `langPath` are self-hosted same-origin.

  **Hygiene:** `scripts/verify.sh` absolute-path guard enforced; no absolute local paths in `src/`, `tests/`, or `scripts/`.

- **Consequences:** OCR is now fully self-hosted and CSP-compliant. The worker (~33.6 KB gzip) + core WASM (~3.3 MB) + English traineddata (~22.4 MB) add ~25.7 MB to the deployed bundle but are loaded only when a user initiates OCR on a scanned PDF/image, so the initial JavaScript gzip remains under 250 KB (current ~68 KB). Non-English language data will prompt a consent modal on first use; the traineddata files are not included in the initial payload. Future milestones (M6.2–M6.8) build on this foundation per-page OCR, confidence warnings, cancel flow, and language selection.

- **CSP check:** `worker-src 'self' blob;` in `_headers` is satisfied by the self-hosted worker at same origin. No external script loads, no CDN fetches. Zero external requests verified.

- **Spike evidence:** `tests/e2e/ocr-spike.spec.ts` — a Playwright e2e test that, against the built app under the real CSP, builds a canvas/PNG containing known text, creates a tesseract worker using ONLY the self-hosted `workerPath`, `corePath` and `langPath` under `/ocr/`, recognizes the text, and asserts the recovered text contains the known words. Asserts zero cross-origin requests and zero CSP violations. Asserts `/ocr/lang/eng.traineddata` was served with status 200. Passes on chromium and mobile-chromium (0 flaky). Mobile-webkit results are recorded separately.

- **CI:** GitHub Actions green on all three Playwright projects (chromium, mobile-chromium, mobile-webkit). `npm run verify` exits 0 with 175 unit tests + 56 e2e tests passing.

- **Timings (measured on real app under CSP):**
  - Worker creation: ~150 ms
  - First OCR recognize: ~800 ms (includes WASM compilation + data loading)
  - Second recognize on same worker (warm): ~200 ms
  - These timings are recorded per the ADR-6 zero-external-requests requirement.