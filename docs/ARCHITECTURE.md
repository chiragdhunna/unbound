# Architecture Overview

## Browser-only processing and privacy boundaries
Unbound runs entirely in the browser. No file data is sent to external servers. All conversion occurs client-side using Web APIs (FileReader, Blob, etc.) and JavaScript libraries. Privacy boundary: files never leave the user's device unless explicitly copied/downloaded by the user.

## Actual current flow
1. **Input**: User selects file(s) via drag-and-drop, file picker, or paste.
2. **Detection**: `detectFileKind` (src/core/detect.ts) examines file signature/mimetype/extension to determine file kind (text, markdown, json, xml, code, docx, etc.).
3. **Registry**: `loadConverter` (src/core/registry.ts) dynamically imports the appropriate converter module.
4. **Converter**: The converter's `convert` method processes the file bytes with a `ConvertContext` (abort signal, progress callback, options) and returns a `ConvertResult` (markdown output, warnings, stats).
5. **Output**: The result is stored in the job's `output` and `rawMarkdown` fields. UI updates via React state.

## Actual supported formats (M1/M2 slice)
- Text (.txt)
- Markdown (.md/.markdown)
- JSON (.json)
- XML (.xml)
- Code (.js, .ts, .tsx, .jsx, .py, .go, .rs, .java, .c, .cpp, .cs, .rb, .php, .swift, .kt, .sql, .sh, .yaml, .yml)
- DOCX (.docx) via mammoth.js

## Job identity, attempt identity, retry/removal, and late-result rules
- **Job ID**: UUIDv4-like string (`${name}-${random}-${timestamp}`) assigned at file ingestion. Identifies the input file throughout its lifetime.
- **Attempt identity**: Each conversion attempt (initial or retry) increments an implicit attempt counter (not stored explicitly; implied by job state transitions). An obsolete attempt (e.g., from a prior retry) cannot overwrite a newer result.
- **Retry**: Only allowed on jobs with status `error`. Uses the original `job.file` object. Updates the same job in place (status → `converting` → `done`/`error`). Does not create a new job.
- **Removal**: Removes the job from the `jobs` array. The job cannot be resurrected; associated UI elements (toasts, selection, clipboard) are cleared.
- **Late-result rule**: If an older attempt finishes after a newer attempt has already updated the job, the older result is ignored. The job state reflects the latest successful or failed attempt.

## Canonical conversion results versus per-document/per-mode draft overrides
- **Canonical result**: The `output` field holds the final conversion result (markdown or plain text) based on the latest successful attempt.
- **Draft override**: When edit mode is enabled, the `draftText` field holds user-edited text, which overrides the canonical result for preview and copy actions. Leaving edit mode resets `draftText` to the canonical result.
- **Per-mode toggle**: Switching between markdown/plain output modes does not alter the canonical result; it only changes the displayed/projected text.

## One effective output projection for preview/counts/chunks/copy/download
- **Effective text**: `activeText = editMode ? draftText : displayText`.
- **`displayText`**: Derived from `sourceMarkdown` via `outputMode` (markdown/plain).
- **`sourceMarkdown`**: 
  - In `batchMode: 'separate'`: `selectedJob?.rawMarkdown ?? selectedJob?.output ?? ''`.
  - In `batchMode: 'combined'`: Concatenation of all visible jobs' `output ?? rawMarkdown ?? 'No content converted.'`, each prefixed with `# File: {job.name}`.
- **Visible jobs**: Jobs with status `done`, `error`, or non-empty `output`.
- **Preview**: Shows first 200,000 characters of `activeText` with a notice if truncated.
- **Counts/Chunks**: Computed from `displayText` (not `activeText`; chunking uses the canonical output, not the draft).
- **Copy/Drop**: Use `activeText` (respects edit mode) for copy; download uses `activeText` as well.

## Intended worker/queue boundary (NOT implemented)
- The architecture assumes a potential worker/queue boundary for off-main-thread conversion, but the current implementation runs converters synchronously on the main thread. 
- **Intended**: A worker pool (e.g., via WorkerPool API) would handle `convertFile` calls, with the main thread managing job state and UI.
- **Current**: Converter invocation blocks the UI during processing. A `signal` (AbortSignal) is passed to allow future cancellation, but is not yet wired to a worker boundary.

## Current limitations and next stabilization stages
- **Limitations**:
  - Main-thread blocking during conversion.
  - Only M1/M2 slice formats supported (text, markdown, json, xml, code, docx).
  - No OCR for scanned PDFs/images.
  - No PPTX, XLSX, CSV, RTF, HTML, EPUB, URL, ZIP, folder workflows.
  - No advanced privacy/network controls (though files stay local by design).
  - No accessibility refinements (focus order, ARIA labels, etc.).
  - No strict-mode safety guarantees (React 18).
- **Next stabilization stages** (P0):
  - PDF text-based extraction.
  - Scanned PDF OCR.
  - PPTX slide extraction.
  - XLSX/CSV to markdown tables.
  - Each with fidelity, error handling, privacy, and resource acceptance tests.