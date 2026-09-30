# Unbound

Client-side file-to-markdown/plain-text converter for LLM paste workflows.

## Development
- `npm ci`
- `npm run dev`
- `npm run build`
- `npm run verify`

## Current status
- M2 / M3 slice is in progress and partially complete.
- Verified working today: file upload shell, markdown/plain toggle, copy/download output, batch processing for multiple files, chunk display, and DOCX conversion via Mammoth with text extraction and warning handling.
- Not yet implemented in this branch: PDF extraction, OCR, PPTX/XLSX/RTF/HTML/URL/EPUB/ZIP/folder workflows, and the full privacy/accessibility matrix described in the plan.
- See [PROGRESS.md](PROGRESS.md) for the current milestone checklist and the latest verification results.
