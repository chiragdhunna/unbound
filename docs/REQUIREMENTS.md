# Unbound — Requirements Document

**Tagline:** Turn any file into clean, pasteable text — so you're never blocked by an LLM's attachment limits again.

---

## 1. Problem Statement

Every major LLM chat interface (ChatGPT, Claude, Grok, Gemini) enforces limits on file **attachments** — max file size, number of files per message, or supported formats. However, these same interfaces impose no meaningful limit on **pasted text** in the prompt box.

Today, if a user has a large PDF, a big spreadsheet, or a folder of mixed documents they want an LLM to reason over, they're often blocked or throttled by attachment restrictions — even though the LLM could easily handle the same content if it arrived as plain text/markdown in the chat box instead.

**Unbound** solves this by converting any supported file type into clean, structured text (preferably markdown) that a user can copy and paste directly into any LLM chat, bypassing attachment limits entirely.

---

## 2. Goals

- Support conversion of every common file type people currently try to attach to LLMs.
- Preserve document **structure** (headings, lists, tables) as markdown wherever possible — not just raw flattened text — since LLMs parse structured markdown better than a text dump.
- Make the output immediately usable: one click to copy, sized appropriately (with chunking help if the output itself is very large).
- Work without depending on any single LLM's API — this is a pre-processing tool, not a wrapper around a specific model.
- Be simple enough to use in under 10 seconds per file: drop file → get text → copy → paste.

## 3. Non-Goals (Out of Scope for v1)

- Not building an LLM chat interface itself — output is meant to be pasted into existing tools (ChatGPT, Claude, Grok, Gemini, etc.).
- Not handling real-time collaborative editing of the converted text.
- Not doing semantic summarization/compression of content (v1 is a faithful converter, not a summarizer) — may be a future enhancement.
- Not building OCR from scratch — will rely on existing libraries/services.

---

## 4. Target File Types & Conversion Approach

| File Type | Priority | Conversion Approach | Notes |
|---|---|---|---|
| PDF (text-based) | P0 | `pdf.js` (client-side) or `PyMuPDF`/`pdfplumber` (server-side) | Extract text + preserve headings/paragraph structure where possible |
| PDF (scanned/image) | P0 | OCR via `tesseract.js` (client) or `pytesseract` (server) | Needs explicit "scanned PDF" detection/fallback |
| DOCX | P0 | `mammoth.js` (client) or `python-docx` (server) | Mammoth converts docx → semantic HTML/markdown directly, preserves headings/lists |
| PPTX | P0 | Unzip XML + extract text runs (`python-pptx` or manual XML parse) | Preserve slide boundaries and speaker notes as separate sections |
| XLSX / CSV | P0 | `SheetJS` (client) or `openpyxl`/`pandas` (server) | Convert to markdown tables; handle multi-sheet workbooks with clear section headers per sheet |
| TXT / MD | P0 | Pass-through | Trivial, but should still go through the same pipeline for consistency |
| Images (JPG/PNG with text) | P1 | OCR via `tesseract.js` / cloud OCR | For screenshots, scanned notes, etc. |
| RTF | P1 | Convert via `pandoc` or a JS RTF parser | Lower priority — less common upload type |
| HTML / web pages (pasted URL) | P1 | Fetch + `readability`-style content extraction | Strip nav/ads, keep main content as markdown |
| JSON / XML / code files | P2 | Pass-through with syntax-aware formatting (fenced code block) | Useful for pasting config/data files |
| EPUB | P2 | `epub.js` or unzip + parse | Lower priority |
| ZIP / folders of mixed files | P2 | Iterate and convert each file, concatenate with clear file-boundary markers | Useful for "whole project" pastes |

**Priority key:** P0 = must-have for v1 launch. P1 = should-have, soon after v1. P2 = nice-to-have, later.

---

## 5. Functional Requirements

### 5.1 Input
- User can **drag-and-drop** or **browse-select** one or more files.
- Support batch upload: multiple files converted and either (a) concatenated into one output with clear per-file headers, or (b) kept as separate outputs the user can copy individually — user should be able to choose.
- Clear file-type validation with a friendly error if a format isn't supported yet.

### 5.2 Conversion
- Detect file type automatically (by extension + MIME type, not just extension, to avoid mismatches).
- Convert to **markdown by default** (preserves structure LLMs parse well): headings, bullet/numbered lists, tables, bold/italic where detectable.
- Provide a toggle for **plain text only** output (strip all markdown formatting) for cases where the user wants minimal token overhead.
- For scanned documents/images requiring OCR, show a progress indicator (OCR can be slow) and a confidence/quality warning if OCR output looks unreliable.
- For multi-sheet spreadsheets or multi-slide decks, clearly delimit sections (e.g. `## Sheet: Q3 Budget`, `## Slide 4`).

