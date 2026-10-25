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
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray?: unknown[] }>
  cleanup(): void
  /** pdfjs exposes `view` as [x0, y0, x1, y1]; y1 - y0 is height, x1 - x0 is width. */
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
  detectEmbeddedImages?: boolean
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
  /** True if a text page contains a large embedded image (>= 30% of page area). */
  hasLargeImage?: boolean
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

function pageWidthOf(page: PdfPageLike): number {
  const view = page.view
  if (Array.isArray(view) && view.length >= 4) {
    const width = (view[2] ?? 0) - (view[0] ?? 0)
    if (width > 0) return width
  }
  return 0
}

export const TRANSFORM_OPS = {
  save: 10,
  restore: 11,
  transform: 12
} as const

/**
 * pdfjs operator codes that paint an image (pdfjs-dist 6.4.299 OPS table):
 * paintImageMaskXObject, paintImageXObject, paintInlineImageXObject,
 * paintImageXObjectRepeat, paintImageMaskXObjectRepeat. A unit test pins these
 * to the installed pdfjs `OPS`, so an upgrade that renumbers them fails CI.
 */
export const OPS_CODES: ReadonlySet<number> = new Set([83, 85, 86, 88, 89])

/** True if the page's operator list (numeric op codes) paints any image. */
export function hasImageOpsFromOperatorList(operatorList: {
  fnArray: ArrayLike<number>
}): boolean {
  const fnArray = operatorList?.fnArray
  if (!fnArray) return false
  for (let i = 0; i < fnArray.length; i += 1) {
    if (OPS_CODES.has(fnArray[i] as number)) return true
  }
  return false
}

/**
 * Checks whether an operator list contains an image occupying at least thresholdRatio
 * (default 30%) of the total page area (PLAN §7.5).
 */
export function hasLargeImageFromOperatorList(
  operatorList: { fnArray: ArrayLike<number>; argsArray?: unknown[] },
  pageWidth: number,
  pageHeight: number,
  thresholdRatio = 0.3
): boolean {
  const pageArea = pageWidth * pageHeight
  if (pageArea <= 0) return false
  const fnArray = operatorList?.fnArray
  const argsArray = operatorList?.argsArray
  if (!fnArray) return false

  if (!argsArray) {
    return hasImageOpsFromOperatorList(operatorList)
  }

  let currentTransform = [1, 0, 0, 1, 0, 0]
  const transformStack: number[][] = []

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i]

    if (fn === TRANSFORM_OPS.save) {
      transformStack.push([...currentTransform])
    } else if (fn === TRANSFORM_OPS.restore) {
      if (transformStack.length > 0) {
        currentTransform = transformStack.pop()!
      }
    } else if (
      fn === TRANSFORM_OPS.transform &&
      Array.isArray(args) &&
      args.length >= 6
    ) {
      const a = (args[0] as number) ?? 0
      const b = (args[1] as number) ?? 0
      const c = (args[2] as number) ?? 0
      const d = (args[3] as number) ?? 0
      const e = (args[4] as number) ?? 0
      const f = (args[5] as number) ?? 0
      const a0 = currentTransform[0] ?? 1
      const b0 = currentTransform[1] ?? 0
      const c0 = currentTransform[2] ?? 0
      const d0 = currentTransform[3] ?? 1
      const e0 = currentTransform[4] ?? 0
      const f0 = currentTransform[5] ?? 0
      currentTransform = [
        a * a0 + b * c0,
        a * b0 + b * d0,
        c * a0 + d * c0,
        c * b0 + d * d0,
        e * a0 + f * c0 + e0,
        e * b0 + f * d0 + f0
      ]
    } else if (OPS_CODES.has(fn as number)) {
      const a = currentTransform[0] ?? 0
      const b = currentTransform[1] ?? 0
      const c = currentTransform[2] ?? 0
      const d = currentTransform[3] ?? 0
      const imageArea = Math.abs(a * d - b * c)
      if (imageArea / pageArea >= thresholdRatio) {
        return true
      }
    }
  }

  return false
}

/**
 * Reads every page of a PDF into per-page text items plus the page height.
 * Pages with fewer than MIN_CHARS_PER_PAGE characters also get `hasImageOps`
 * from the operator list; text-rich pages skip that (slower) call unless
 * detectEmbeddedImages is enabled.
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
      let hasLargeImage = false
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
      } else if (hooks?.detectEmbeddedImages) {
        try {
          const operatorList = await page.getOperatorList()
          const width = pageWidthOf(page)
          const height = pageHeightOf(page)
          hasLargeImage = hasLargeImageFromOperatorList(
            operatorList,
            width,
            height,
            0.3
          )
        } catch {
          hasLargeImage = false
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

      pages.push({
        items,
        height: pageHeightOf(page),
        hasImageOps,
        hasLargeImage
      })
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
