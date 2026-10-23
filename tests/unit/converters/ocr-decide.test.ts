/** @vitest-environment node */
// Tests for: src/converters/ocr/decide.ts
import { describe, expect, it } from 'vitest'
import { decideOcrPages } from '../../../src/converters/ocr/decide'

describe('decideOcrPages', () => {
  // 28 non-whitespace chars - above default threshold of 25
  const textPage = { items: [{ str: 'Hello World this is text content' }], hasImageOps: false, height: 0 }

  // 0 chars, has image ops → image-only
  const imageOnlyPage = { items: [{ str: '' }], hasImageOps: true, height: 0 }

  // 0 chars, no image ops → empty
  const emptyPage = { items: [{ str: '' }], hasImageOps: false, height: 0 }

  // mixed: some text + image ops → image-only (chars < 25 and hasImageOps)
  const mixedPage = { items: [{ str: 'Some text' }], hasImageOps: true, height: 0 }

  // 30 non-whitespace chars - clearly text
  const longTextPage = { items: [{ str: 'A'.repeat(30) }], hasImageOps: false, height: 0 }

  // 24 non-whitespace chars - just below threshold
  const twentyFourCharsPage = { items: [{ str: 'a'.repeat(24) }], hasImageOps: false, height: 0 }

  // 25 non-whitespace chars - exactly at threshold
  const twentyFiveCharsPage = { items: [{ str: 'a'.repeat(25) }], hasImageOps: false, height: 0 }

  it('classifies a text page as "text" when char count >= threshold', () => {
    const result = decideOcrPages([textPage])
    expect(result[0].reason).toBe('text')
    expect(result[0].pageNumber).toBe(1)
  })

  it('classifies an image-only page as "image-only" when chars < threshold and hasImageOps', () => {
    const result = decideOcrPages([imageOnlyPage])
    expect(result[0].reason).toBe('image-only')
    expect(result[0].pageNumber).toBe(1)
  })

  it('classifies an empty page as "empty" when chars < threshold and no image ops', () => {
    const result = decideOcrPages([emptyPage])
    expect(result[0].reason).toBe('empty')
    expect(result[0].pageNumber).toBe(1)
  })

  it('classifies a mixed document page as "image-only" when chars < threshold and hasImageOps', () => {
    const result = decideOcrPages([mixedPage])
    expect(result[0].reason).toBe('image-only')
    expect(result[0].pageNumber).toBe(1)
  })

  it('respects forceOcr and sends every page to "forced"', () => {
    const result = decideOcrPages([textPage, imageOnlyPage, emptyPage], { forceOcr: true })
    expect(result[0].reason).toBe('forced')
    expect(result[1].reason).toBe('forced')
    expect(result[2].reason).toBe('forced')
  })

  it('respects a custom minChars threshold', () => {
    const result = decideOcrPages([textPage], { minChars: 50 })
    expect(result[0].reason).toBe('empty')
    expect(result[0].pageNumber).toBe(1)
  })

  it('classifies boundary at 24/25 characters (24 chars with threshold 25 is empty)', () => {
    const result = decideOcrPages([twentyFourCharsPage])
    expect(result[0].reason).toBe('empty')
  })

  it('classifies boundary at 25/26 characters (25 chars with threshold 25 is text)', () => {
    const result = decideOcrPages([twentyFiveCharsPage])
    expect(result[0].reason).toBe('text')
  })

  it('classifies long text page as "text" with 30 chars', () => {
    const result = decideOcrPages([longTextPage])
    expect(result[0].reason).toBe('text')
  })

  it('returns decisions for all pages in a multi-page document', () => {
    const pages = [
      makePage([{ str: 'A'.repeat(30) }]),
      makePage([{ str: '' }], true),
      makePage([{ str: '' }], false)
    ]
    const result = decideOcrPages(pages)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.reason)).toEqual(['text', 'image-only', 'empty'])
    expect(result.map((r) => r.pageNumber)).toEqual([1, 2, 3])
  })

  it('classifies whitespace-only text as "empty"', () => {
    const whitespacePage = { items: [{ str: '   ' }], hasImageOps: false, height: 0 }
    const result = decideOcrPages([whitespacePage])
    expect(result[0].reason).toBe('empty')
  })
})

function makePage(
  items: { str: string; hasImageOps?: boolean }[],
  overrideHasImageOps?: boolean
) {
  return {
    items: items.map((it) => ({
      str: it.str,
      x: 0,
      y: 0,
      height: 12,
      width: it.str.length * 8
    })),
    hasImageOps: overrideHasImageOps ?? false,
    height: 0
  }
}