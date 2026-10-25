import { countText } from '../../core/tokens'

type OutputPanelProps = {
  displayText: string
  activeText: string
  editMode: boolean
  copied: boolean
  chunks: string[]
  copyIndex: number
  onToggleEdit: () => void
  onCopy: () => void
  onDownload: () => void
  onChangeDraftText: (val: string) => void
  onCopyChunk: (chunk: string) => void
  onNextChunk: () => void
}

function countSummary(value: string): string {
  const counts = countText(value)
  return `${counts.chars} chars · ${counts.words} words • ≈ ${counts.tokens} tokens`
}

export function OutputPanel({
  displayText,
  activeText,
  editMode,
  copied,
  chunks,
  onToggleEdit,
  onCopy,
  onDownload,
  onChangeDraftText,
  onCopyChunk,
  onNextChunk
}: OutputPanelProps) {
  return (
    <article className="output-panel" aria-label="Conversion output">
      <div className="pane-toolbar">
        <div className="count-summary">{countSummary(displayText)}</div>
        <div className="toolbar-actions">
          <button type="button" onClick={onToggleEdit}>
            {editMode ? 'Read-only' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onCopy}
            className={`copy-button-main ${copied ? 'copied' : ''}`}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" onClick={onDownload}>
            Download
          </button>
        </div>
      </div>

      <textarea
        readOnly={!editMode}
        value={activeText}
        onChange={(event) => onChangeDraftText(event.target.value)}
        rows={20}
        aria-label="Converted output"
      />

      {displayText.length > 1_000_000 ? (
        <div className="preview-note">
          Preview capped at 200,000 characters for display. Copy and download
          still use the full result.
        </div>
      ) : null}

      {chunks.length > 1 ? (
        <div className="chunk-panel">
          <div className="chunk-header">
            <strong>Chunks</strong>
            <button type="button" onClick={onNextChunk}>
              Copy next
            </button>
          </div>
          {chunks.map((chunk, index) => (
            <div
              key={`${chunk.slice(0, 10)}-${index}`}
              className="chunk-item"
            >
              <div className="chunk-meta">{`Part ${index + 1} of ${chunks.length} · ${countSummary(chunk)}`}</div>
              <div className="chunk-actions">
                <button
                  type="button"
                  onClick={() => onCopyChunk(chunk)}
                >{`Copy part ${index + 1} of ${chunks.length}`}</button>
              </div>
              <pre>
                {chunk.slice(0, 220)}
                {chunk.length > 220 ? '…' : ''}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
