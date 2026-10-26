import { type ChangeEvent, type DragEvent, type RefObject } from 'react'

type DropZoneProps = {
  dragging: boolean
  setDragging: (dragging: boolean) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  fileInputRef: RefObject<HTMLInputElement>
  folderInputRef: RefObject<HTMLInputElement>
}

export function DropZone({
  dragging,
  setDragging,
  onDrop,
  onPaste,
  onInputChange,
  fileInputRef,
  folderInputRef
}: DropZoneProps) {
  return (
    <div
      role="region"
      aria-label="Choose files or drag and drop area"
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="dropzone-hero-icon" aria-hidden="true">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <p className="dropzone-title">Drop a file, folder, or paste a local file here.</p>
      <p className="supported-formats">
        Supported formats: txt, md, json, xml, code files, pdf, docx, pptx,
        xlsx, xls, xlsm, csv, tsv, png, jpg, webp, bmp, gif.
      </p>
      <p className="ocr-note">
        English-first in v1; other languages are not supported yet.
      </p>
      <div className="actions-row dropzone-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose files
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => folderInputRef.current?.click()}
        >
          Choose folder
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,.json,.xml,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.cs,.rb,.php,.swift,.kt,.sql,.sh,.yaml,.yml,.docx,.pptx,.xlsx,.xls,.xlsm,.csv,.tsv,.png,.jpg,.jpeg,.webp,.bmp,.gif,application/pdf,text/plain,text/markdown,text/csv,text/tab-separated-values,application/json,application/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png,image/jpeg,image/webp,image/bmp,image/gif"
        onChange={onInputChange}
        aria-label="Choose file"
        hidden
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as Record<
          string,
          string
        >)}
        onChange={onInputChange}
        aria-label="Choose folder"
        hidden
      />
    </div>
  )
}
