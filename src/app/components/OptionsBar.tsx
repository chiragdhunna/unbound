import { type Dispatch, type SetStateAction } from 'react'
import type { Settings } from '../types'

type OptionsBarProps = {
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
}

export function OptionsBar({ settings, setSettings }: OptionsBarProps) {
  return (
    <div className="options-row">
      <div className="segmented">
        <button
          type="button"
          className={settings.outputMode === 'markdown' ? 'active' : ''}
          onClick={() =>
            setSettings((value) => ({ ...value, outputMode: 'markdown' }))
          }
        >
          Markdown
        </button>
        <button
          type="button"
          className={settings.outputMode === 'plain' ? 'active' : ''}
          onClick={() =>
            setSettings((value) => ({ ...value, outputMode: 'plain' }))
          }
        >
          Plain
        </button>
      </div>

      <div className="segmented">
        <button
          type="button"
          className={settings.batchMode === 'separate' ? 'active' : ''}
          onClick={() =>
            setSettings((value) => ({ ...value, batchMode: 'separate' }))
          }
        >
          Separate
        </button>
        <button
          type="button"
          className={settings.batchMode === 'combined' ? 'active' : ''}
          onClick={() =>
            setSettings((value) => ({ ...value, batchMode: 'combined' }))
          }
        >
          Combined
        </button>
      </div>

      <label className="toggle-row" htmlFor="quick-paste-checkbox">
        <input
          id="quick-paste-checkbox"
          type="checkbox"
          checked={settings.quickPaste}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              quickPaste: event.target.checked
            }))
          }
        />
        Quick paste
      </label>

      <label className="toggle-row" htmlFor="page-markers-checkbox">
        <input
          id="page-markers-checkbox"
          type="checkbox"
          checked={settings.pageMarkers}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              pageMarkers: event.target.checked
            }))
          }
        />
        Add page markers (PDF)
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.chunkLabels}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              chunkLabels: event.target.checked
            }))
          }
        />
        Chunk labels
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.chunkPreamble}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              chunkPreamble: event.target.checked
            }))
          }
        />
        Chunk preamble
      </label>

      <label className="toggle-row">
        Chunk unit
        <select
          value={settings.chunkUnit}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              chunkUnit: event.target.value as Settings['chunkUnit']
            }))
          }
          aria-label="Chunk unit"
        >
          <option value="chars">Chars</option>
          <option value="tokens">Tokens</option>
        </select>
      </label>

      <label className="toggle-row">
        Chunk limit
        <input
          type="number"
          min="20"
          value={settings.chunkLimit}
          onChange={(event) =>
            setSettings((value) => ({
              ...value,
              chunkLimit: Math.max(20, Number(event.target.value) || 20)
            }))
          }
          aria-label="Chunk limit"
        />
      </label>
    </div>
  )
}