### 5.3 Output
- Display converted text in a scrollable, read-only (or editable) text panel.
- **One-click "Copy to Clipboard"** button — the core action of the tool.
- Show a **live character/word/estimated-token count** of the output, since users are trying to manage LLM context limits — this is arguably as important as the conversion itself.
- If output exceeds a configurable threshold (e.g. ~50k characters), offer to **auto-chunk** the output into paste-sized segments (e.g. "Part 1 of 3") with copy buttons for each chunk, so users can pass a large doc across multiple messages if needed.
- Option to **download** the converted text/markdown as a `.txt`/`.md` file too, not just copy.

### 5.4 Privacy / Processing Location
- Strong preference for **client-side conversion** (in-browser, via JS libraries) wherever feasible, so files never leave the user's machine — this matters since users may be converting sensitive documents to paste into third-party LLMs anyway, but the *conversion step itself* shouldn't add another place data is uploaded to.
- Where a file type realistically requires server-side processing (e.g. heavier OCR), be explicit in the UI about what's happening and don't persist uploaded files server-side beyond the conversion request.

### 5.5 Usability
- Should work in under 3 steps: upload → wait for conversion → copy.
- No account/login required for v1.
- Should work well on both desktop and mobile browsers (mobile especially, since pasting into an LLM app is a common mobile use case).

---

## 6. Non-Functional Requirements

- **Performance:** Conversion of a typical document (under 20 pages / 10MB) should complete in under 5 seconds for text-based formats; OCR-based conversions can be slower but should show clear progress.
- **Reliability:** Graceful failure — if a file can't be parsed, show a clear error rather than silently producing garbage output.
- **Portability:** Should not be tightly coupled to any single LLM provider's ecosystem, since the entire point is provider-agnostic use.
- **Scalability (if server-side components exist):** Should handle reasonably large files without timing out; consider size caps with clear messaging.
- **Accessibility:** Standard web accessibility practices (keyboard navigation, screen-reader-friendly labels) for the upload and copy actions.

---

## 7. Proposed Architecture (v1)

**Preferred: Browser-only, client-side app (no backend required for P0 file types)**

- Frontend: React + Vite (consistent with existing tooling patterns)
- Libraries:
  - `pdf.js` — PDF text extraction
  - `tesseract.js` — OCR fallback for scanned PDFs/images
  - `mammoth.js` — DOCX → HTML/markdown
  - `SheetJS (xlsx)` — XLSX/CSV → markdown tables
  - Custom lightweight parser (or `python-pptx` via a small serverless function) for PPTX, since PPTX is not well-served by pure client-side JS libraries
- Styling: Dark-terminal aesthetic with amber/gold accents, JetBrains Mono / IBM Plex Mono typefaces, consistent with prior project design language.
- Deployment: Static hosting (e.g. GitHub Pages / Vercel), same pattern as other side projects.

**Optional backend (only if needed for PPTX/heavier OCR):**
- A minimal serverless function (AWS Lambda, consistent with existing AWS familiarity) that accepts a file, converts it, and returns text — with no persistent storage of uploaded files.

---

## 8. User Flow (v1 happy path)

1. User opens Unbound in browser.
2. User drags a PDF (or DOCX/XLSX/PPTX/image) onto the drop zone.
3. Tool detects file type, shows a brief "Converting..." state.
4. Converted markdown/text appears in the output panel, with a live token/character count.
5. User clicks "Copy to Clipboard."
6. User pastes directly into ChatGPT / Claude / Grok / Gemini chat box — no attachment limit hit.

---

## 9. Edge Cases to Handle

- Password-protected PDFs/DOCX — detect and prompt user (can't process without a decryption step).
- Corrupted or malformed files — fail gracefully with a clear message.
- Extremely large files (e.g. 500-page PDF) — warn about processing time, consider partial/streaming conversion.
- Documents with embedded images that contain important text (e.g. a PDF with a screenshot of a table) — flag that image-embedded text may not be captured unless OCR is applied.
- Non-English documents — verify OCR/text extraction libraries handle non-Latin scripts reasonably, or clearly scope v1 to English-first with future language support noted.
- Files with no extractable text at all (e.g. a purely decorative PDF) — clear "no text found" message.

---

## 10. Future Enhancements (Post-v1)

- Optional AI-assisted **summarization/compression mode** for users who want a condensed version rather than the full text (useful when even the text version is too long for one paste).
- Browser extension version — right-click any file/webpage → "Convert with Unbound."
- Batch folder/ZIP upload with a single combined, well-structured output.
- Shareable output link (with expiry) as an alternative to copy/paste, for very large outputs.
- Presets per target LLM (e.g. a "Claude-optimized" markdown style vs a "ChatGPT-optimized" style) if meaningful differences in parsing quality are found.

---

## 11. Open Questions

- Should batch-uploaded files be concatenated into a single paste-ready block by default, or kept separate? (Leaning: separate by default, with a "combine all" option.)
- What's the right default chunk size for auto-chunking large outputs — token-based estimate or raw character count?
- Do we need any backend at all for v1, or can PPTX support be deferred to P1 to keep v1 fully client-side (and therefore simpler + more private)?
- Should there be a "quick paste" mode (skip preview, auto-copy immediately after conversion) for power users?

---

## 12. Project Name

**Unbound** — chosen to reflect the core idea of removing (attachment) limits/bounds on what content can be brought into an LLM conversation.
