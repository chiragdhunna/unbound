import { useState, type ChangeEvent, type DragEvent, type RefObject } from 'react'

type DropZoneProps = {
  dragging: boolean
  setDragging: (dragging: boolean) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onFetchUrl?: (url: string) => void
  fileInputRef: RefObject<HTMLInputElement>
  folderInputRef: RefObject<HTMLInputElement>
}

export function DropZone({
  dragging,
  setDragging,
  onDrop,
  onPaste,
  onInputChange,
  onFetchUrl,
  fileInputRef,
  folderInputRef
}: DropZoneProps) {
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
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
        rtf, html, xlsx, xls, xlsm, csv, tsv, png, jpg, webp, bmp, gif.
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
        {!showUrlInput ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowUrlInput(true)}
          >
            Fetch URL
          </button>
        ) : null}
      </div>
      {showUrlInput ? (
        <form
          className="url-fetch-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (urlInput.trim() && onFetchUrl) {
              onFetchUrl(urlInput.trim())
              setUrlInput('')
              setShowUrlInput(false)
            }
          }}
        >
          <input
            id="url-fetch-input"
            type="url"
            className="url-fetch-input"
            placeholder="https://example.com/article"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            aria-label="Enter web page URL"
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={!urlInput.trim()}
          >
            Fetch
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowUrlInput(false)
              setUrlInput('')
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,.json,.xml,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.cs,.rb,.php,.swift,.kt,.sql,.sh,.yaml,.yml,.docx,.pptx,.rtf,.html,.htm,.xlsx,.xls,.xlsm,.csv,.tsv,.png,.jpg,.jpeg,.webp,.bmp,.gif,application/pdf,text/plain,text/markdown,text/csv,text/tab-separated-values,application/json,application/xml,application/rtf,text/rtf,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/png,image/jpeg,image/webp,image/bmp,image/gif"
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
