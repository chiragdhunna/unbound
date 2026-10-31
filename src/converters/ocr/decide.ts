/**
 * Pure per-page OCR decision (PLAN §7.5). No DOM, no network, no tesseract.
 *
 * A page is 'image-only' when it has fewer than `minChars` non-whitespace
 * characters of selectable text AND paints at least one image. With little
 * text and no image it is 'empty' (nothing for OCR to read). `forceOcr` sends
 * every page to OCR.
 */

export const MIN_CHARS_PER_PAGE = 25

export type OcrDecision = 'text' | 'image-only' | 'forced' | 'empty'

export interface OcrDecisionOptions {
  /** Send every page to OCR regardless of content. */
  forceOcr?: boolean
  /** Non-whitespace character threshold per page (default MIN_CHARS_PER_PAGE). */
  minChars?: number
}

export interface OcrPageInput {
  items: { str: string }[]
  hasImageOps?: boolean
  height: number
}

export interface OcrPageDecision {
  pageNumber: number
  reason: OcrDecision
}

export function decideOcrPages(
  pages: OcrPageInput[],
  options: OcrDecisionOptions = {}
): OcrPageDecision[] {
  const { forceOcr = false, minChars = MIN_CHARS_PER_PAGE } = options

  return pages.map((page, index) => {
    const pageNumber = index + 1
    if (forceOcr) return { pageNumber, reason: 'forced' }

    const characters = page.items.reduce(
      (total, item) => total + item.str.replace(/\s/g, '').length,
      0
    )
    if (characters >= minChars) return { pageNumber, reason: 'text' }
    return { pageNumber, reason: page.hasImageOps ? 'image-only' : 'empty' }
  })
}
