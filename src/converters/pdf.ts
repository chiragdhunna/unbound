import { normalizeMarkdown } from '../core/markdown'
import { type Converter, type Warning } from '../core/types'
import {
  CancelledError,
  CorruptFileError,
  PasswordRequiredError,
  ScannedPdfError
} from '../core/errors'
import { getPdfjs } from './pdf/worker'
import { extractPages } from './pdf/extract'
import { layoutPages } from './pdf/layout'

/** Below this many non-whitespace chars per page the PDF is treated as scanned. */
export const SCANNED_CHARS_PER_PAGE = 20

/** Above this many pages the user is warned that conversion may be slow. */
export const LARGE_PDF_PAGE_THRESHOLD = 300

export const pdfConverter: Converter = {
  kind: 'pdf',
  async convert(input, ctx) {
    if (input.bytes.byteLength === 0) {
      throw new CorruptFileError(
        'This PDF could not be read; it may be corrupted.'
      )
    }

    const pdfjs = await getPdfjs()

    let pages
    try {
      pages = await extractPages(pdfjs, new Uint8Array(input.bytes), {
        signal: ctx.signal,
        onProgress: (p) => ctx.onProgress(p)
      })
    } catch (error) {
      if (error instanceof CancelledError) throw error
      if ((error as { name?: string } | null)?.name === 'PasswordException') {
        throw new PasswordRequiredError('This PDF is password protected.')
      }
      throw new CorruptFileError(
        'This PDF could not be read; it may be corrupted.'
      )
    }

    const pageHeights = pages.map((page) => page.height)
    const { markdown, charCount, removedLineCount } = layoutPages(
      pages.map((page) => page.items),
      {
        pageHeights,
        pageMarkers: ctx.options.pdfPageMarkers === true
      }
    )

    if (charCount < SCANNED_CHARS_PER_PAGE * pages.length) {
      throw new ScannedPdfError(
        'This PDF looks scanned (no selectable text). OCR support is not available yet.'
      )
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
}
