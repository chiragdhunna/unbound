import { CancelledError } from '../../core/errors'
import { type TextItemLite } from './layout'


type RawItem = {
  str?: string
  transform?: number[]
  height?: number
  width?: number
}

export type PdfPageLike = {
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: (string | number)[] }>
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
  /** True if the page contains image operators (graphics) rather than/selectable text. */
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

/** Checks if a page's operator list contains any image painting operators (by numeric OPS code). Imports OPS_CODES from module scope. */
export function hasImageOpsFromOperatorList(operatorList: { fnArray: (string | number)[] }): boolean {
  if (!operatorList?.fnArray) return false
  const fnArray = operatorList.fnArray
  // Image painting operator codes from pdfjs OPS table (v6.4.299)
  const imageOpCodes = new Set([83, 85, 86, 88, 89])
  // 66 = paintXObject (generic paint)
  // These are the codes that indicate image/xobject painting ops
  let i = 0
  while (i < fnArray.length) {
    const fn = fnArray[i] as number
    if (Number.isFinite(fn)) {
      if (imageOpCodes.has(fn)) {
        return true
      }
    }
    i += 1
  }
  return false
}

/** Reads every page of a PDF into per-page text items plus the page height, and detects whether each page has image operators (graphics). 
 * Optimized: only calls getOperatorList() for pages whose non-whitespace character count
  * is below MIN_CHARS_PER_PAGE (25), since pages with sufficient text cannot be 'image-only'.
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
    const minChars = 25

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
          // If operator list is not available, treat as no image ops (safe default)
          hasImageOps = false
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
export const OPS_CODES = new Set([83, 85, 86, 88, 89])
export async function extractPageItems(
  pdfjs: PdfjsLike,
  bytes: Uint8Array,
  hooks?: ExtractHooks
): Promise<TextItemLite[][]> {
  const pages = await extractPages(pdfjs, bytes, hooks)
  return pages.map((page) => page.items)
}

