import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { chunkMarkdown } from '../core/chunk'
import { countText } from '../core/tokens'
import { createConvertContext } from '../core/context'
import { UnsupportedFormatError } from '../core/errors'
import { convertFile } from '../core/pipeline'
import { markdownToPlain } from '../core/plain'

type OutputMode = 'markdown' | 'plain'
type BatchMode = 'separate' | 'combined'
type JobStatus = 'queued' | 'converting' | 'done' | 'error'

type Job = {
  id: string
  name: string
  status: JobStatus
  output: string
  rawMarkdown: string
  warnings: string[]
  error: string | null
  size: number
  file: File
}

type Settings = {
  outputMode: OutputMode
  batchMode: BatchMode
  quickPaste: boolean
  chunkLimit: number
  chunkUnit: 'chars' | 'tokens'
  pageMarkers: boolean
  chunkLabels: boolean
  chunkPreamble: boolean
}

const STORAGE_KEY = 'unbound-settings-v1'
const defaultSettings: Settings = {
  outputMode: 'markdown',
  batchMode: 'separate',
  quickPaste: false,
  chunkLimit: 12000,
  chunkUnit: 'chars',
  pageMarkers: false,
  chunkLabels: true,
  chunkPreamble: false
}

function getStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultSettings
    }
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return defaultSettings
  }
}

function formatError(error: unknown): string {
  if (error instanceof UnsupportedFormatError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Conversion failed for an unknown reason.'
}

function countSummary(value: string): string {
  const counts = countText(value)
  return `${counts.chars} chars · ${counts.words} words • ≈ ${counts.tokens} tokens`
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const success = document.execCommand('copy')
  document.body.removeChild(textarea)
  return success
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return fallbackCopy(text)
    }
  }

  return fallbackCopy(text)
}

