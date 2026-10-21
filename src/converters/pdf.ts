import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'
import {
  CancelledError,
  CorruptFileError,
  PasswordRequiredError,
  ScannedPdfError
} from '../core/errors'
import { getPdfjs } from './pdf/worker'
import { extractPageItems } from './pdf/extract'
import { layoutPagesToMarkdown, type TextItemLite } from './pdf/layout'

/** Below this many non-whitespace chars per page the PDF is treated as scanned. */
export const SCANNED_CHARS_PER_PAGE = 20

export const pdfConverter: Converter = {
  kind: 'pdf',
  async convert(input, ctx) {
    if (input.bytes.byteLength === 0) {
      throw new CorruptFileError(
        'This PDF could not be read; it may be corrupted.'
      )
    }

    const pdfjs = await getPdfjs()

    let pages: TextItemLite[][]
    try {
      pages = await extractPageItems(pdfjs, new Uint8Array(input.bytes), {
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

    const { markdown, charCount } = layoutPagesToMarkdown(pages)

    if (charCount < SCANNED_CHARS_PER_PAGE * pages.length) {
      throw new ScannedPdfError(
        'This PDF looks scanned (no selectable text). OCR support is not available yet.'
      )
    }

    return {
      markdown: normalizeMarkdown(markdown),
      warnings: [],
      stats: { pages: pages.length }
    }
  }
}
