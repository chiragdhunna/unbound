import type { PDFPageProxy } from 'pdfjs-dist'
import { CorruptFileError, OcrFailedError } from '../../core/errors'

export const DEFAULT_OCR_SCALE = 2.0
export const DEFAULT_MAX_LONG_EDGE = 3000

export interface RenderScaleOptions {
  scale?: number
  maxLongEdge?: number
}

export interface RenderedPageCanvas {
  canvas: HTMLCanvasElement | OffscreenCanvas
  width: number
  height: number
  scale: number
}

/**
 * Pure function: computes the render scale for OCR.
 * Defaults to 2.0 scale (standard for 150-300 DPI OCR balance) and
 * max long edge 3000px to bound memory (~36 MB for 3000x3000 RGBA).
 * If Math.max(width, height) * scale > maxLongEdge, scale is clamped
 * down so the long edge equals maxLongEdge.
 */
export function computeRenderScale(
  width: number,
  height: number,
  options?: RenderScaleOptions
): number {
  const targetScale = options?.scale ?? DEFAULT_OCR_SCALE
  const maxLongEdge = options?.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE
  const longEdge = Math.max(width, height)
  if (longEdge <= 0) {
    return targetScale
  }
  if (longEdge * targetScale > maxLongEdge) {
    return maxLongEdge / longEdge
  }
  return targetScale
}

/**
 * Pure function: computes scale for standalone image files (PLAN §7.5).
 * Downscales images wider or taller than 3000px so max long edge is 3000px.
 * Upscales small text images (< 1000px wide and < 1000px high) 2× to improve OCR character separation.
 */
export function computeImageScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) {
    return 1.0
  }
  const longEdge = Math.max(width, height)
  if (longEdge > DEFAULT_MAX_LONG_EDGE) {
    return DEFAULT_MAX_LONG_EDGE / longEdge
  }
  if (width < 1000 && height < 1000) {
    return 2.0
  }
  return 1.0
}

/**
 * Zeros canvas dimensions to encourage garbage collection of large buffers
 * on browsers that do not collect detached canvas memory promptly.
 */
export function releaseCanvas(
  canvas?: HTMLCanvasElement | OffscreenCanvas | null
): void {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

/** Yields execution to the UI thread via macrotask (setTimeout 0). */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Creates an HTMLCanvasElement (in browser/DOM environments) or OffscreenCanvas
 * with specified width and height.
 */
export function createCanvas(
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  if (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  ) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  throw new OcrFailedError(
    'Your browser does not support HTMLCanvasElement or OffscreenCanvas. Please update your browser to use OCR.'
  )
}

/**
 * Renders a pdfjs page to an HTMLCanvasElement / OffscreenCanvas for OCR.
 * Yields to the UI thread before and after rendering to avoid UI thread freeze on large pages.
 * Always invokes page.cleanup() in a finally block to free pdfjs internal canvas buffers.
 */
export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  options?: RenderScaleOptions
): Promise<RenderedPageCanvas> {
  await yieldToUi()
  try {
    const baseViewport = page.getViewport({ scale: 1.0 })
    const scale = computeRenderScale(
      baseViewport.width,
      baseViewport.height,
      options
    )
    const viewport = page.getViewport({ scale })
    const width = Math.round(viewport.width)
    const height = Math.round(viewport.height)

    const canvas = createCanvas(width, height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
      throw new OcrFailedError(
        'Failed to obtain 2D canvas context for page rendering.'
      )
    }

    const renderTask = page.render({
      canvas:
        typeof HTMLCanvasElement !== 'undefined' &&
        canvas instanceof HTMLCanvasElement
          ? canvas
          : null,
      canvasContext:
        canvasContext as unknown as Parameters<PDFPageProxy['render']>[0]['canvasContext'],
      viewport:
        viewport as unknown as Parameters<PDFPageProxy['render']>[0]['viewport']
    })
    await renderTask.promise

    return { canvas, width, height, scale }
  } finally {
    page.cleanup()
    await yieldToUi()
  }
}

/**
 * Decodes an image from byte buffer, scales it via computeImageScale,
 * and renders it to a canvas.
 */
export async function decodeImageToCanvas(
  bytes: ArrayBuffer,
  mime: string
): Promise<RenderedPageCanvas> {
  await yieldToUi()
  let imageSource: ImageBitmap | HTMLImageElement | null = null
  let objectUrl: string | null = null

  try {
    if (typeof createImageBitmap === 'function') {
      const blob = new Blob([bytes], { type: mime || 'image/png' })
      imageSource = await createImageBitmap(blob).catch(() => {
        throw new CorruptFileError(
          'This image could not be read; it may be corrupted.'
        )
      })
    } else if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([bytes], { type: mime || 'image/png' })
      objectUrl = URL.createObjectURL(blob)
      const img = new Image()
      imageSource = await new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img)
        img.onerror = () =>
          reject(
            new CorruptFileError(
              'This image could not be read; it may be corrupted.'
            )
          )
        img.src = objectUrl!
      })
    } else {
      throw new OcrFailedError(
        'Your browser does not support image decoding APIs (createImageBitmap or Image). Please update your browser.'
      )
    }

    const naturalWidth =
      'naturalWidth' in imageSource
        ? imageSource.naturalWidth
        : imageSource.width
    const naturalHeight =
      'naturalHeight' in imageSource
        ? imageSource.naturalHeight
        : imageSource.height

    if (naturalWidth <= 0 || naturalHeight <= 0) {
      throw new CorruptFileError(
        'This image could not be read; it may be corrupted.'
      )
    }

    const scale = computeImageScale(naturalWidth, naturalHeight)
    const width = Math.round(naturalWidth * scale)
    const height = Math.round(naturalHeight * scale)

    const canvas = createCanvas(width, height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
      throw new OcrFailedError(
        'Failed to obtain 2D canvas context for image.'
      )
    }

    canvasContext.drawImage(imageSource, 0, 0, width, height)

    return { canvas, width, height, scale }
  } finally {
    if (
      imageSource &&
      'close' in imageSource &&
      typeof imageSource.close === 'function'
    ) {
      imageSource.close()
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
    await yieldToUi()
  }
}
