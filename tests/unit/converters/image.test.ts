// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { imageConverter } from '../../../src/converters/image'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  OcrFailedError,
  errorMessage
} from '../../../src/core/errors'
import { createConvertContext } from '../../../src/core/context'

const mockRecognize = vi.fn()
const mockTerminate = vi.fn().mockResolvedValue(undefined)
const mockDecodeImageToCanvas = vi.fn()
const mockReleaseCanvas = vi.fn()

vi.mock('../../../src/converters/ocr/engine', () => ({
  createOcrEngine: vi.fn(() => ({
    recognize: mockRecognize,
    terminate: mockTerminate
  }))
}))

vi.mock('../../../src/converters/ocr/render', () => ({
  decodeImageToCanvas: (...args: unknown[]) => mockDecodeImageToCanvas(...args),
  releaseCanvas: (...args: unknown[]) => mockReleaseCanvas(...args)
}))

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82
])

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function imageInput(bytes: Uint8Array, name = 'scan.png', mime = 'image/png') {
  return {
    name,
    bytes: toArrayBuffer(bytes),
    mime
  }
}

describe('imageConverter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecognize.mockReset()
    mockTerminate.mockReset().mockResolvedValue(undefined)
    mockDecodeImageToCanvas.mockReset().mockResolvedValue({
      canvas: {} as HTMLCanvasElement,
      width: 400,
      height: 200,
      scale: 1.0
    })
    mockReleaseCanvas.mockReset()
  })

  it('converts an image via OCR and returns normalized markdown', async () => {
    mockRecognize.mockResolvedValueOnce({
      text: 'RECEIPT #9921\nTOTAL $42.50',
      confidence: 91
    })

    const progress: { phase: string; current: number; total: number }[] = []
    const ctx = {
      ...createConvertContext(),
      onProgress: (p: { phase: string; current: number; total: number }) =>
        progress.push(p)
    }

    const result = await imageConverter.convert(imageInput(TINY_PNG), ctx)

    expect(result.markdown).toBe('RECEIPT #9921\nTOTAL $42.50\n')
    expect(result.stats.files).toBe(1)
    expect(result.stats.ocrPages).toBe(1)
    expect(result.stats.ocrConfidence).toBe(91)
    expect(result.warnings).toEqual([])
    expect(mockDecodeImageToCanvas).toHaveBeenCalledTimes(1)
    expect(mockReleaseCanvas).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalledTimes(1)
    expect(progress).toContainEqual({ phase: 'ocr', current: 0, total: 100 })
  })

  it('throws CorruptFileError on zero-byte input', async () => {
    const ctx = createConvertContext()
    await expect(
      imageConverter.convert(
        {
          name: 'empty.png',
          bytes: new ArrayBuffer(0),
          mime: 'image/png'
        },
        ctx
      )
    ).rejects.toBeInstanceOf(CorruptFileError)

    expect(mockDecodeImageToCanvas).not.toHaveBeenCalled()
  })

  it('throws CorruptFileError when decode fails', async () => {
    mockDecodeImageToCanvas.mockRejectedValueOnce(
      new CorruptFileError('This image could not be read; it may be corrupted.')
    )

    const ctx = createConvertContext()
    await expect(
      imageConverter.convert(imageInput(new Uint8Array([1, 2, 3, 4])), ctx)
    ).rejects.toBeInstanceOf(CorruptFileError)

    expect(mockReleaseCanvas).not.toHaveBeenCalled()
    expect(mockTerminate).toHaveBeenCalledTimes(1)
  })

  it('throws NoTextFoundError when OCR output is whitespace only', async () => {
    mockRecognize.mockResolvedValueOnce({
      text: '   \n  \t ',
      confidence: 12
    })

    const ctx = createConvertContext()
    await expect(
      imageConverter.convert(imageInput(TINY_PNG), ctx)
    ).rejects.toBeInstanceOf(NoTextFoundError)

    expect(mockReleaseCanvas).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalledTimes(1)
  })

  it('warns on low OCR confidence (< 70)', async () => {
    mockRecognize.mockResolvedValueOnce({
      text: 'SMUDGED TEXT',
      confidence: 52
    })

    const ctx = createConvertContext()
    const result = await imageConverter.convert(imageInput(TINY_PNG), ctx)

    expect(result.warnings).toContainEqual({
      code: 'OCR_LOW_CONFIDENCE',
      message: 'Low OCR confidence (mean confidence: 52%).',
      severity: 'warn'
    })
    expect(result.stats.ocrConfidence).toBe(52)
  })

  it('propagates CancelledError and terminates worker when aborted', async () => {
    const controller = new AbortController()
    mockRecognize.mockImplementationOnce(async () => {
      controller.abort()
      throw new CancelledError()
    })

    const ctx = {
      ...createConvertContext(),
      signal: controller.signal
    }

    await expect(
      imageConverter.convert(imageInput(TINY_PNG), ctx)
    ).rejects.toBeInstanceOf(CancelledError)

    expect(mockReleaseCanvas).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalledTimes(1)
  })

  it('throws CancelledError immediately if signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const ctx = {
      ...createConvertContext(),
      signal: controller.signal
    }

    await expect(
      imageConverter.convert(imageInput(TINY_PNG), ctx)
    ).rejects.toBeInstanceOf(CancelledError)

    expect(mockDecodeImageToCanvas).not.toHaveBeenCalled()
  })

  it('throws OcrFailedError with an actionable message when decoding encounters a missing browser feature (never NoTextFoundError)', async () => {
    mockDecodeImageToCanvas.mockRejectedValueOnce(
      new TypeError('createImageBitmap is not a function')
    )

    const ctx = createConvertContext()
    const error = await imageConverter
      .convert(imageInput(TINY_PNG), ctx)
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(OcrFailedError)
    expect(error).not.toBeInstanceOf(NoTextFoundError)
    expect(errorMessage(error)).toContain('missing a feature')
    expect(errorMessage(error)).toContain('createImageBitmap')
    expect(errorMessage(error)).toContain('update your browser')
  })

  it('throws OcrFailedError with an actionable message when OCR recognition encounters a missing browser feature (never NoTextFoundError)', async () => {
    mockRecognize.mockRejectedValueOnce(
      new TypeError('WebAssembly.compile is not a function')
    )

    const ctx = createConvertContext()
    const error = await imageConverter
      .convert(imageInput(TINY_PNG), ctx)
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(OcrFailedError)
    expect(error).not.toBeInstanceOf(NoTextFoundError)
    expect(errorMessage(error)).toContain('missing a feature')
    expect(errorMessage(error)).toContain('WebAssembly.compile')
    expect(errorMessage(error)).toContain('update your browser')
  })

  it('forwards OCR engine progress events to ctx.onProgress', async () => {
    mockRecognize.mockImplementationOnce(async (_canvas, options) => {
      options?.onProgress?.({ phase: 'ocr', current: 42, total: 100 })
      return { text: 'Recognized text', confidence: 85 }
    })

    const progress: unknown[] = []
    const ctx = {
      ...createConvertContext(),
      onProgress: (p: unknown) => progress.push(p)
    }

    await imageConverter.convert(imageInput(TINY_PNG), ctx)

    expect(progress).toContainEqual({
      phase: 'ocr',
      current: 42,
      total: 100,
      page: 1,
      totalPages: 1,
      percent: 42
    })
  })

  it('rethrows unexpected non-feature error during decodeImageToCanvas', async () => {
    const customError = new Error('Storage failure')
    mockDecodeImageToCanvas.mockRejectedValueOnce(customError)

    const ctx = createConvertContext()
    await expect(
      imageConverter.convert(imageInput(TINY_PNG), ctx)
    ).rejects.toThrow('Storage failure')
  })

  it('rethrows unexpected non-feature error during OCR recognition', async () => {
    const customError = new Error('Engine crash')
    mockRecognize.mockRejectedValueOnce(customError)

    const ctx = createConvertContext()
    await expect(
      imageConverter.convert(imageInput(TINY_PNG), ctx)
    ).rejects.toThrow('Engine crash')
  })
})
