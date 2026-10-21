import { describe, expect, it } from 'vitest'
import {
  layoutPagesToMarkdown,
  type TextItemLite
} from '../../../src/converters/pdf/layout'

function item(
  str: string,
  x: number,
  y: number,
  height: number,
  width: number
): TextItemLite {
  return { str, x, y, height, width }
}

// Same coordinates the M5.2 spike fixture uses (pdf-lib Helvetica output).
const goldenPageOne: TextItemLite[] = [
  item('Quarterly Budget Review', 72, 700, 24, 266.76),
  item('', 0, 0, 0, 0),
  item(
    'This is a normal twelve point paragraph that spans',
    72,
    650,
    12,
    268.12
  ),
  item('two lines in the generated fixture document.', 72, 634, 12, 232.12),
  item('- Rent 1200', 72, 600, 12, 63),
  item('- Groceries 250', 72, 582, 12, 83),
  item('- Savings 300', 72, 564, 12, 73)
]

const goldenPageTwo: TextItemLite[] = [
  item(
    'Page two has a single normal paragraph of body text.',
    72,
    700,
    12,
    284.15
  )
]

const goldenMarkdown = [
  '# Quarterly Budget Review',
  '',
  'This is a normal twelve point paragraph that spans two lines in the generated fixture document.',
  '',
  '- Rent 1200',
  '- Groceries 250',
  '- Savings 300',
  '',
  'Page two has a single normal paragraph of body text.'
].join('\n')

describe('layoutPagesToMarkdown', () => {
  it('matches the golden two-page markdown', () => {
    const result = layoutPagesToMarkdown([goldenPageOne, goldenPageTwo])

    expect(result.markdown).toBe(goldenMarkdown)
  })

  it('counts non-whitespace characters across all pages', () => {
    const result = layoutPagesToMarkdown([goldenPageOne, goldenPageTwo])
    const expected = [...goldenPageOne, ...goldenPageTwo]
      .map((entry) => entry.str.replace(/\s/g, ''))
      .join('').length

    expect(result.charCount).toBe(expected)
  })

  it('joins many small word items on one line with single spaces', () => {
    // Real PDFs emit one item per word fragment, not one per line.
    const words = ['Budget', 'review', 'for', 'the', 'quarter']
    let x = 72
    const line = words.map((word) => {
      const entry = item(word, x, 700, 12, word.length * 6)
      x += word.length * 6 + 4 // ~4pt inter-word gap
      return entry
    })

    const result = layoutPagesToMarkdown([line])

    expect(result.markdown).toBe('Budget review for the quarter')
  })

  it('does not insert a space where items already touch or abut a space', () => {
    const result = layoutPagesToMarkdown([
      [
        item('Total', 72, 700, 12, 30),
        item(' due', 102, 700, 12, 24), // gap 0, str starts with a space
        item(':', 126, 700, 12, 6) // gap 0
      ]
    ])

    expect(result.markdown).toBe('Total due:')
  })

  it('ranks two heading sizes as # and ##', () => {
    const result = layoutPagesToMarkdown([
      [
        item('Main Title', 72, 700, 24, 120),
        item('Section Heading', 72, 660, 18, 160),
        item('Body text under the section heading.', 72, 634, 12, 600)
      ]
    ])

    expect(result.markdown).toBe(
      '# Main Title\n\n## Section Heading\n\nBody text under the section heading.'
    )
  })

  it('joins a hyphenated line break without a space', () => {
    const result = layoutPagesToMarkdown([
      [
        item('A paragraph that ends with a hy-', 72, 650, 12, 200),
        item('phenated word continues here.', 72, 634, 12, 180)
      ]
    ])

    expect(result.markdown).toBe(
      'A paragraph that ends with a hyphenated word continues here.'
    )
  })

  it('keeps numbered list items as a tight block', () => {
    const result = layoutPagesToMarkdown([
      [
        item('1. First step', 72, 650, 12, 80),
        item('2) Second step', 72, 632, 12, 88),
        item('a) Third step', 72, 614, 12, 80)
      ]
    ])

    expect(result.markdown).toBe('1. First step\n2. Second step\na. Third step')
  })

  it('normalises bullet characters to "- "', () => {
    const result = layoutPagesToMarkdown([
      [
        item('\u2022 Dash bullet item', 72, 650, 12, 120),
        item('\u2013 En dash item', 72, 632, 12, 96),
        item('* Star item', 72, 614, 12, 72)
      ]
    ])

    expect(result.markdown).toBe(
      '- Dash bullet item\n- En dash item\n- Star item'
    )
  })

  it('separates list blocks from following paragraphs with a blank line', () => {
    const result = layoutPagesToMarkdown([
      [
        item('- Rent 1200', 72, 650, 12, 63),
        item('A closing paragraph after the list.', 72, 600, 12, 200)
      ]
    ])

    expect(result.markdown).toBe(
      '- Rent 1200\n\nA closing paragraph after the list.'
    )
  })

  it('returns empty output for all-empty input', () => {
    const result = layoutPagesToMarkdown([
      [],
      [item('', 0, 0, 0, 0), item('   ', 72, 700, 12, 10)]
    ])

    expect(result.markdown).toBe('')
    expect(result.charCount).toBe(0)
  })

  it('does not treat a long heading-sized line as a heading', () => {
    const longLine = 'x'.repeat(120)
    const result = layoutPagesToMarkdown([
      [
        item(longLine, 72, 700, 24, 200),
        item('Body line below.', 72, 634, 12, 300)
      ]
    ])

    expect(result.markdown).toBe(`${longLine}\n\nBody line below.`)
  })
})
