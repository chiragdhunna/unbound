# Unbound

Client-side file-to-markdown/plain-text converter for LLM paste workflows.

## Development

- `npm ci`
- `npm run dev`
- `npm run build`
- `npm run verify`

## Current status

- M0, M1, M2, M3, and M4 milestones are complete.
- Verified working today: file upload shell, markdown/plain toggle, copy/download output, batch processing for multiple files, chunk display, DOCX conversion via Mammoth with a single warning for embedded images, XLSX/XLS conversion via vendored SheetJS (multi-sheet `## Sheet:` sections, ISO dates, merged/hidden/empty-sheet handling), and CSV/TSV conversion via a custom RFC-4180 parser that preserves cell text exactly (leading zeros, quoted spacing, semicolon/TSV delimiter detection, UTF-8 BOM and windows-1252 input).
- Formats supported today: text/code (txt, md, json, xml, common code files), DOCX, XLSX/XLS/XLSM, CSV/TSV.
- Not yet implemented in this branch: PDF (text), OCR, PPTX, RTF, HTML file/URL, EPUB, ZIP/folders, and the full privacy/accessibility matrix described in the plan.
- See [PROGRESS.md](PROGRESS.md) for the current milestone checklist and the latest verification results.
