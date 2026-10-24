// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasImageOpsFromOperatorList,
  OPS_CODES
} from '../../../src/converters/pdf/extract'
import { decideOcrPages } from '../../../src/converters/ocr/decide'

vi.mock('../../../src/converters/pdf/worker', () => ({
  getPdfjs: vi.fn()
}))

describe('PDF image ops detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('OPS_CODES exported set contains the correct pdfjs OPS numeric codes', () => {
    // These are the image painting operator codes from pdfjs OPS table (v6.4.299)
    expect(OPS_CODES.has(83)).toBe(true)   // paintImageMaskXObject
    expect(OPS_CODES.has(85)).toBe(true)   // paintImageXObject
    expect(OPS_CODES.has(86)).toBe(true)   // paintInlineImageXObject
    expect(OPS_CODES.has(88)).toBe(true)   // paintImageXObjectRepeat
    expect(OPS_CODES.has(89)).toBe(true)   // paintImageMaskXObjectRepeat

    // These are NOT image-specific image op codes
    expect(OPS_CODES.has(66)).toBe(false)  // paintXObject (generic paint)
    expect(OPS_CODES.has(1)).toBe(false)   // arbitrary code
    expect(OPS_CODES.has(0)).toBe(false)   // arbitrary code
  })

  it('hasImageOpsFromOperatorList correctly identifies image op codes from fnArray', () => {
    // fnArray containing image op codes should return true
    expect(hasImageOpsFromOperatorList({ fnArray: [83, 66, 85] })).toBe(true)
    expect(hasImageOpsFromOperatorList({ fnArray: [89] })).toBe(true)
    expect(hasImageOpsFromOperatorList({ fnArray: [85, 86, 88] })).toBe(true)

    // fnArray without image op codes should return false
    expect(hasImageOpsFromOperatorList({ fnArray: [66, 1, 2] })).toBe(false)
    expect(hasImageOpsFromOperatorList({ fnArray: [] })).toBe(false)
    expect(hasImageOpsFromOperatorList({ fnArray: [100] })).toBe(false)
  })

  it('decideOcrPages with image-only pages (few chars and hasImageOps)', () => {
    // Page with few characters AND has image ops -> 'image-only'
    const page1 = { items: [{ str: 'Hi' }], height: 0, hasImageOps: true }
    const result1 = decideOcrPages([page1], {})
    expect(result1).toEqual([{ pageNumber: 1, reason: 'image-only' }])

    // Page with few characters AND no image ops -> 'empty'
    const page2 = { items: [{ str: 'Hi' }], height: 0, hasImageOps: false }
    const result2 = decideOcrPages([page2], {})
    expect(result2).toEqual([{ pageNumber: 1, reason: 'empty' }])

    // Page with enough characters -> 'text' regardless of hasImageOps
    const page3 = { items: [{ str: 'A'.repeat(30) }], height: 0, hasImageOps: true }
    const result3 = decideOcrPages([page3], {})
    expect(result3).toEqual([{ pageNumber: 1, reason: 'text' }])
  })

  it('decideOcrPages respects forceOcr', () => {
    const page = { items: [{ str: '' }], height: 0, hasImageOps: false }
    const result = decideOcrPages([page], { forceOcr: true })
    expect(result).toEqual([{ pageNumber: 1, reason: 'forced' }])
  })

  it('decideOcrPages with custom minChars threshold', () => {
    // 24 chars with threshold 25 -> 'empty' (few chars and no image ops implied)
    // 25 chars with threshold 25 -> 'text' (sufficient chars)
    // Using the default MIN_CHARS_PER_PAGE = 25
    const page24 = { items: [{ str: 'a'.repeat(24) }], height: 0, hasImageOps: false }
    const result24 = decideOcrPages([page24], { minChars: 25 })
    expect(result24).toEqual([{ pageNumber: 1, reason: 'empty' }])

    const page25 = { items: [{ str: 'a'.repeat(25) }], height: 0, hasImageOps: false }
    const result25 = decideOcrPages([page25], { minChars: 25 })
    expect(result25).toEqual([{ pageNumber: 1, reason: 'text' }])
  })
})