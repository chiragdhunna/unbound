import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PDFPageProxy } from 'pdfjs-dist'
import {
  computeRenderScale,
  createCanvas,
  DEFAULT_MAX_LONG_EDGE,
  DEFAULT_OCR_SCALE,
  releaseCanvas,
  renderPdfPageToCanvas
} from '../../../src/converters/ocr/render'
import { OcrFailedError } from '../../../src/core/errors'

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

    function createMockPdfPage(overrides: {
      width?: number
      height?: number
      renderRejects?: Error
      renderThrowsSync?: boolean
    } = {}): {
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

      // Verifies viewport was requested for base scale (1.0) and computed OCR scale (2.0)
      expect(getViewport).toHaveBeenCalledWith({ scale: 1.0 })
      expect(getViewport).toHaveBeenCalledWith({ scale: 2.0 })

      // Verifies page.render was called with canvasContext and scaled viewport
      expect(render).toHaveBeenCalledTimes(1)
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasContext: mockContext,
          viewport: expect.objectContaining({ width: 1224, height: 1584 })
        })
      )

      // Verifies page.cleanup() was called
      expect(cleanup).toHaveBeenCalledTimes(1)

      // Verifies return value shape and dimensions
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
})
