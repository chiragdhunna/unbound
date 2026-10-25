/**
 * Pure layout: turns pdf.js-style text items into markdown.
 * No pdfjs import here — unit-testable with synthetic item arrays.
 *
 * Thresholds come from the M5.2 spike (see DECISIONS.md):
 * - same-line y tolerance 0.3 × max height (baselines inside one line share a
 *   y; the spike showed clean separation between 0 and ~5 pt drift)
 * - intra-paragraph baseline distance 16–18 pt vs paragraph gaps of 34–50 pt,
 *   so 1.7 × line height safely separates them (real gaps are 2.8× or more)
 * - space gap 0.2 × line height (word spacing is well under one line height)
 * - heading 1.2 × the length-weighted median font size (spike: 24 vs 12)
 *
 * Header/footer thresholds (M5.3, see DECISIONS.md):
 * - HEADER_FOOTER_BAND 0.08 of page height, REPEAT_RATIO 0.6, MIN_PAGES_FOR_REPEAT 3
 */

const SAME_LINE_Y_TOLERANCE = 0.3
const PARAGRAPH_GAP_FACTOR = 1.7
const SPACE_GAP_FACTOR = 0.2
const HEADING_SIZE_FACTOR = 1.2
const HEADING_MAX_CHARS = 120

const HEADER_FOOTER_BAND = 0.08
const REPEAT_RATIO = 0.6
const MIN_PAGES_FOR_REPEAT = 3

const BULLET_MARKERS = ['\u2022 ', '\u2013 ', '- ', '* '] as const
const NUMBERED_OR_LETTER_MARKER = /^(\d+|[a-z])[.)]\s+(.*)$/

/** A bare page number such as "12", "Page 12", "Page 3 of 10" or "- 12 -". */
const BARE_PAGE_NUMBER =
  /^\s*(page\s+)?\d+(\s+of\s+\d+)?\s*$/i
const DASHED_PAGE_NUMBER = /^\s*[-–]\s*\d+\s*[-–]\s*$/

export type TextItemLite = {
  str: string
  x: number
  y: number
  height: number
  width: number
}

export type LayoutPagesOptions = {
  /** One page height per page (pdf.js page.view y1 - y0). Enables band checks. */
  pageHeights?: number[]
  /** Remove repeated headers/footers/page numbers. Defaults to true. */
  removeRepeated?: boolean
  /** Prepend a `--- Page N ---` block before each page. Defaults to false. */
  pageMarkers?: boolean
}

export type LayoutPagesResult = {
  markdown: string
  charCount: number
  removedLineCount: number
  pageMarkdowns?: string[]
}

type WorkLine = {
  y: number
  height: number
  items: TextItemLite[]
}

type Line = {
  text: string
  y: number
  height: number
}

type Block =
  { kind: 'paragraph'; height: number; y: number } | { kind: 'list'; y: number }

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function lengthWeightedMedian(items: TextItemLite[]): number {
  const weighted: number[] = []
  for (const item of items) {
    const copies = Math.max(1, Math.round(item.width))
    for (let i = 0; i < copies; i += 1) weighted.push(item.height)
  }
  return median(weighted)
}

function joinLineItems(items: TextItemLite[]): string {
  let text = ''
  let prev: TextItemLite | null = null
  for (const item of items) {
    if (!prev) {
      text = item.str
    } else {
      const lineHeight = Math.max(prev.height, item.height)
      const gap = item.x - (prev.x + prev.width)
      const needsSpace =
        gap > SPACE_GAP_FACTOR * lineHeight &&
        !/\s$/.test(text) &&
        !/^\s/.test(item.str)
      text += (needsSpace ? ' ' : '') + item.str
    }
    prev = item
  }
  return text.trim()
}

