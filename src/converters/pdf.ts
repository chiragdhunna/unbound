import { normalizeMarkdown } from '../core/markdown'
import {
  type Converter,
  type ConvertStats,
  type Warning
} from '../core/types'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  OcrFailedError,
  PasswordRequiredError
} from '../core/errors'
import { getPdfjs } from './pdf/worker'
import { extractPages, type ExtractedPage } from './pdf/extract'
import { layoutPages } from './pdf/layout'
import { decideOcrPages } from './ocr/decide'

const LARGE_PDF_PAGE_THRESHOLD = 300

export const pdfConverter: Converter = {
  kind: 'pdf',
  async convert(input, ctx) {
    if (input.bytes.byteLength === 0) {
      throw new CorruptFileError(
        'This PDF could not be read; it may be corrupted.'
      )
    }

    if (ctx.signal?.aborted) throw new CancelledError()

    const pdfjs = await getPdfjs()

    let pages: ExtractedPage[]
    try {
      pages = await extractPages(pdfjs, new Uint8Array(input.bytes), {
        signal: ctx.signal,
        onProgress: (p) => ctx.onProgress(p)
      })
    } catch (error) {
      if (error instanceof CancelledError) throw error
      if (error instanceof OcrFailedError) throw error
      if ((error as { name?: string } | null)?.name === 'PasswordException') {
        throw new PasswordRequiredError('This PDF is password protected.')
      }
      if (
        error instanceof TypeError ||
        error instanceof ReferenceError ||
        (error instanceof Error &&
          /not a function|not defined|is not supported|missing feature/i.test(error.message))
      ) {
        throw new OcrFailedError(
          `Your browser is missing a feature required to process this PDF (${error instanceof Error ? error.message : String(error)}). Please update your browser.`
        )
      }
      throw new CorruptFileError(
        'This PDF could not be read; it may be corrupted.'
      )
    }

    const pageHeights = pages.map((page) => page.height)
    const decisions = decideOcrPages(pages, {
      forceOcr: ctx.options.forceOcr === true
    })

    const ocrIndices = decisions
      .map((d, index) =>
        d.reason === 'image-only' || d.reason === 'forced' ? index : -1
      )
      .filter((index) => index !== -1)

    // Fast-path: no pages require OCR (standard text-based PDF)
    if (ocrIndices.length === 0) {
      const { markdown, charCount, removedLineCount } = layoutPages(
        pages.map((page) => page.items),
        {
          pageHeights,
          pageMarkers: ctx.options.pdfPageMarkers === true
        }
      )

      if (charCount === 0) {
        throw new NoTextFoundError('No text found in this PDF.')
      }

      const warnings: Warning[] = []
      if (removedLineCount > 0) {
        warnings.push({
          code: 'PDF_BANDS_REMOVED',
          message: 'Repeated headers, footers and page numbers were removed.',
          severity: 'info'
        })
      }
      if (pages.length > LARGE_PDF_PAGE_THRESHOLD) {
        warnings.push({
          code: 'PDF_LARGE',
          message: `Large PDF (${pages.length} pages). Conversion can take a while.`,
          severity: 'warn'
        })
      }

      return {
        markdown: normalizeMarkdown(markdown),
        warnings,
        stats: { pages: pages.length }
      }
    }

    // OCR-path: one or more pages require OCR (scanned or mixed PDF)
    const { createOcrEngine } = await import('./ocr/engine')
    const { renderPdfPageToCanvas, releaseCanvas } = await import('./ocr/render')

    const layoutRes = layoutPages(
      pages.map((page) => page.items),
      {
        pageHeights,
        removeRepeated: true,
        pageMarkers: false
      }
    )
    const textPageMarkdowns = layoutRes.pageMarkdowns ?? []
    const removedLineCount = layoutRes.removedLineCount

    const ocrEngine = createOcrEngine({
      lang: ctx.options.ocrLanguage || 'eng'
    })
    const ocrResults = new Map<number, { text: string; confidence: number }>()

    const ocrTask = pdfjs.getDocument({
      data: new Uint8Array(input.bytes).slice(0)
    })

    try {
      const doc = await ocrTask.promise

      for (const pageIndex of ocrIndices) {
        if (ctx.signal?.aborted) throw new CancelledError()
        const pageNumber = pageIndex + 1

        ctx.onProgress({
          phase: 'ocr',
          current: pageNumber,
          total: pages.length
        })

        const pageProxy = await doc.getPage(pageNumber)
        let canvas: HTMLCanvasElement | OffscreenCanvas | null = null
        try {
          const rendered = await renderPdfPageToCanvas(pageProxy)
          canvas = rendered.canvas
          const res = await ocrEngine.recognize(canvas, {
            signal: ctx.signal,
            onProgress: (p) => {
              ctx.onProgress({
                phase: 'ocr',
                current: pageNumber,
                total: pages.length,
                page: pageNumber,
                totalPages: pages.length,
                percent: p.current
              })
            }
          })
          ocrResults.set(pageIndex, res)
        } catch (error) {
          if (error instanceof CancelledError) throw error
          if (error instanceof OcrFailedError) throw error
          if (
            error instanceof TypeError ||
            error instanceof ReferenceError ||
            (error instanceof Error &&
              /not a function|not defined|is not supported|missing feature/i.test(error.message))
          ) {
            throw new OcrFailedError(
              `Your browser is missing a feature required to render or OCR page ${pageNumber} (${error instanceof Error ? error.message : String(error)}). Please update your browser.`
            )
          }
          throw error
        } finally {
          if (canvas) {
            releaseCanvas(canvas)
          }
        }
      }
    } finally {
      await ocrTask.destroy().catch(() => undefined)
      await ocrEngine.terminate().catch(() => undefined)
    }

    const pageMarkdowns: string[] = []
    let totalChars = 0
    let totalConfidence = 0
    let totalOcrPages = 0

    for (let index = 0; index < pages.length; index++) {
      let pageText = ''
      if (ocrResults.has(index)) {
        const ocrRes = ocrResults.get(index)!
        pageText = ocrRes.text.trim()
        totalConfidence += ocrRes.confidence
        totalOcrPages += 1
      } else {
        pageText = (textPageMarkdowns[index] ?? '').trim()
      }

      totalChars += pageText.replace(/\s/g, '').length

      if (pageText !== '') {
        if (ctx.options.pdfPageMarkers) {
          pageMarkdowns.push(`--- Page ${index + 1} ---\n\n${pageText}`)
        } else {
          pageMarkdowns.push(pageText)
        }
      }
    }

    if (totalChars === 0) {
      throw new NoTextFoundError('No text found in this PDF.')
    }

    const meanConfidence =
      totalOcrPages > 0 ? Math.round(totalConfidence / totalOcrPages) : 100
    const stats: ConvertStats = {
      pages: pages.length,
      ocrPages: totalOcrPages,
      ocrConfidence: meanConfidence
    }

    const warnings: Warning[] = []
    if (removedLineCount > 0) {
      warnings.push({
        code: 'PDF_BANDS_REMOVED',
        message: 'Repeated headers, footers and page numbers were removed.',
        severity: 'info'
      })
    }
    if (pages.length > LARGE_PDF_PAGE_THRESHOLD) {
      warnings.push({
        code: 'PDF_LARGE',
        message: `Large PDF (${pages.length} pages). Conversion can take a while.`,
        severity: 'warn'
      })
    }
    if (meanConfidence < 70 || totalChars < 10) {
      warnings.push({
        code: 'OCR_LOW_CONFIDENCE',
        message:
          meanConfidence < 40 || totalChars < 10
            ? `OCR output looks unreliable (mean confidence: ${meanConfidence}%).`
            : `Low OCR confidence (mean confidence: ${meanConfidence}%).`,
        severity: 'warn'
      })
    }

    return {
      markdown: normalizeMarkdown(pageMarkdowns.join('\n\n')),
      warnings,
      stats
    }
  }
}
