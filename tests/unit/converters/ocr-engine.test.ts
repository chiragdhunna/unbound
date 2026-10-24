// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOcrEngine,
  getTesseract,
  type OcrProgress
} from '../../../src/converters/ocr/engine'
import { CancelledError, CorruptFileError } from '../../../src/core/errors'

interface MockWorkerInstance {
  recognize: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}

const createdWorkers: MockWorkerInstance[] = []
const mockCreateWorker = vi.fn()

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args)
}))

describe('ocr engine (M6.3a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createdWorkers.length = 0
    mockCreateWorker.mockImplementation(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi.fn().mockResolvedValue({
          data: { text: 'Recognized test text', confidence: 92 }
        }),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })
  })

  it('lazy loads tesseract and does not create worker until first recognize', async () => {
    const engine = createOcrEngine()
    expect(mockCreateWorker).not.toHaveBeenCalled()

    const result = await engine.recognize({})
    expect(mockCreateWorker).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ text: 'Recognized test text', confidence: 92 })
  })

  it('caches the tesseract module across getTesseract calls', async () => {
    const modA = await getTesseract()
    const modB = await getTesseract()
    expect(modB).toBe(modA)
  })

  it('reuses the single worker across multiple recognize calls', async () => {
    const engine = createOcrEngine()

    const res1 = await engine.recognize({ id: 1 })
    const res2 = await engine.recognize({ id: 2 })

    expect(mockCreateWorker).toHaveBeenCalledTimes(1)
    expect(createdWorkers).toHaveLength(1)
    expect(createdWorkers[0]!.recognize).toHaveBeenCalledTimes(2)
    expect(res1.text).toBe('Recognized test text')
    expect(res2.text).toBe('Recognized test text')
  })

  it('passes language, oem 1, and exact self-hosted paths to createWorker', async () => {
    const engine = createOcrEngine({ lang: 'fra' })
    await engine.recognize({})

    expect(mockCreateWorker).toHaveBeenCalledWith(
      'fra',
      1,
      expect.objectContaining({
        workerPath: expect.stringMatching(/\/ocr\/worker\.min\.js$/),
        corePath: expect.stringMatching(/\/ocr\/core$/),
        langPath: expect.stringMatching(/\/ocr\/lang$/),
        gzip: false,
        workerBlobURL: false
      })
    )
  })

  it('forwards progress from logger callback during recognition', async () => {
    const engine = createOcrEngine()
    const progressList: OcrProgress[] = []

    mockCreateWorker.mockImplementationOnce(
      async (
        _lang: unknown,
        _oem: unknown,
        options: {
          logger?: (m: { status?: string; progress?: number }) => void
        }
      ) => {
        const workerInstance: MockWorkerInstance = {
          recognize: vi.fn().mockImplementation(async () => {
            options?.logger?.({ status: 'recognizing text', progress: 0.35 })
            options?.logger?.({ status: 'loading core', progress: 0.99 }) // Ignored
            options?.logger?.({ status: 'recognizing text', progress: 0.8 })
            return { data: { text: 'Done', confidence: 98 } }
          }),
          terminate: vi.fn().mockResolvedValue({})
        }
        createdWorkers.push(workerInstance)
        return workerInstance
      }
    )

    const result = await engine.recognize(
      {},
      {
        onProgress: (p) => progressList.push(p)
      }
    )

    expect(result.text).toBe('Done')
    expect(progressList).toEqual([
      { phase: 'ocr', current: 35, total: 100 },
      { phase: 'ocr', current: 80, total: 100 }
    ])
  })

  it('handles empty text and missing confidence gracefully', async () => {
    const engine = createOcrEngine()
    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi.fn().mockResolvedValue({}),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    const res = await engine.recognize({})
    expect(res).toEqual({ text: '', confidence: 0 })
  })

  it('rejects immediately with CancelledError when aborted before start', async () => {
    const engine = createOcrEngine()
    const controller = new AbortController()
    controller.abort()

    await expect(
      engine.recognize({}, { signal: controller.signal })
    ).rejects.toBeInstanceOf(CancelledError)

    expect(mockCreateWorker).not.toHaveBeenCalled()
  })

  it('terminates worker immediately and rejects with CancelledError when aborted mid-flight', async () => {
    const engine = createOcrEngine()
    const controller = new AbortController()

    let releaseRecognize!: () => void
    const recognizeWait = new Promise<{
      data: { text: string; confidence: number }
    }>((resolve) => {
      releaseRecognize = () =>
        resolve({ data: { text: 'Late', confidence: 50 } })
    })

    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi.fn().mockReturnValue(recognizeWait),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    const recognizePromise = engine.recognize({}, { signal: controller.signal })

    // Trigger abort mid-flight
    controller.abort()

    await expect(recognizePromise).rejects.toBeInstanceOf(CancelledError)
    expect(createdWorkers[0]!.terminate).toHaveBeenCalledTimes(1)

    // Clean up suspended promise
    releaseRecognize()
  })

  it('recreates worker on subsequent call after an abort', async () => {
    const engine = createOcrEngine()
    const controller = new AbortController()

    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi.fn().mockImplementation(
          () =>
            new Promise(() => {
              // Never resolves to hold worker busy
            })
        ),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    const abortedCall = engine.recognize({}, { signal: controller.signal })
    controller.abort()
    await expect(abortedCall).rejects.toBeInstanceOf(CancelledError)
    expect(createdWorkers).toHaveLength(1)
    expect(createdWorkers[0]!.terminate).toHaveBeenCalledTimes(1)

    // Second call without abort signal
    const secondResult = await engine.recognize({})
    expect(mockCreateWorker).toHaveBeenCalledTimes(2)
    expect(createdWorkers).toHaveLength(2)
    expect(secondResult.text).toBe('Recognized test text')
  })

  it('maps recognize rejection to CorruptFileError and resets worker', async () => {
    const engine = createOcrEngine()

    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi
          .fn()
          .mockRejectedValue(new Error('Internal Tesseract crash')),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    await expect(engine.recognize({})).rejects.toBeInstanceOf(CorruptFileError)
    expect(createdWorkers[0]!.terminate).toHaveBeenCalled()

    // Subsequent call succeeds with a recreated worker
    const recovered = await engine.recognize({})
    expect(recovered.text).toBe('Recognized test text')
    expect(mockCreateWorker).toHaveBeenCalledTimes(2)
  })

  it('maps non-Error recognize rejection and rethrows CorruptFileError', async () => {
    const engine = createOcrEngine()

    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi.fn().mockRejectedValue('Unknown string rejection'),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    await expect(engine.recognize({})).rejects.toBeInstanceOf(CorruptFileError)

    // And if CorruptFileError is thrown directly
    mockCreateWorker.mockImplementationOnce(async () => {
      const workerInstance: MockWorkerInstance = {
        recognize: vi
          .fn()
          .mockRejectedValue(new CorruptFileError('Already corrupt')),
        terminate: vi.fn().mockResolvedValue({})
      }
      createdWorkers.push(workerInstance)
      return workerInstance
    })

    await expect(engine.recognize({})).rejects.toThrow('Already corrupt')
  })

  it('maps createWorker rejection to CorruptFileError', async () => {
    const engine = createOcrEngine()
    mockCreateWorker.mockRejectedValueOnce(
      new Error('WASM core failed to compile')
    )

    await expect(engine.recognize({})).rejects.toBeInstanceOf(CorruptFileError)
  })

  it('terminate is idempotent and safely cleans up active worker', async () => {
    const engine = createOcrEngine()

    // First terminate before any worker created
    await expect(engine.terminate()).resolves.toBeUndefined()
    expect(mockCreateWorker).not.toHaveBeenCalled()

    // Create worker
    await engine.recognize({})
    expect(createdWorkers).toHaveLength(1)
    expect(createdWorkers[0]!.terminate).not.toHaveBeenCalled()

    // First terminate on created worker
    await engine.terminate()
    expect(createdWorkers[0]!.terminate).toHaveBeenCalledTimes(1)

    // Second terminate is a no-op
    await engine.terminate()
    expect(createdWorkers[0]!.terminate).toHaveBeenCalledTimes(1)
  })

  it('cleans up worker if aborted while worker creation is in flight', async () => {
    const engine = createOcrEngine()
    const controller = new AbortController()

    let resolveCreation!: (w: MockWorkerInstance) => void
    const creationPromise = new Promise<MockWorkerInstance>((resolve) => {
      resolveCreation = resolve
    })

    mockCreateWorker.mockImplementationOnce(async () => creationPromise)

    const pendingRecognize = engine.recognize({}, { signal: controller.signal })
    controller.abort()

    await expect(pendingRecognize).rejects.toBeInstanceOf(CancelledError)

    const lateWorker: MockWorkerInstance = {
      recognize: vi.fn(),
      terminate: vi.fn().mockResolvedValue({})
    }
    resolveCreation(lateWorker)
    // Yield macrotask to allow promise chain to settle
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(lateWorker.terminate).toHaveBeenCalled()
  })
})
