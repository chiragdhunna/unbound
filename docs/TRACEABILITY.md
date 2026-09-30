# TRACEABILITY.md

| Req ID | Requirement (verbatim, short) | Implementation (file) | Test (path::name) | Status |
|---|---|---|---|---|
| R001 | Support conversion of every common file type people currently try to attach to LLMs. | TBD | TBD | ⬜ |
| R002 | Preserve document **structure** (headings, lists, tables) as markdown wherever possible — not just raw flattened text — since LLMs parse structured markdown better than a text dump. | TBD | TBD | ⬜ |
| R003 | Make the output immediately usable: one click to copy, sized appropriately (with chunking help if the output itself is very large). | TBD | TBD | ⬜ |
| R004 | Work without depending on any single LLM's API — this is a pre-processing tool, not a wrapper around a specific model. | TBD | TBD | ⬜ |
| R005 | Be simple enough to use in under 10 seconds per file: drop file → get text → copy → paste. | TBD | TBD | ⬜ |
| R006 | PDF (text-based) (P0): `pdf.js` (client-side) or `PyMuPDF`/`pdfplumber` (server-side) — Extract text + preserve headings/paragraph structure where possible | TBD | TBD | ⬜ |
| R007 | PDF (scanned/image) (P0): OCR via `tesseract.js` (client) or `pytesseract` (server) — Needs explicit "scanned PDF" detection/fallback | TBD | TBD | ⬜ |
| R008 | DOCX (P0): `mammoth.js` (client) or `python-docx` (server) — Mammoth converts docx → semantic HTML/markdown directly, preserves headings/lists | TBD | TBD | ⬜ |
| R009 | PPTX (P0): Unzip XML + extract text runs (`python-pptx` or manual XML parse) — Preserve slide boundaries and speaker notes as separate sections | TBD | TBD | ⬜ |
| R010 | XLSX / CSV (P0): `SheetJS` (client) or `openpyxl`/`pandas` (server) — Convert to markdown tables; handle multi-sheet workbooks with clear section headers per sheet | TBD | TBD | ⬜ |
| R011 | TXT / MD (P0): Pass-through — Trivial, but should still go through the same pipeline for consistency | TBD | TBD | ⬜ |
| R012 | Images (JPG/PNG with text) (P1): OCR via `tesseract.js` / cloud OCR — For screenshots, scanned notes, etc. | TBD | TBD | ⬜ |
| R013 | RTF (P1): Convert via `pandoc` or a JS RTF parser — Lower priority — less common upload type | TBD | TBD | ⬜ |
| R014 | HTML / web pages (pasted URL) (P1): Fetch + `readability`-style content extraction — Strip nav/ads, keep main content as markdown | TBD | TBD | ⬜ |
| R015 | JSON / XML / code files (P2): Pass-through with syntax-aware formatting (fenced code block) — Useful for pasting config/data files | TBD | TBD | ⬜ |
| R016 | EPUB (P2): `epub.js` or unzip + parse — Lower priority | TBD | TBD | ⬜ |
| R017 | ZIP / folders of mixed files (P2): Iterate and convert each file, concatenate with clear file-boundary markers — Useful for "whole project" pastes | TBD | TBD | ⬜ |
| R018 | User can **drag-and-drop** or **browse-select** one or more files. | TBD | TBD | ⬜ |
| R019 | Support batch upload: multiple files converted and either (a) concatenated into one output with clear per-file headers, or (b) kept as separate outputs the user can copy individually — user should be able to choose. | TBD | TBD | ⬜ |
| R020 | Clear file-type validation with a friendly error if a format isn't supported yet. | TBD | TBD | ⬜ |
| R021 | Detect file type automatically (by extension + MIME type, not just extension, to avoid mismatches). | TBD | TBD | ⬜ |
| R022 | Convert to **markdown by default** (preserves structure LLMs parse well): headings, bullet/numbered lists, tables, bold/italic where detectable. | TBD | TBD | ⬜ |
| R023 | Provide a toggle for **plain text only** output (strip all markdown formatting) for cases where the user wants minimal token overhead. | TBD | TBD | ⬜ |
| R024 | For scanned documents/images requiring OCR, show a progress indicator (OCR can be slow) and a confidence/quality warning if OCR output looks unreliable. | TBD | TBD | ⬜ |
| R025 | For multi-sheet spreadsheets or multi-slide decks, clearly delimit sections (e.g. `## Sheet: Q3 Budget`, `## Slide 4`). | TBD | TBD | ⬜ |
| R026 | Display converted text in a scrollable, read-only (or editable) text panel. | TBD | TBD | ⬜ |
| R027 | **One-click "Copy to Clipboard"** button — the core action of the tool. | TBD | TBD | ⬜ |
| R028 | Show a **live character/word/estimated-token count** of the output, since users are trying to manage LLM context limits — this is arguably as important as the conversion itself. | TBD | TBD | ⬜ |
| R029 | If output exceeds a configurable threshold (e.g. ~50k characters), offer to **auto-chunk** the output into paste-sized segments (e.g. "Part 1 of 3") with copy buttons for each chunk, so users can pass a large doc across multiple messages if needed. | TBD | TBD | ⬜ |
| R030 | Option to **download** the converted text/markdown as a `.txt`/`.md` file too, not just copy. | TBD | TBD | ⬜ |
| R031 | Strong preference for **client-side conversion** (in-browser, via JS libraries) wherever feasible, so files never leave the user's machine — this matters since users may be converting sensitive documents to paste into third-party LLMs anyway, but the *conversion step itself* shouldn't add another place data is uploaded to. | TBD | TBD | ⬜ |
| R032 | Where a file type realistically requires server-side processing (e.g. heavier OCR), be explicit in the UI about what's happening and don't persist uploaded files server-side beyond the conversion request. | TBD | TBD | ⬜ |
| R033 | Should work in under 3 steps: upload → wait for conversion → copy. | TBD | TBD | ⬜ |
| R034 | No account/login required for v1. | TBD | TBD | ⬜ |
| R035 | Should work well on both desktop and mobile browsers (mobile especially, since pasting into an LLM app is a common mobile use case). | TBD | TBD | ⬜ |
| R036 | **Performance:** Conversion of a typical document (under 20 pages / 10MB) should complete in under 5 seconds for text-based formats; OCR-based conversions can be slower but should show clear progress. | TBD | TBD | ⬜ |
| R037 | **Reliability:** Graceful failure — if a file can't be parsed, show a clear error rather than silently producing garbage output. | TBD | TBD | ⬜ |
| R038 | **Portability:** Should not be tightly coupled to any single LLM provider's ecosystem, since the entire point is provider-agnostic use. | TBD | TBD | ⬜ |
| R039 | **Scalability (if server-side components exist):** Should handle reasonably large files without timing out; consider size caps with clear messaging. | TBD | TBD | ⬜ |
| R040 | **Accessibility:** Standard web accessibility practices (keyboard navigation, screen-reader-friendly labels) for the upload and copy actions. | TBD | TBD | ⬜ |
| R041 | Frontend: React + Vite (consistent with existing tooling patterns) | TBD | TBD | ⬜ |
| R042 | Libraries: | TBD | TBD | ⬜ |
| R043 | Styling: Dark-terminal aesthetic with amber/gold accents, JetBrains Mono / IBM Plex Mono typefaces, consistent with prior project design language. | TBD | TBD | ⬜ |
| R044 | Deployment: Static hosting (e.g. GitHub Pages / Vercel), same pattern as other side projects. | TBD | TBD | ⬜ |
| R045 | A minimal serverless function (AWS Lambda, consistent with existing AWS familiarity) that accepts a file, converts it, and returns text — with no persistent storage of uploaded files. | TBD | TBD | ⬜ |
| R046 | User opens Unbound in browser. | TBD | TBD | ⬜ |
| R047 | User drags a PDF (or DOCX/XLSX/PPTX/image) onto the drop zone. | TBD | TBD | ⬜ |
| R048 | Tool detects file type, shows a brief "Converting..." state. | TBD | TBD | ⬜ |
| R049 | Converted markdown/text appears in the output panel, with a live token/character count. | TBD | TBD | ⬜ |
| R050 | User clicks "Copy to Clipboard." | TBD | TBD | ⬜ |
| R051 | User pastes directly into ChatGPT / Claude / Grok / Gemini chat box — no attachment limit hit. | TBD | TBD | ⬜ |
| R052 | Password-protected PDFs/DOCX — detect and prompt user (can't process without a decryption step). | TBD | TBD | ⬜ |
| R053 | Corrupted or malformed files — fail gracefully with a clear message. | TBD | TBD | ⬜ |
| R054 | Extremely large files (e.g. 500-page PDF) — warn about processing time, consider partial/streaming conversion. | TBD | TBD | ⬜ |
| R055 | Documents with embedded images that contain important text (e.g. a PDF with a screenshot of a table) — flag that image-embedded text may not be captured unless OCR is applied. | TBD | TBD | ⬜ |
| R056 | Non-English documents — verify OCR/text extraction libraries handle non-Latin scripts reasonably, or clearly scope v1 to English-first with future language support noted. | TBD | TBD | ⬜ |
| R057 | Files with no extractable text at all (e.g. a purely decorative PDF) — clear "no text found" message. | TBD | TBD | ⬜ |
| R058 | Should batch-uploaded files be concatenated into a single paste-ready block by default, or kept separate? (Leaning: separate by default, with a "combine all" option.) | TBD | TBD | ⬜ |
| R059 | What's the right default chunk size for auto-chunking large outputs — token-based estimate or raw character count? | TBD | TBD | ⬜ |
| R060 | Do we need any backend at all for v1, or can PPTX support be deferred to P1 to keep v1 fully client-side (and therefore simpler + more private)? | TBD | TBD | ⬜ |
| R061 | Should there be a "quick paste" mode (skip preview, auto-copy immediately after conversion) for power users? | TBD | TBD | ⬜ |
