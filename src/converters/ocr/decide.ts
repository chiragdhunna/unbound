/***
 * Pure module that decides, per PDF page, whether to OCR it.

/ *
 * A page is "image-only" if its non-whitespace extracted character count is < 25
 * (a named, exported constant) AND the page has image operators.
 *
 * forceOcr overrides the decision and sends every page to OCR.
 *
 * Export a pure function, e.g. decideOcrPages(pages, { forceOcr?, minChars? }),
 * that returns per-page decisions with a reason ('text' | 'image-only' | 'forced' | 'empty').
 *
 * Pages with few characters and NO image ops are 'empty', not OCR candidates.
 */

export const MIN_CHARS_PER_PAGE = 25

export type OcrDecision = 'text' | 'image-only' | 'forced' | 'empty'

export interface OcrDecisionOptions {
  /** Override: send every page to OCR regardless of content. */
  forceOcr?: boolean
  /** Minimum non-whitespace character count threshold per page. Defaults to MIN_CHARS_PER_PAGE. */
  minChars?: number
}

/**
 * Decide per-page whether OCR is needed.
 *
 * @param pages - ExtractedPage[] from pdf extraction (each page has items, height, and hasImageOps)
 * @param options - Optional settings: forceOcr and minChars
 * @returns Array of { pageNumber: number; reason: OcrDecision } per page
 */
export function decideOcrPages(
  pages: Array<{items: { str: string }[]; hasImageOps?: boolean; height: number}>,
  options?: OcrDecisionOptions
): { pageNumber: number; reason: OcrDecision }[] {
  const { forceOcr = false, minChars = MIN_CHARS_PER_PAGE } = options ?? {}

  return pages.map((page, index) => {
    const pageNumber = index + 1
    const nonWhitespaceCharCount = page.items
      .filter((item) => item.str && item.str.trim() !== '')
      .reduce((total, item) => total + item.str.replace(/\s/g, '').length, 0)

    // If forceOcr is set, every page is 'forced'
    if (forceOcr) {
      return { pageNumber, reason: 'forced' as const }
    }

    // Pages with few characters AND no image ops are 'empty', not OCR candidates
    if (nonWhitespaceCharCount < minChars && !page.hasImageOps) {
      return { pageNumber, reason: 'empty' as const }
    }

    // Pages with few characters AND have image ops are 'image-only'
    if (nonWhitespaceCharCount < minChars && page.hasImageOps) {
      return { pageNumber, reason: 'image-only' as const }
    }

    // Pages with sufficient characters are 'text'
    if (nonWhitespaceCharCount >= minChars) {
      return { pageNumber, reason: 'text' as const }
    }

    // Fallback - should not be reached
    return { pageNumber, reason: 'text' as const }
  })
}

/**
 * Check if a page has any text content (non-whitespace characters).
 * Useful for determining if a page is truly empty.
 */
export function pageHasText(page: {items: { str: string }[]; hasImageOps?: boolean }): boolean {
  return page.items.some((item) => item.str && item.str.trim() !== '')
}