function groupPageLines(pageItems: TextItemLite[]): Line[] {
  const work: WorkLine[] = []
  for (const item of pageItems) {
    if (item.str.trim() === '') continue
    const line = work.find(
      (candidate) =>
        Math.abs(candidate.y - item.y) <=
        SAME_LINE_Y_TOLERANCE * Math.max(candidate.height, item.height)
    )
    if (line) {
      line.height = Math.max(line.height, item.height)
      line.items.push(item)
    } else {
      work.push({ y: item.y, height: item.height, items: [item] })
    }
  }
  return work
    .map((line) => ({
      text: joinLineItems([...line.items].sort((a, b) => a.x - b.x)),
      y: line.y,
      height: line.height
    }))
    .filter((line) => line.text !== '')
    .sort((a, b) => b.y - a.y)
}

function normalizeListItem(text: string): string | null {
  for (const marker of BULLET_MARKERS) {
    if (text.startsWith(marker)) return `- ${text.slice(marker.length).trim()}`
  }
  const numbered = text.match(NUMBERED_OR_LETTER_MARKER)
  if (numbered) {
    const [, label = '', rest = ''] = numbered
    return `${label}. ${rest.trim()}`
  }
  return null
}

function isListItem(text: string): boolean {
  return normalizeListItem(text) !== null
}

/** Lowercase, trim, collapse spaces and mask digit runs so "Page 3 of 10" and
 * "Page 4 of 10" both normalise to "page # of #". */
function normaliseForRepeat(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, '#')
}

function isBarePageNumber(text: string): boolean {
  return BARE_PAGE_NUMBER.test(text) || DASHED_PAGE_NUMBER.test(text)
}

/** Band membership, y measured from the BOTTOM of the page. */
function bandOf(
  y: number,
  pageHeight: number
): 'header' | 'footer' | null {
  if (y >= pageHeight * (1 - HEADER_FOOTER_BAND)) return 'header'
  if (y <= pageHeight * HEADER_FOOTER_BAND) return 'footer'
  return null
}

/**
 * Removes repeated headers/footers and bare page numbers.
 * Returns the surviving lines and how many lines were removed.
 */
function stripBands(
  pageLines: Line[][],
  pageHeights: number[]
): { kept: Line[][]; removedLineCount: number } {
  let removedLineCount = 0

  // Pass 1: bare page numbers on any page count (header or footer band).
  const afterPageNumbers = pageLines.map((lines, pageIndex) => {
    const pageHeight = pageHeights[pageIndex] ?? 0
    if (pageHeight <= 0) return lines
    return lines.filter((line) => {
      const inBand = bandOf(line.y, pageHeight) !== null
      if (inBand && isBarePageNumber(line.text)) {
        removedLineCount += 1
        return false
      }
      return true
    })
  })

  // Pass 2: repeated band text, only with enough pages to judge repetition.
  if (afterPageNumbers.length < MIN_PAGES_FOR_REPEAT) {
    return { kept: afterPageNumbers, removedLineCount }
  }

  const counts = new Map<string, number>()
  for (const lines of afterPageNumbers) {
    const seenOnThisPage = new Set<string>()
    for (const line of lines) {
      const pageHeight = pageHeights[afterPageNumbers.indexOf(lines)] ?? 0
      if (pageHeight <= 0) continue
      if (bandOf(line.y, pageHeight) === null) continue
      const key = normaliseForRepeat(line.text)
      if (key === '' || seenOnThisPage.has(key)) continue
      seenOnThisPage.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const threshold = REPEAT_RATIO * afterPageNumbers.length
  const repeated = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= threshold)
      .map(([key]) => key)
  )

  const kept = afterPageNumbers.map((lines, pageIndex) => {
    const pageHeight = pageHeights[pageIndex] ?? 0
    if (pageHeight <= 0) return lines
    return lines.filter((line) => {
      if (bandOf(line.y, pageHeight) === null) return true
      if (repeated.has(normaliseForRepeat(line.text))) {
        removedLineCount += 1
        return false
      }
      return true
    })
  })

  return { kept, removedLineCount }
}

