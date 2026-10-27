import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { chunkMarkdown } from '../core/chunk'
import { createConvertContext } from '../core/context'
import {
  type ConvertContext,
  type ConvertOptions,
  type ConvertProgress
} from '../core/types'
import { errorMessage } from '../core/errors'
import { convertFile } from '../core/pipeline'
import { markdownToPlain } from '../core/plain'
import { DropZone } from './components/DropZone'
import { JobCard } from './components/JobCard'
import { OptionsBar } from './components/OptionsBar'
import { OutputPanel } from './components/OutputPanel'
import { WarningIcon } from './components/WarningIcon'
import {
  filterFolderFiles,
  FOLDER_MAX_FILES,
  getFileDisplayName
} from '../core/junk'
import {
  type Job,
  type JobStatus,
  type Settings,
  STORAGE_KEY,
  defaultSettings
} from './types'

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
  return errorMessage(error)
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

function buildConvertContext(
  settings: Settings,
  signal?: AbortSignal,
  onProgress?: (progress: ConvertProgress) => void,
  optionsOverride?: Partial<ConvertOptions>
): ConvertContext {
  const context = createConvertContext()
  return {
    ...context,
    signal: signal ?? context.signal,
    onProgress: onProgress ?? context.onProgress,
    options: {
      ...context.options,
      pdfPageMarkers: settings.pageMarkers,
      ...optionsOverride
    }
  }
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
  const [limitWarning, setLimitWarning] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

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
    () =>
      jobs.filter(
        (job) =>
          job.status === 'done' || job.status === 'error' || Boolean(job.output)
      ),
    [jobs]
  )

  const selectedJob = useMemo(
    () =>
      (selectedJobId
        ? (jobs.find((job) => job.id === selectedJobId) ?? jobs[0])
        : jobs[0]) ?? null,
    [jobs, selectedJobId]
  )

  const sourceMarkdown = useMemo(() => {
    if (!visibleJobs.length) {
      return ''
    }

    if (settings.batchMode === 'combined') {
      return visibleJobs
        .map(
          (job) =>
            `# File: ${job.name}\n\n${job.output || job.rawMarkdown || 'No content converted.'}`
        )
        .join('\n\n')
    }

    return selectedJob?.rawMarkdown ?? selectedJob?.output ?? ''
  }, [selectedJob, settings.batchMode, visibleJobs])

  const displayText = useMemo(() => {
    if (!sourceMarkdown) return ''
    return settings.outputMode === 'markdown'
      ? sourceMarkdown
      : markdownToPlain(sourceMarkdown)
  }, [settings.outputMode, sourceMarkdown])

  const chunkLimitChars =
    settings.chunkUnit === 'tokens'
      ? settings.chunkLimit * 4
      : settings.chunkLimit
  const chunks = useMemo(() => {
    const labeled = chunkMarkdown(displayText, {
      maxChars: chunkLimitChars,
      label: settings.chunkLabels
    })
    if (!settings.chunkPreamble || labeled.length === 0) return labeled
    return labeled.map(
      (chunk, index) =>
        `This is part ${index + 1} of ${labeled.length}. Wait for all parts before answering.\n\n${chunk}`
    )
  }, [
    displayText,
    settings.chunkLabels,
    settings.chunkPreamble,
    chunkLimitChars
  ])
  const previewText = useMemo(() => {
    if (displayText.length <= 1_000_000) {
      return displayText
    }

    return `${displayText.slice(0, 200000)}\n\n[Showing first 200,000 of ${displayText.length} characters — Copy and Download use the full text.]`
  }, [displayText])

  // Reset copy index when chunks change to avoid copying from wrong position
  useEffect(() => {
    setCopyIndex(0)
  }, [chunks])

  const activeText = editMode ? draftText : previewText

  useEffect(() => {
    if (selectedJob) {
      // Update draftText when switching documents or when leaving edit mode
      if (!editMode) {
        setDraftText(displayText)
      }
    }
  }, [displayText, editMode, selectedJob])

  const handleFiles = async (incoming: FileList | File[]) => {
    const rawList = Array.from(incoming)
    if (!rawList.length) {
      return
    }

    const { accepted, limitReached } = filterFolderFiles(rawList)
    if (limitReached) {
      setLimitWarning(
        `Folder limit reached: only the first ${FOLDER_MAX_FILES} files are processed.`
      )
    } else {
      setLimitWarning(null)
    }

    if (!accepted.length) {
      return
    }

    const createdJobs = accepted.map((file) => {
      const displayName = getFileDisplayName(file)
      return {
        id: `${displayName}-${Math.random()}-${Date.now()}`,
        name: displayName,
        output: '',
        rawMarkdown: '',
        warnings: [],
        warningCodes: [],
        error: null,
        status: 'converting' as JobStatus,
        size: file.size,
        file,
        attemptId: 0
      }
    })

    setJobs((previous) => [...previous, ...createdJobs])
    setSelectedJobId(createdJobs[0]?.id ?? null)

    // Process each file using its pre-created job ID
    for (let index = 0; index < accepted.length; index++) {
      const file = accepted[index]!
      const jobId = createdJobs[index]!.id
      const attemptId = createdJobs[index]!.attemptId // should be 0

      setJobs((previous) =>
        previous.map((job) =>
          job.id === jobId ? { ...job, status: 'converting', error: null } : job
        )
      )

      const controller = new AbortController()
      abortControllersRef.current.set(jobId, controller)

      const handleProgress = (progress: ConvertProgress) => {
        setJobs((previous) =>
          previous.map((job) =>
            job.id === jobId && job.attemptId === attemptId
              ? { ...job, progress }
              : job
          )
        )
      }

      try {
        const result = await convertFile(
          file!,
          buildConvertContext(settings, controller.signal, handleProgress)
        )
        setJobs((previous) =>
          previous.map((job) =>
            job.id === jobId
              ? job.attemptId === attemptId // check that the attemptId matches the one we started with
                ? {
                    ...job,
                    status: 'done',
                    output: result.markdown,
                    rawMarkdown: result.markdown,
                    warnings: result.warnings.map((warning) => warning.message),
                    warningCodes: result.warnings.map((warning) => warning.code),
                    error: null,
                    progress: undefined
                  }
                : job // attemptId changed, ignore this result
              : job
          )
        )
        setSelectedJobId(jobId)
        if (settings.quickPaste) {
          const quickCopy = await copyText(result.markdown)
          setToast(
            quickCopy ? 'Quick paste copied' : 'Quick paste ready — tap Copy'
          )
        }
      } catch (error) {
        const message = formatError(error)
        setJobs((previous) =>
          previous.map((job) =>
            job.id === jobId
              ? job.attemptId === attemptId // check that the attemptId matches the one we started with
                ? {
                    ...job,
                    status: 'error',
                    error: message,
                    warnings: [],
                    warningCodes: [],
                    rawMarkdown: '',
                    output: '',
                    progress: undefined
                  }
                : job // attemptId changed, ignore this error
              : job
          )
        )
      } finally {
        abortControllersRef.current.delete(jobId)
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

  const retryJob = async (job: Job) => {
    const jobId = job.id
    const currentJob = jobs.find((j) => j.id === jobId)
    if (!currentJob) {
      return
    }
    const file = currentJob.file
    if (!file) {
      return
    }

    const attemptId = currentJob.attemptId + 1
    setJobs((previous) =>
      previous.map((j) =>
        j.id === jobId
          ? { ...j, status: 'converting' as JobStatus, error: null, attemptId, progress: undefined }
          : j
      )
    )

    const controller = new AbortController()
    abortControllersRef.current.set(jobId, controller)

    const handleProgress = (progress: ConvertProgress) => {
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId && j.attemptId === attemptId
            ? { ...j, progress }
            : j
        )
      )
    }

    try {
      const result = await convertFile(
        file,
        buildConvertContext(settings, controller.signal, handleProgress)
      )
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId
            ? j.attemptId === attemptId
              ? {
                  ...j,
                  status: 'done',
                  output: result.markdown,
                  rawMarkdown: result.markdown,
                  warnings: result.warnings.map((w) => w.message),
                  warningCodes: result.warnings.map((w) => w.code),
                  error: null,
                  progress: undefined
                }
              : j
            : j
        )
      )
    } catch (error) {
      const message = formatError(error)
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId
            ? j.attemptId === attemptId
              ? {
                  ...j,
                  status: 'error',
                  error: message,
                  warnings: [],
                  warningCodes: [],
                  rawMarkdown: '',
                  output: '',
                  progress: undefined
                }
              : j
            : j
        )
      )
    } finally {
      abortControllersRef.current.delete(jobId)
    }
  }

  const runOcrOnJob = async (job: Job) => {
    const jobId = job.id
    const currentJob = jobs.find((j) => j.id === jobId)
    if (!currentJob) {
      return
    }
    const file = currentJob.file
    if (!file) return

    const attemptId = currentJob.attemptId + 1
    setJobs((previous) =>
      previous.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'converting' as JobStatus,
              error: null,
              attemptId,
              progress: undefined
            }
          : j
      )
    )

    const controller = new AbortController()
    abortControllersRef.current.set(jobId, controller)

    const handleProgress = (progress: ConvertProgress) => {
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId && j.attemptId === attemptId
            ? { ...j, progress }
            : j
        )
      )
    }

    try {
      const result = await convertFile(
        file,
        buildConvertContext(settings, controller.signal, handleProgress, {
          forceOcr: true
        })
      )
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId
            ? j.attemptId === attemptId
              ? {
                  ...j,
                  status: 'done',
                  output: result.markdown,
                  rawMarkdown: result.markdown,
                  warnings: result.warnings.map((w) => w.message),
                  warningCodes: result.warnings.map((w) => w.code),
                  error: null,
                  progress: undefined
                }
              : j
            : j
        )
      )
    } catch (error) {
      const message = formatError(error)
      setJobs((previous) =>
        previous.map((j) =>
          j.id === jobId
            ? j.attemptId === attemptId
              ? {
                  ...j,
                  status: 'error',
                  error: message,
                  warnings: [],
                  warningCodes: [],
                  rawMarkdown: '',
                  output: '',
                  progress: undefined
                }
              : j
            : j
        )
      )
    } finally {
      abortControllersRef.current.delete(jobId)
    }
  }

  const cancelJob = (jobId: string) => {
    const controller = abortControllersRef.current.get(jobId)
    if (controller) {
      controller.abort()
    }
  }

  const handleCopy = async () => {
    const textToCopy = editMode ? draftText : displayText
    const success = await copyText(textToCopy)
    setCopied(success)
    setToast(
      success
        ? 'Copied to clipboard'
        : 'Clipboard copy failed — use the fallback copy action'
    )
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
    const blob = new Blob([textToDownload], {
      type:
        settings.outputMode === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : 'text/plain;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(selectedJob?.name ?? 'unbound-output').replace(/\.[^.]+$/, '')}.${settings.outputMode === 'markdown' ? 'md' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    setToast('Download started')
  }

  const handleJobDownload = (job: Job) => {
    const blob = new Blob(
      [
        settings.outputMode === 'markdown'
          ? job.rawMarkdown
          : markdownToPlain(job.rawMarkdown)
      ],
      { type: 'text/plain;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${job.name.replace(/\.[^.]+$/, '')}.${settings.outputMode === 'markdown' ? 'md' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const privacyText =
    settings.quickPaste || settings.pageMarkers
      ? 'OCR downloads and proxy settings are opt-in; files stay local by default.'
      : 'Files never leave your device.'

  return (
    <main>
      <section className="shell" aria-label="Unbound app shell">
        <header className="topbar">
          <div>
            <h1>unbound_</h1>
            <p className="tagline">
              Turn files into paste-ready markdown or plain text.
            </p>
          </div>
          <div className="status-pill" role="status" aria-live="polite">
            {(() => {
              const convertingIndex = jobs.findIndex(
                (job) => job.status === 'converting'
              )
              if (convertingIndex === -1) return 'Ready'
              if (jobs.length > 1) {
                return `Converting file ${convertingIndex + 1} of ${jobs.length}: ${jobs[convertingIndex]?.name}`
              }
              return 'Converting…'
            })()}
          </div>
        </header>

        <DropZone
          dragging={dragging}
          setDragging={setDragging}
          onDrop={onDrop}
          onPaste={onPaste}
          onInputChange={onInputChange}
          fileInputRef={fileInputRef}
          folderInputRef={folderInputRef}
        />

        <OptionsBar settings={settings} setSettings={setSettings} />

        {limitWarning ? (
          <div className="warning-item limit-warning" role="alert">
            <WarningIcon />
            <span>{limitWarning}</span>
          </div>
        ) : null}

        {jobs.length > 0 ? (
          <ul className="job-list" aria-label="Conversion jobs">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSelected={selectedJobId === job.id}
                onSelect={() => setSelectedJobId(job.id)}
                onRunOcr={() => runOcrOnJob(job)}
                onCopyFile={async () => {
                  const textToCopy =
                    settings.outputMode === 'markdown'
                      ? job.rawMarkdown
                      : markdownToPlain(job.rawMarkdown)
                  const success = await copyText(textToCopy)
                  setToast(success ? 'File copied' : 'File copy failed')
                }}
                onDownloadFile={() => handleJobDownload(job)}
                onCancel={() => cancelJob(job.id)}
                onRetry={() => retryJob(job)}
                onRemove={() => {
                  cancelJob(job.id)
                  setJobs((previous) =>
                    previous.filter((item) => item.id !== job.id)
                  )
                }}
              />
            ))}
          </ul>
        ) : null}

        {sourceMarkdown ? (
          <OutputPanel
            displayText={displayText}
            activeText={activeText}
            editMode={editMode}
            copied={copied}
            chunks={chunks}
            copyIndex={copyIndex}
            onToggleEdit={() => setEditMode((value) => !value)}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onChangeDraftText={(val) => setDraftText(val)}
            onCopyChunk={(chunk) => void handleCopyChunk(chunk)}
            onNextChunk={() => {
              const next = chunks[copyIndex % chunks.length]
              if (next) {
                void handleCopyChunk(next)
              }
              setCopyIndex((value) => (value + 1) % chunks.length)
            }}
          />
        ) : (
          <div className="empty-state">
            No output yet — add a supported file to begin converting.
          </div>
        )}

        <footer className="privacy-footer">{privacyText}</footer>
        {toast ? (
          <div className="toast" role="status" aria-live="polite">
            {toast}
          </div>
        ) : null}
      </section>
    </main>
  )
}
