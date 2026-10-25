import { normalizeMarkdown } from '../core/markdown'
import {
  type Converter,
  type ConvertStats,
  type Warning
} from '../core/types'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError
} from '../core/errors'

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

      const decoded = await decodeImageToCanvas(input.bytes, input.mime)
      renderedCanvas = decoded.canvas

      if (ctx.signal?.aborted) throw new CancelledError()

      const result = await ocrEngine.recognize(renderedCanvas, {
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
