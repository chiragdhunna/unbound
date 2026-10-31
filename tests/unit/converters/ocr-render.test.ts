import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PDFPageProxy } from 'pdfjs-dist'
import {
  computeImageScale,
  computeRenderScale,
  createCanvas,
  decodeImageToCanvas,
  DEFAULT_MAX_LONG_EDGE,
  DEFAULT_OCR_SCALE,
  releaseCanvas,
  renderPdfPageToCanvas
} from '../../../src/converters/ocr/render'
import { CorruptFileError, OcrFailedError } from '../../../src/core/errors'

describe('ocr render helpers (M6.3b)', () => {
  describe('computeRenderScale math', () => {
    it('returns default scale (2.0) for standard page (612x792) under budget', () => {
      const scale = computeRenderScale(612, 792)
      expect(scale).toBe(DEFAULT_OCR_SCALE)
      expect(612 * scale).toBe(1224)
      expect(792 * scale).toBe(1584)
      expect(Math.max(612, 792) * scale).toBeLessThanOrEqual(
        DEFAULT_MAX_LONG_EDGE
      )
    })

    it('clamps scale down for large page (3000x4000) so long edge equals maxLongEdge (3000)', () => {
      const scale = computeRenderScale(3000, 4000)
      expect(scale).toBe(0.75) // 3000 / 4000
      expect(4000 * scale).toBe(3000)
      expect(3000 * scale).toBe(2250)
    })

    it('handles landscape orientation correctly for standard and large pages', () => {
      // Standard landscape: 792 x 612 -> scale 2.0
      const standardLandscape = computeRenderScale(792, 612)
      expect(standardLandscape).toBe(2.0)

      // Large landscape: 5000 x 2000 -> clamped to 3000 / 5000 = 0.6
      const largeLandscape = computeRenderScale(5000, 2000)
      expect(largeLandscape).toBe(0.6)
      expect(5000 * largeLandscape).toBe(3000)
    })

    it('respects custom scale option override when within budget', () => {
      const scale = computeRenderScale(612, 792, { scale: 3.0 })
      expect(scale).toBe(3.0)
      expect(792 * 3.0).toBe(2376)
    })

    it('respects custom maxLongEdge option override and clamps accordingly', () => {
      const scale = computeRenderScale(612, 792, { maxLongEdge: 1000 })
      expect(scale).toBe(1000 / 792)
      expect(792 * scale).toBeCloseTo(1000, 5)
    })

    it('safely handles zero or negative dimensions by returning target scale', () => {
      expect(computeRenderScale(0, 0)).toBe(DEFAULT_OCR_SCALE)
      expect(computeRenderScale(-100, -200)).toBe(DEFAULT_OCR_SCALE)
    })
  })

  describe('computeImageScale math', () => {
    it('upscales small images (< 1000x1000) 2x for OCR separation', () => {
      expect(computeImageScale(600, 200)).toBe(2.0)
      expect(computeImageScale(999, 500)).toBe(2.0)
    })

    it('returns 1.0 for normal images between 1000px and 3000px', () => {
      expect(computeImageScale(1200, 800)).toBe(1.0)
      expect(computeImageScale(2500, 2000)).toBe(1.0)
      expect(computeImageScale(3000, 1500)).toBe(1.0)
    })

    it('clamps down large images (> 3000px) so max edge is 3000px', () => {
      expect(computeImageScale(4000, 2000)).toBe(0.75) // 3000 / 4000
      expect(computeImageScale(2000, 6000)).toBe(0.5) // 3000 / 6000
    })

    it('handles zero or negative dimensions safely', () => {
      expect(computeImageScale(0, 0)).toBe(1.0)
      expect(computeImageScale(-50, 100)).toBe(1.0)
    })
  })

  describe('releaseCanvas helper', () => {
    it('zeroes width and height on HTMLCanvasElement', () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 1600
      expect(canvas.width).toBe(1200)
      expect(canvas.height).toBe(1600)

      releaseCanvas(canvas)

      expect(canvas.width).toBe(0)
      expect(canvas.height).toBe(0)
    })

    it('safely handles null or undefined canvas without error', () => {
      expect(() => releaseCanvas(null)).not.toThrow()
      expect(() => releaseCanvas(undefined)).not.toThrow()
    })
  })

  describe('createCanvas helper', () => {
    it('creates an HTMLCanvasElement with requested dimensions', () => {
      const canvas = createCanvas(800, 600)
      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(600)
    })

    it('creates an OffscreenCanvas when document is unavailable', () => {
      const origDoc = globalThis.document
      const origOffscreen = globalThis.OffscreenCanvas
      try {
        // @ts-expect-error simulating non-DOM environment
        delete globalThis.document
        class FakeOffscreenCanvas {
          width: number
          height: number
          constructor(w: number, h: number) {
            this.width = w
            this.height = h
          }
          getContext = vi.fn()
        }
        // @ts-expect-error setting mock OffscreenCanvas
        globalThis.OffscreenCanvas = FakeOffscreenCanvas

        const canvas = createCanvas(640, 480)
        expect(canvas.width).toBe(640)
        expect(canvas.height).toBe(480)
      } finally {
        globalThis.document = origDoc
        globalThis.OffscreenCanvas = origOffscreen
      }
    })

    it('throws OcrFailedError when neither document nor OffscreenCanvas is available', () => {
      const origDoc = globalThis.document
      const origOffscreen = globalThis.OffscreenCanvas
      try {
        // @ts-expect-error simulating missing canvas APIs
        delete globalThis.document
        // @ts-expect-error simulating missing OffscreenCanvas
        delete globalThis.OffscreenCanvas

        expect(() => createCanvas(640, 480)).toThrow(OcrFailedError)
      } finally {
        globalThis.document = origDoc
        globalThis.OffscreenCanvas = origOffscreen
      }
    })
  })

  describe('renderPdfPageToCanvas', () => {
    let mockContext: unknown
    let contextSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      mockContext = {
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn()
      }
      contextSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(mockContext as unknown as RenderingContext)
    })

    afterEach(() => {
      contextSpy.mockRestore()
      vi.clearAllMocks()
    })

    function createMockPdfPage(
      overrides: {
        width?: number
        height?: number
        renderRejects?: Error
        renderThrowsSync?: boolean
      } = {}
    ): {
      page: PDFPageProxy
      getViewport: ReturnType<typeof vi.fn>
      render: ReturnType<typeof vi.fn>
      cleanup: ReturnType<typeof vi.fn>
    } {
      const baseWidth = overrides.width ?? 612
      const baseHeight = overrides.height ?? 792

      const getViewport = vi.fn(({ scale }: { scale: number }) => ({
        width: baseWidth * scale,
        height: baseHeight * scale
      }))

      const cleanup = vi.fn()

      const render = vi.fn(() => {
        if (overrides.renderThrowsSync) {
          throw new Error('Sync render crash')
        }
        if (overrides.renderRejects) {
          return {
            promise: Promise.reject(overrides.renderRejects)
          }
        }
        return {
          promise: Promise.resolve()
        }
      })

      const page = {
        getViewport,
        render,
        cleanup
      } as unknown as PDFPageProxy

      return { page, getViewport, render, cleanup }
    }

    it('renders a PDF page to canvas, calls page.cleanup(), and returns metadata', async () => {
      const { page, getViewport, render, cleanup } = createMockPdfPage()

      const result = await renderPdfPageToCanvas(page)

      expect(getViewport).toHaveBeenCalledWith({ scale: 1.0 })
      expect(getViewport).toHaveBeenCalledWith({ scale: 2.0 })

      expect(render).toHaveBeenCalledTimes(1)
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasContext: mockContext,
          viewport: expect.objectContaining({ width: 1224, height: 1584 })
        })
      )

      expect(cleanup).toHaveBeenCalledTimes(1)

      expect(result.scale).toBe(2.0)
      expect(result.width).toBe(1224)
      expect(result.height).toBe(1584)
      expect(result.canvas.width).toBe(1224)
      expect(result.canvas.height).toBe(1584)
    })

    it('renders large page clamped to maxLongEdge budget', async () => {
      const { page, getViewport, render, cleanup } = createMockPdfPage({
        width: 3000,
        height: 4000
      })

      const result = await renderPdfPageToCanvas(page)

      expect(getViewport).toHaveBeenCalledWith({ scale: 0.75 })
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasContext: mockContext,
          viewport: expect.objectContaining({ width: 2250, height: 3000 })
        })
      )
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(result.scale).toBe(0.75)
      expect(result.width).toBe(2250)
      expect(result.height).toBe(3000)
    })

    it('calls page.cleanup() even when page.render promise rejects', async () => {
      const { page, cleanup } = createMockPdfPage({
        renderRejects: new Error('Async raster failed')
      })

      await expect(renderPdfPageToCanvas(page)).rejects.toThrow(
        'Async raster failed'
      )
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('calls page.cleanup() even when page.render throws synchronously', async () => {
      const { page, cleanup } = createMockPdfPage({
        renderThrowsSync: true
      })

      await expect(renderPdfPageToCanvas(page)).rejects.toThrow(
        'Sync render crash'
      )
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('calls page.cleanup() and throws OcrFailedError if 2D context cannot be obtained', async () => {
      contextSpy.mockReturnValue(null)
      const { page, cleanup } = createMockPdfPage()

      await expect(renderPdfPageToCanvas(page)).rejects.toBeInstanceOf(
        OcrFailedError
      )
      await expect(renderPdfPageToCanvas(page)).rejects.toThrow(
        'Failed to obtain 2D canvas context for page rendering.'
      )
      expect(cleanup).toHaveBeenCalled()
    })
  })

  describe('decodeImageToCanvas', () => {
    let mockContext: unknown
    let contextSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      mockContext = {
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn()
      }
      contextSpy = vi
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(mockContext as unknown as RenderingContext)
    })

    afterEach(() => {
      contextSpy.mockRestore()
      vi.clearAllMocks()
    })

    it('decodes image using createImageBitmap and scales appropriately', async () => {
      const mockClose = vi.fn()
      const fakeBitmap = {
        width: 500,
        height: 250,
        close: mockClose
      }
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      ;(
        globalThis as unknown as { createImageBitmap: unknown }
      ).createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap)

      try {
        const bytes = new Uint8Array([1, 2, 3, 4]).buffer
        const result = await decodeImageToCanvas(bytes, 'image/png')

        expect(result.scale).toBe(2.0)
        expect(result.width).toBe(1000)
        expect(result.height).toBe(500)
        expect(mockClose).toHaveBeenCalledTimes(1)
        expect(mockContext).toBeDefined()
      } finally {
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = originalCreateBitmap
      }
    })

    it('throws CorruptFileError when createImageBitmap fails', async () => {
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      ;(
        globalThis as unknown as { createImageBitmap: unknown }
      ).createImageBitmap = vi.fn().mockRejectedValue(new Error('Corrupt data'))

      try {
        const bytes = new Uint8Array([1, 2, 3, 4]).buffer
        await expect(
          decodeImageToCanvas(bytes, 'image/png')
        ).rejects.toBeInstanceOf(CorruptFileError)
      } finally {
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = originalCreateBitmap
      }
    })

    it('throws CorruptFileError when image has zero dimensions', async () => {
      const mockClose = vi.fn()
      const fakeBitmap = {
        width: 0,
        height: 0,
        close: mockClose
      }
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      ;(
        globalThis as unknown as { createImageBitmap: unknown }
      ).createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap)

      try {
        const bytes = new Uint8Array([1, 2, 3, 4]).buffer
        await expect(
          decodeImageToCanvas(bytes, 'image/png')
        ).rejects.toBeInstanceOf(CorruptFileError)
        expect(mockClose).toHaveBeenCalledTimes(1)
      } finally {
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = originalCreateBitmap
      }
    })

    it('throws OcrFailedError when 2D canvas context cannot be acquired', async () => {
      contextSpy.mockReturnValue(null)
      const mockClose = vi.fn()
      const fakeBitmap = {
        width: 400,
        height: 300,
        close: mockClose
      }
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      ;(
        globalThis as unknown as { createImageBitmap: unknown }
      ).createImageBitmap = vi.fn().mockResolvedValue(fakeBitmap)

      try {
        const bytes = new Uint8Array([1, 2, 3, 4]).buffer
        await expect(
          decodeImageToCanvas(bytes, 'image/png')
        ).rejects.toBeInstanceOf(OcrFailedError)
        expect(mockClose).toHaveBeenCalledTimes(1)
      } finally {
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = originalCreateBitmap
      }
    })

    it('uses HTMLImageElement fallback when createImageBitmap is not available', async () => {
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      // @ts-expect-error removing createImageBitmap to test fallback
      delete globalThis.createImageBitmap

      const origRevoke = URL.revokeObjectURL
      const origCreateUrl = URL.createObjectURL
      const revokeSpy = vi.fn()
      URL.revokeObjectURL = revokeSpy
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-img-url')

      const origImage = globalThis.Image
      class FakeImage {
        naturalWidth = 800
        naturalHeight = 600
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
      // @ts-expect-error setting fake Image
      globalThis.Image = FakeImage

      try {
        const bytes = new Uint8Array([1, 2, 3]).buffer
        const res = await decodeImageToCanvas(bytes, 'image/png')
        // 800x600 < 1000px so scale is 2.0 -> width 1600, height 1200
        expect(res.scale).toBe(2.0)
        expect(res.width).toBe(1600)
        expect(res.height).toBe(1200)
        expect(revokeSpy).toHaveBeenCalledWith('blob:mock-img-url')
      } finally {
        if (originalCreateBitmap) {
          globalThis.createImageBitmap =
            originalCreateBitmap as typeof createImageBitmap
        }
        URL.revokeObjectURL = origRevoke
        URL.createObjectURL = origCreateUrl
        globalThis.Image = origImage
      }
    })

    it('throws CorruptFileError and revokes object URL when HTMLImageElement onerror fires', async () => {
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      // @ts-expect-error removing createImageBitmap
      delete globalThis.createImageBitmap

      const origRevoke = URL.revokeObjectURL
      const origCreateUrl = URL.createObjectURL
      const revokeSpy = vi.fn()
      URL.revokeObjectURL = revokeSpy
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-bad-img')

      const origImage = globalThis.Image
      class BadImage {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          setTimeout(() => this.onerror?.(), 0)
        }
      }
      // @ts-expect-error setting fake BadImage
      globalThis.Image = BadImage

      try {
        const bytes = new Uint8Array([1, 2, 3]).buffer
        await expect(
          decodeImageToCanvas(bytes, 'image/png')
        ).rejects.toBeInstanceOf(CorruptFileError)
        expect(revokeSpy).toHaveBeenCalledWith('blob:mock-bad-img')
      } finally {
        if (originalCreateBitmap) {
          globalThis.createImageBitmap =
            originalCreateBitmap as typeof createImageBitmap
        }
        URL.revokeObjectURL = origRevoke
        URL.createObjectURL = origCreateUrl
        globalThis.Image = origImage
      }
    })

    it('throws OcrFailedError when neither createImageBitmap nor Image is supported', async () => {
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap
      const origImage = globalThis.Image
      // @ts-expect-error removing createImageBitmap
      delete globalThis.createImageBitmap
      // @ts-expect-error removing Image
      delete globalThis.Image

      try {
        const bytes = new Uint8Array([1, 2, 3]).buffer
        await expect(
          decodeImageToCanvas(bytes, 'image/png')
        ).rejects.toBeInstanceOf(OcrFailedError)
      } finally {
        if (originalCreateBitmap) {
          globalThis.createImageBitmap =
            originalCreateBitmap as typeof createImageBitmap
        }
        globalThis.Image = origImage
      }
    })

    it('applies scaling branches correctly: small (upscale 2x), normal (1x), large (downscale to 3000px)', async () => {
      const mockClose = vi.fn()
      const originalCreateBitmap = (
        globalThis as unknown as { createImageBitmap?: unknown }
      ).createImageBitmap

      try {
        // Small image: 400x300 -> scale 2.0 -> 800x600
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = vi.fn().mockResolvedValue({
          width: 400,
          height: 300,
          close: mockClose
        })
        const smallRes = await decodeImageToCanvas(
          new Uint8Array(1).buffer,
          'image/png'
        )
        expect(smallRes.scale).toBe(2.0)
        expect(smallRes.width).toBe(800)
        expect(smallRes.height).toBe(600)

        // Normal image: 1200x800 -> scale 1.0 -> 1200x800
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = vi.fn().mockResolvedValue({
          width: 1200,
          height: 800,
          close: mockClose
        })
        const normalRes = await decodeImageToCanvas(
          new Uint8Array(1).buffer,
          'image/png'
        )
        expect(normalRes.scale).toBe(1.0)
        expect(normalRes.width).toBe(1200)
        expect(normalRes.height).toBe(800)

        // Large image: 4000x2000 -> scale 0.75 -> 3000x1500
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = vi.fn().mockResolvedValue({
          width: 4000,
          height: 2000,
          close: mockClose
        })
        const largeRes = await decodeImageToCanvas(
          new Uint8Array(1).buffer,
          'image/png'
        )
        expect(largeRes.scale).toBe(0.75)
        expect(largeRes.width).toBe(3000)
        expect(largeRes.height).toBe(1500)
      } finally {
        ;(
          globalThis as unknown as { createImageBitmap: unknown }
        ).createImageBitmap = originalCreateBitmap
      }
    })
  })
})
