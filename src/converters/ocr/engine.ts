/**
 * Self-hosted Tesseract.js OCR Engine (PLAN §7.5, ADR-6).
 *
 * Design constraints:
 * - Sequential execution only: ONE recognition at a time. The underlying Web Worker
 *   is single-threaded and the progress callback is shared across the worker logger.
 *   Concurrent calls to `recognize()` on the same engine instance reject immediately
 *   with `OcrFailedError` to preserve bounded memory (single canvas in flight) and
 *   unambiguous abort semantics.
 * - Single worker reuse: the worker is created lazily on first use and reused across
 *   sequential pages.
 * - Cancellation: aborting an in-flight operation terminates the worker immediately,
 *   rejects with `CancelledError`, and lazily re-instantiates a fresh worker on the next call.
 */
import { CancelledError, OcrFailedError } from '../../core/errors'

export interface OcrEngineOptions {
  lang?: string
}

export interface OcrProgress {
  phase: string
  current: number
  total: number
}

export interface OcrRecognizeOptions {
  onProgress?: (progress: OcrProgress) => void
  signal?: AbortSignal
}

export interface OcrRecognizeResult {
  text: string
  confidence: number
}

export type OcrImageSource =
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | ImageData

export interface OcrEngine {
  recognize(
    image: OcrImageSource,
    options?: OcrRecognizeOptions
  ): Promise<OcrRecognizeResult>
  terminate(): Promise<void>
}

type TesseractModule = typeof import('tesseract.js')
type TesseractWorker = Awaited<ReturnType<TesseractModule['createWorker']>>

let tesseractPromise: Promise<TesseractModule> | null = null

export function getTesseract(): Promise<TesseractModule> {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js')
  }
  return tesseractPromise
}

export function createOcrEngine(options: OcrEngineOptions = {}): OcrEngine {
  const lang = options.lang || 'eng'
  let worker: TesseractWorker | null = null
  let workerPromise: Promise<TesseractWorker> | null = null
  let creationId = 0
  let isBusy = false
  let activeProgress: ((progress: OcrProgress) => void) | null = null

  const rawBase = (import.meta.env?.BASE_URL ?? '/').replace(/\/+$/, '')
  const baseUrl = rawBase ? `${rawBase}/` : '/'

  const handleLoggerMessage = (m: { status?: string; progress?: number }) => {
    if (activeProgress && typeof m?.progress === 'number') {
      if (m.status && m.status !== 'recognizing text') return
      const current = Math.round(Math.max(0, Math.min(1, m.progress)) * 100)
      activeProgress({
        phase: 'ocr',
        current,
        total: 100
      })
    }
  }

  async function destroyCurrentWorker(): Promise<void> {
    creationId += 1
    const currentWorker = worker
    const currentPromise = workerPromise
    worker = null
    workerPromise = null
    activeProgress = null
    isBusy = false

    if (currentWorker) {
      try {
        await currentWorker.terminate()
      } catch {
        // Ignore termination errors if worker was already dead
      }
    } else if (currentPromise) {
      currentPromise
        .then((w) => {
          try {
            void w.terminate()
          } catch {
            // Ignore
          }
        })
        .catch(() => {})
    }
  }

  async function getWorker(): Promise<TesseractWorker> {
    if (worker) return worker
    if (!workerPromise) {
      const currentId = creationId + 1
      creationId = currentId
      workerPromise = (async () => {
        try {
          const tesseract = await getTesseract()
          const w = await tesseract.createWorker(lang, 1, {
            workerPath: `${baseUrl}ocr/worker.min.js`,
            corePath: `${baseUrl}ocr/core`,
            langPath: `${baseUrl}ocr/lang`,
            gzip: false,
            workerBlobURL: false,
            logger: handleLoggerMessage
          })
          if (creationId !== currentId) {
            try {
              void w.terminate()
            } catch {
              // Ignore
            }
            throw new CancelledError()
          }
          worker = w
          return w
        } catch (err) {
          if (creationId === currentId) {
            workerPromise = null
          }
          throw err
        }
      })()
    }
    return workerPromise
  }

  async function recognize(
    image: OcrImageSource,
    recognizeOptions: OcrRecognizeOptions = {}
  ): Promise<OcrRecognizeResult> {
    if (isBusy) {
      throw new OcrFailedError(
        'OCR engine is busy: concurrent recognition is not supported.'
      )
    }
    isBusy = true

    const { signal, onProgress } = recognizeOptions

    if (signal?.aborted) {
      await destroyCurrentWorker()
      throw new CancelledError()
    }

    activeProgress = onProgress ?? null

    let onAbort: (() => void) | null = null

    const abortPromise = new Promise<never>((_, reject) => {
      if (signal) {
        onAbort = () => {
          void destroyCurrentWorker()
          reject(new CancelledError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })

    const runOperation = async (): Promise<OcrRecognizeResult> => {
      const activeWorker = await getWorker()
      if (signal?.aborted) {
        await destroyCurrentWorker()
        throw new CancelledError()
      }
      const res = await activeWorker.recognize(
        image as unknown as Parameters<TesseractWorker['recognize']>[0]
      )
      return {
        text: res?.data?.text ?? '',
        confidence:
          typeof res?.data?.confidence === 'number' ? res.data.confidence : 0
      }
    }

    const runPromise = runOperation()
    runPromise.catch(() => {})

    try {
      return await Promise.race([runPromise, abortPromise])
    } catch (error) {
      await destroyCurrentWorker()
      if (signal?.aborted || error instanceof CancelledError) {
        throw new CancelledError()
      }
      if (error instanceof OcrFailedError) {
        throw error
      }
      const message =
        error instanceof Error && error.message
          ? `OCR failed: ${error.message}`
          : 'OCR failed; the image could not be processed.'
      throw new OcrFailedError(message)
    } finally {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort)
      }
      activeProgress = null
      isBusy = false
    }
  }

  async function terminate(): Promise<void> {
    await destroyCurrentWorker()
  }

  return {
    recognize,
    terminate
  }
}