export function AppShell() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyIndex, setCopyIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const stored = getStoredSettings()
    setSettings(stored)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      return
    }
  }, [settings])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(null), 2000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!copied) {
      return undefined
    }

    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.status === 'done' || job.status === 'error' || Boolean(job.output)),
    [jobs]
  )

  const selectedJob = useMemo(
    () => (selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? jobs[0] : jobs[0]) ?? null,
    [jobs, selectedJobId]
  )

  const sourceMarkdown = useMemo(() => {
    if (!visibleJobs.length) {
      return ''
    }

    if (settings.batchMode === 'combined') {
      return visibleJobs
        .map((job) => `# File: ${job.name}\n\n${job.output || job.rawMarkdown || 'No content converted.'}`)
        .join('\n\n')
    }

    return selectedJob?.rawMarkdown ?? selectedJob?.output ?? ''
  }, [selectedJob, settings.batchMode, visibleJobs])

  const displayText = useMemo(() => {
    if (!sourceMarkdown) return ''
    return settings.outputMode === 'markdown' ? sourceMarkdown : markdownToPlain(sourceMarkdown)
  }, [settings.outputMode, sourceMarkdown])

  const chunkLimitChars = settings.chunkUnit === 'tokens' ? settings.chunkLimit * 4 : settings.chunkLimit
  const chunks = useMemo(() => {
    const labeled = chunkMarkdown(displayText, { maxChars: chunkLimitChars, label: settings.chunkLabels })
    if (!settings.chunkPreamble || labeled.length === 0) return labeled
    return labeled.map((chunk, index) => `This is part ${index + 1} of ${labeled.length}. Wait for all parts before answering.\n\n${chunk}`)
  }, [displayText, settings.chunkLabels, settings.chunkPreamble, chunkLimitChars])
  const previewText = useMemo(() => {
    if (displayText.length <= 1_000_000) {
      return displayText
    }

    return `${displayText.slice(0, 200000)}\n\n[Showing first 200,000 of ${displayText.length} characters — Copy and Download use the full text.]`
  }, [displayText])

  const activeText = editMode ? draftText : previewText

  useEffect(() => {
    if (selectedJob && !editMode) {
      setDraftText(displayText)
    }
  }, [displayText, editMode, selectedJob])

  const handleFiles = async (incoming: FileList | File[]) => {
    const fileList = Array.from(incoming)
    if (!fileList.length) {
      return
    }

    const createdJobs = fileList.map((file) => ({
      id: `${file.name}-${Math.random()}-${Date.now()}`,
      name: file.name,
      output: '',
      rawMarkdown: '',
      warnings: [],
      error: null,
      status: 'converting' as JobStatus,
      size: file.size,
      file
    }))

    setJobs((previous) => [...previous, ...createdJobs])
    setSelectedJobId(createdJobs[0]?.id ?? null)

    for (const file of fileList) {
      const id = createdJobs.find((job) => job.name === file.name)?.id ?? `${file.name}-${Date.now()}`
      setJobs((previous) =>
        previous.map((job) =>
          job.id === id
            ? { ...job, status: 'converting', error: null }
            : job
        )
      )

      try {
        const result = await convertFile(file, createConvertContext())
        setJobs((previous) =>
          previous.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'done',
                  output: result.markdown,
                  rawMarkdown: result.markdown,
                  warnings: result.warnings.map((warning) => warning.message),
                  error: null
                }
              : job
          )
        )
        if (settings.quickPaste) {
          const quickCopy = await copyText(result.markdown)
          setToast(quickCopy ? 'Quick paste copied' : 'Quick paste ready — tap Copy')
        }
      } catch (error) {
        const message = formatError(error)
        setJobs((previous) =>
          previous.map((job) =>
            job.id === id
              ? {
                  ...job,
                  status: 'error',
                  error: message,
                  warnings: [],
                  rawMarkdown: '',
                  output: ''
                }
              : job
          )
        )
      }
    }
  }

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      await handleFiles(files)
    }
    event.target.value = ''
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files?.length) {
      await handleFiles(event.dataTransfer.files)
    }
  }

  const onPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? [])
    if (files.length) {
      event.preventDefault()
      await handleFiles(files)
    }
  }

  const handleCopy = async () => {
    const textToCopy = editMode ? draftText : displayText
    const success = await copyText(textToCopy)
    setCopied(success)
    setToast(success ? 'Copied to clipboard' : 'Clipboard copy failed — use the fallback copy action')
  }

  const handleCopyChunk = async (chunk: string) => {
    const success = await copyText(chunk)
    if (success) {
      setToast('Chunk copied')
    } else {
      setToast('Chunk copy failed')
    }
  }

  const handleDownload = () => {
    const textToDownload = editMode ? draftText : displayText
    const blob = new Blob([textToDownload], { type: settings.outputMode === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(selectedJob?.name ?? 'unbound-output').replace(/\.[^.]+$/, '')}.${settings.outputMode === 'markdown' ? 'md' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    setToast('Download started')
  }

  const handleJobDownload = (job: Job) => {
    const blob = new Blob([settings.outputMode === 'markdown' ? job.rawMarkdown : markdownToPlain(job.rawMarkdown)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${job.name.replace(/\.[^.]+$/, '')}.${settings.outputMode === 'markdown' ? 'md' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const privacyText =
    settings.quickPaste || settings.pageMarkers ? 'OCR downloads and proxy settings are opt-in; files stay local by default.' : 'Files never leave your device.'

  return (
    <main>
      <section className="shell" aria-label="Unbound app shell">
        <header className="topbar">
          <div>
            <h1>unbound_</h1>
            <p className="tagline">Turn files into paste-ready markdown or plain text.</p>
          </div>
          <div className="status-pill" role="status" aria-live="polite">
            {jobs.some((job) => job.status === 'converting') ? 'Converting…' : 'Ready'}
          </div>
        </header>

        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onPaste={onPaste}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="Choose files or drag and drop"
        >
          <p>Drop a file, folder, or paste a local file here.</p>
          <div className="actions-row">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Choose files
            </button>
            <button type="button" onClick={() => folderInputRef.current?.click()}>
              Choose folder
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple onChange={onInputChange} aria-label="Choose file" hidden />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={onInputChange}
            aria-label="Choose folder"
            hidden
          />
        </div>

        <div className="options-row">
          <div className="segmented">
            <button type="button" className={settings.outputMode === 'markdown' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, outputMode: 'markdown' }))}>
              Markdown
            </button>
            <button type="button" className={settings.outputMode === 'plain' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, outputMode: 'plain' }))}>
              Plain
            </button>
          </div>

          <div className="segmented">
            <button type="button" className={settings.batchMode === 'separate' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, batchMode: 'separate' }))}>
              Separate
            </button>
            <button type="button" className={settings.batchMode === 'combined' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, batchMode: 'combined' }))}>
              Combined
            </button>
          </div>

          <label className="toggle-row">
            <input type="checkbox" checked={settings.quickPaste} onChange={(event) => setSettings((value) => ({ ...value, quickPaste: event.target.checked }))} />
            Quick paste
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={settings.pageMarkers} onChange={(event) => setSettings((value) => ({ ...value, pageMarkers: event.target.checked }))} />
            Page markers
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={settings.chunkLabels} onChange={(event) => setSettings((value) => ({ ...value, chunkLabels: event.target.checked }))} />
            Chunk labels
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={settings.chunkPreamble} onChange={(event) => setSettings((value) => ({ ...value, chunkPreamble: event.target.checked }))} />
            Chunk preamble
          </label>

          <label className="toggle-row">
            Chunk unit
            <select value={settings.chunkUnit} onChange={(event) => setSettings((value) => ({ ...value, chunkUnit: event.target.value as Settings['chunkUnit'] }))} aria-label="Chunk unit">
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
              onChange={(event) => setSettings((value) => ({ ...value, chunkLimit: Math.max(20, Number(event.target.value) || 20) }))}
              aria-label="Chunk limit"
            />
          </label>
        </div>

        {jobs.length > 0 ? (
          <div className="job-list" aria-label="conversion jobs">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={`job-card ${selectedJobId === job.id ? 'selected' : ''}`}
                onClick={() => setSelectedJobId(job.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedJobId(job.id)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="job-header">
                  <strong>{job.name}</strong>
                  <span className={`job-status ${job.status}`}>{job.status}</span>
                </div>
                {job.error ? <p className="job-error">{job.error}</p> : null}
                {job.warnings.length > 0 ? (
                  <ul className="warning-list">
                    {job.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="job-actions">
                  {job.status === 'done' ? <button type="button" onClick={(event) => { event.stopPropagation(); void copyText(job.rawMarkdown).then(() => setToast('File copied')) }}>Copy file</button> : null}
                  {job.status === 'done' ? <button type="button" onClick={(event) => { event.stopPropagation(); handleJobDownload(job) }}>Download file</button> : null}
                  {job.status === 'error' ? <button type="button" onClick={(event) => { event.stopPropagation(); void handleFiles([job.file]) }}>Retry</button> : null}
                  <button type="button" onClick={(event) => { event.stopPropagation(); setJobs((previous) => previous.filter((item) => item.id !== job.id)) }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {sourceMarkdown ? (
          <article className="output-panel" aria-label="Conversion output">
            <div className="pane-toolbar">
              <div className="count-summary">{countSummary(displayText)}</div>
              <div className="toolbar-actions">
                <button type="button" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Read-only' : 'Edit'}</button>
                <button type="button" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
                <button type="button" onClick={handleDownload}>Download</button>
              </div>
            </div>

            <textarea
              readOnly={!editMode}
              value={activeText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={20}
              aria-label="Converted output"
            />

            {displayText.length > 1_000_000 ? (
              <div className="preview-note">Preview capped at 200,000 characters for display. Copy and download still use the full result.</div>
            ) : null}

            {chunks.length > 1 ? (
              <div className="chunk-panel">
                <div className="chunk-header">
                  <strong>Chunks</strong>
                  <button type="button" onClick={() => {
                    const next = chunks[copyIndex % chunks.length]
                    if (next) {
                      void handleCopyChunk(next)
                    }
                    setCopyIndex((value) => (value + 1) % chunks.length)
                  }}>
                    Copy next
                  </button>
                </div>
                {chunks.map((chunk, index) => (
                  <div key={`${chunk.slice(0, 10)}-${index}`} className="chunk-item">
                    <div className="chunk-meta">{`Part ${index + 1} of ${chunks.length} · ${countSummary(chunk)}`}</div>
                    <div className="chunk-actions">
                      <button type="button" onClick={() => void handleCopyChunk(chunk)}>Copy</button>
                    </div>
                    <pre>{chunk.slice(0, 220)}{chunk.length > 220 ? '…' : ''}</pre>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ) : (
          <div className="empty-state">No output yet — add a supported file to begin converting.</div>
        )}

        <footer className="privacy-footer">{privacyText}</footer>
        {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
      </section>
    </main>
  )
}
