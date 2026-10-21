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
 */

const SAME_LINE_Y_TOLERANCE = 0.3
const PARAGRAPH_GAP_FACTOR = 1.7
const SPACE_GAP_FACTOR = 0.2
const HEADING_SIZE_FACTOR = 1.2
const HEADING_MAX_CHARS = 120

const BULLET_MARKERS = ['\u2022 ', '\u2013 ', '- ', '* '] as const
const NUMBERED_OR_LETTER_MARKER = /^(\d+|[a-z])[.)]\s+(.*)$/

export type TextItemLite = {
  str: string
  x: number
  y: number
  height: number
  width: number
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

export function layoutPagesToMarkdown(pages: TextItemLite[][]): {
  markdown: string
  charCount: number
} {
  const allItems = pages.flat()
  const charCount = allItems
    .filter((item) => item.str.trim() !== '')
    .reduce((total, item) => total + item.str.replace(/\s/g, '').length, 0)
  if (charCount === 0) return { markdown: '', charCount: 0 }

  const medianHeight = lengthWeightedMedian(allItems)

  const pageLines = pages.map((pageItems) => groupPageLines(pageItems))

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

  const markdown = pageLines.map(renderPage).join('\n\n')
  return { markdown, charCount }
}
