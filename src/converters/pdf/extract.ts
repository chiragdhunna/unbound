import { CancelledError } from '../../core/errors'
import { MIN_CHARS_PER_PAGE } from '../ocr/decide'
import { type TextItemLite } from './layout'

type RawItem = {
  str?: string
  transform?: number[]
  height?: number
  width?: number
}

export type PdfPageLike = {
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: ArrayLike<number> }>
  cleanup(): void
  /** pdfjs exposes `view` as [x0, y0, x1, y1]; y1 - y0 is the page height. */
  view?: number[]
}

export type PdfDocumentLike = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
}

export type PdfjsLike = {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<PdfDocumentLike>
    destroy(): Promise<void>
  }
}

export type ExtractHooks = {
  signal?: AbortSignal
  onProgress?: (p: { phase: string; current: number; total: number }) => void
}

export type ExtractedPage = {
  items: TextItemLite[]
  height: number
  /**
   * True if the page paints at least one image. Only computed for pages with
   * fewer than MIN_CHARS_PER_PAGE characters of text (the only pages OCR can
   * apply to); it is false for every other page.
   */
  hasImageOps?: boolean
}

/** Yields to the event loop so a long document never freezes the UI thread. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function pageHeightOf(page: PdfPageLike): number {
  const view = page.view
  if (Array.isArray(view) && view.length >= 4) {
    const height = (view[3] ?? 0) - (view[1] ?? 0)
    if (height > 0) return height
  }
  return 0
}

/**
 * pdfjs operator codes that paint an image (pdfjs-dist 6.4.299 OPS table):
 * paintImageMaskXObject, paintImageXObject, paintInlineImageXObject,
 * paintImageXObjectRepeat, paintImageMaskXObjectRepeat. A unit test pins these
 * to the installed pdfjs `OPS`, so an upgrade that renumbers them fails CI.
 */
export const OPS_CODES: ReadonlySet<number> = new Set([83, 85, 86, 88, 89])

/** True if the page's operator list (numeric op codes) paints any image. */
export function hasImageOpsFromOperatorList(operatorList: { fnArray: ArrayLike<number> }): boolean {
  const fnArray = operatorList?.fnArray
  if (!fnArray) return false
  for (let i = 0; i < fnArray.length; i += 1) {
    if (OPS_CODES.has(fnArray[i] as number)) return true
  }
  return false
}

/**
 * Reads every page of a PDF into per-page text items plus the page height.
 * Pages with fewer than MIN_CHARS_PER_PAGE characters also get `hasImageOps`
 * from the operator list; text-rich pages skip that (slower) call.
 */
export async function extractPages(
  pdfjs: PdfjsLike,
  bytes: Uint8Array,
  hooks?: ExtractHooks
): Promise<ExtractedPage[]> {
  const task = pdfjs.getDocument({ data: bytes.slice(0) })

  try {
    const doc = await task.promise
    const pages: ExtractedPage[] = []
    const minChars = MIN_CHARS_PER_PAGE

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (hooks?.signal?.aborted) throw new CancelledError()

      const page = await doc.getPage(pageNumber)

      // Get text content first to count characters
      const content = await page.getTextContent()

      // Count non-whitespace characters
      let nonWhitespaceCharCount = 0
      for (const raw of content.items as RawItem[]) {
        if (typeof raw.str !== 'string') continue
        nonWhitespaceCharCount += raw.str.replace(/\s/g, '').length
      }

      // Only detect image ops for pages with few characters;
      // pages with enough text cannot be 'image-only'
      let hasImageOps = false
      if (nonWhitespaceCharCount < minChars) {
        // Get the operator list to detect image operators (graphics)
        try {
          const operatorList = await page.getOperatorList()
          hasImageOps = hasImageOpsFromOperatorList(operatorList)
        } catch {
          // Fail open: if operator list cannot be read on a low-text page,
          // assume images may be present so the page routes to OCR.
          hasImageOps = true
        }
      }

      const items: TextItemLite[] = []

      for (const raw of content.items as RawItem[]) {
        if (typeof raw.str !== 'string') continue
        const transform = raw.transform ?? []
        items.push({
          str: raw.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          height: raw.height ?? 0,
          width: raw.width ?? 0
        })
      }

      pages.push({ items, height: pageHeightOf(page), hasImageOps })
      page.cleanup()
      hooks?.onProgress?.({
        phase: 'pdf',
        current: pageNumber,
        total: doc.numPages
      })

      await yieldToUi()
    }

    return pages
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

/** Back-compat wrapper returning only the per-page items. */
export async function extractPageItems(
  pdfjs: PdfjsLike,
  bytes: Uint8Array,
  hooks?: ExtractHooks
): Promise<TextItemLite[][]> {
  const pages = await extractPages(pdfjs, bytes, hooks)
  return pages.map((page) => page.items)
}