export function layoutPages(
  pages: TextItemLite[][],
  options?: LayoutPagesOptions
): LayoutPagesResult {
  const pageHeights = options?.pageHeights
  const removeRepeated = options?.removeRepeated !== false
  const pageMarkers = options?.pageMarkers === true

  const allItems = pages.flat()
  const charCount = allItems
    .filter((item) => item.str.trim() !== '')
    .reduce((total, item) => total + item.str.replace(/\s/g, '').length, 0)
  if (charCount === 0) return { markdown: '', charCount: 0, removedLineCount: 0 }

  let pageLines = pages.map((pageItems) => groupPageLines(pageItems))

  // Which items survive band removal, tracked per page so the median font
  // size below is computed only from content the reader will actually see.
  let survivingItems = pages.map((pageItems) => pageItems)
  let removedLineCount = 0
  if (removeRepeated && pageHeights && pageHeights.length === pages.length) {
    const stripped = stripBands(pageLines, pageHeights)
    pageLines = stripped.kept
    removedLineCount = stripped.removedLineCount

    survivingItems = pages.map((pageItems, pageIndex) => {
      const keptTexts = new Set(
        (pageLines[pageIndex] ?? []).map((line) => line.text)
      )
      return keptTexts.size === 0
        ? []
        : pageItems.filter((item) =>
            keptTexts.has(joinLineItems([item]))
          )
    })
  }

  const medianSource = survivingItems.flat()
  const medianHeight = lengthWeightedMedian(
    medianSource.length > 0 ? medianSource : allItems
  )

  const headingHeights = [
    ...new Set(
      pageLines
        .flat()
        .filter(
          (line) =>
            line.height >= HEADING_SIZE_FACTOR * medianHeight &&
            line.text.length < HEADING_MAX_CHARS &&
            !isListItem(line.text)
        )
        .map((line) => line.height)
    )
  ].sort((a, b) => b - a)

  const headingLevel = (height: number): number =>
    Math.min(headingHeights.indexOf(height) + 1, 3)

  const renderPage = (lines: Line[]): string => {
    // Each block is a list of physical lines; list blocks hold one item per
    // line, paragraph blocks are joined (and de-hyphenated) at flush time.
    const blocks: string[][] = []
    let prevBlock: Block | null = null
    let pending: string[] = []

    const flushPending = () => {
      if (pending.length === 0) return
      const joined = pending
        .join(' ')
        .replace(/([A-Za-z])- ([a-z])/g, '$1$2')
        .trim()
      if (joined !== '') blocks.push([joined])
      pending = []
    }

    for (const line of lines) {
      const heading =
        line.height >= HEADING_SIZE_FACTOR * medianHeight &&
        line.text.length < HEADING_MAX_CHARS &&
        !isListItem(line.text)

      if (heading) {
        flushPending()
        blocks.push([`${'#'.repeat(headingLevel(line.height))} ${line.text}`])
        prevBlock = null
        continue
      }

      const listItem = normalizeListItem(line.text)
      if (listItem !== null) {
        flushPending()
        if (prevBlock?.kind === 'list') {
          blocks[blocks.length - 1]?.push(listItem)
        } else {
          blocks.push([listItem])
        }
        prevBlock = { kind: 'list', y: line.y }
        continue
      }

      if (
        prevBlock?.kind === 'paragraph' &&
        prevBlock.y - line.y <= PARAGRAPH_GAP_FACTOR * prevBlock.height
      ) {
        pending.push(line.text)
        prevBlock = { kind: 'paragraph', height: line.height, y: line.y }
        continue
      }

      flushPending()
      pending.push(line.text)
      prevBlock = { kind: 'paragraph', height: line.height, y: line.y }
    }
    flushPending()
    return blocks.map((block) => block.join('\n')).join('\n\n')
  }

  const rendered = pageLines.map(renderPage)
  const markdown = rendered
    .map((pageMarkdown, pageIndex) => {
      const marker = pageMarkers ? `--- Page ${pageIndex + 1} ---` : ''
      const parts = [marker, pageMarkdown].filter((part) => part !== '')
      return parts.join('\n\n')
    })
    .filter((part) => part !== '')
    .join('\n\n')

  return { markdown, charCount, removedLineCount, pageMarkdowns: rendered }
}

export function layoutPagesToMarkdown(pages: TextItemLite[][]): {
  markdown: string
  charCount: number
} {
  const { markdown, charCount } = layoutPages(pages)
  return { markdown, charCount }
}
