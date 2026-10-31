import { normalizeMarkdown } from '../core/markdown'
import { type Converter, type ConvertStats, type Warning } from '../core/types'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  OcrFailedError
} from '../core/errors'
import { type RenderedPageCanvas } from './ocr/render'

export const imageConverter: Converter = {
  kind: 'image',
  async convert(input, ctx) {
    if (input.bytes.byteLength === 0) {
      throw new CorruptFileError(
        'This image could not be read; it may be corrupted.'
      )
    }

    if (ctx.signal?.aborted) throw new CancelledError()

    const { createOcrEngine } = await import('./ocr/engine')
    const { decodeImageToCanvas, releaseCanvas } = await import('./ocr/render')

    let renderedCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
    const ocrEngine = createOcrEngine({
      lang: ctx.options.ocrLanguage || 'eng'
    })

    try {
      ctx.onProgress({
        phase: 'ocr',
        current: 0,
        total: 100
      })

      let decoded: RenderedPageCanvas
      try {
        decoded = await decodeImageToCanvas(input.bytes, input.mime)
      } catch (error) {
        if (
          error instanceof CancelledError ||
          error instanceof CorruptFileError ||
          error instanceof OcrFailedError
        ) {
          throw error
        }
        if (
          error instanceof TypeError ||
          error instanceof ReferenceError ||
          (error instanceof Error &&
            /not a function|not defined|is not supported|missing feature/i.test(
              error.message
            ))
        ) {
          throw new OcrFailedError(
            `Your browser is missing a feature required to process this image (${error instanceof Error ? error.message : String(error)}). Please update your browser.`
          )
        }
        throw error
      }
      renderedCanvas = decoded.canvas

      if (ctx.signal?.aborted) throw new CancelledError()

      let result: { text: string; confidence: number }
      try {
        result = await ocrEngine.recognize(renderedCanvas, {
          signal: ctx.signal,
          onProgress: (progress) => {
            ctx.onProgress({
              phase: 'ocr',
              current: progress.current,
              total: 100,
              page: 1,
              totalPages: 1,
              percent: progress.current
            })
          }
        })
      } catch (error) {
        if (
          error instanceof CancelledError ||
          error instanceof OcrFailedError
        ) {
          throw error
        }
        if (
          error instanceof TypeError ||
          error instanceof ReferenceError ||
          (error instanceof Error &&
            /not a function|not defined|is not supported|missing feature/i.test(
              error.message
            ))
        ) {
          throw new OcrFailedError(
            `Your browser is missing a feature required to OCR this image (${error instanceof Error ? error.message : String(error)}). Please update your browser.`
          )
        }
        throw error
      }

      const trimmedText = result.text.trim()
      const nonWhitespaceChars = trimmedText.replace(/\s/g, '').length

      if (nonWhitespaceChars === 0) {
        throw new NoTextFoundError('No text found in this image.')
      }

      const warnings: Warning[] = []
      const confidence = Math.round(result.confidence)

      if (confidence < 70 || nonWhitespaceChars < 10) {
        warnings.push({
          code: 'OCR_LOW_CONFIDENCE',
          message:
            confidence < 40 || nonWhitespaceChars < 10
              ? `OCR output looks unreliable (mean confidence: ${confidence}%).`
              : `Low OCR confidence (mean confidence: ${confidence}%).`,
          severity: 'warn'
        })
      }

      const stats: ConvertStats = {
        files: 1,
        ocrPages: 1,
        ocrConfidence: confidence
      }

      return {
        markdown: normalizeMarkdown(trimmedText),
        warnings,
        stats
      }
    } finally {
      if (renderedCanvas) {
        releaseCanvas(renderedCanvas)
      }
      await ocrEngine.terminate().catch(() => undefined)
    }
  }
}
