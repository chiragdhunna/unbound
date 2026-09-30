import { describe, expect, it } from 'vitest'
import { detectFileKind, detectFileKindWithWarnings } from '../../../src/core/detect'
import { normalizeMarkdown } from '../../../src/core/markdown'
import { countText, estimateTokens } from '../../../src/core/tokens'
import { combineMarkdown } from '../../../src/core/combine'
import { errorMessage, CorruptFileError, PasswordRequiredError, UnsupportedFormatError } from '../../../src/core/errors'

const buffer = (...values: number[]) => new Uint8Array(values).buffer
const text = (value: string) => new TextEncoder().encode(value).buffer

describe('detection matrix', () => {
  it('lets magic bytes beat a misleading extension and reports the mismatch', () => {
    const result = detectFileKindWithWarnings({ name: 'wrong.docx', mime: 'application/octet-stream', bytes: buffer(0x25, 0x50, 0x44, 0x46, 0x2d) })
    expect(result.kind).toBe('pdf')
    expect(result.warnings[0]?.code).toBe('TYPE_MISMATCH')
  })

  it('discriminates ZIP families and OLE2 cases', () => {
    expect(detectFileKind({ name: 'a.docx', mime: '', bytes: text('PK\x03\x04 word/document.xml') })).toBe('docx')
    expect(detectFileKind({ name: 'a.pptx', mime: '', bytes: text('PK\x03\x04 ppt/presentation.xml') })).toBe('pptx')
    expect(detectFileKind({ name: 'a.xlsx', mime: '', bytes: text('PK\x03\x04 xl/workbook.xml') })).toBe('xlsx')
    expect(detectFileKind({ name: 'a.docx', mime: '', bytes: buffer(0xd0, 0xcf, 0x11, 0xe0) })).toBe('encrypted-office')
    expect(detectFileKind({ name: 'a.doc', mime: '', bytes: buffer(0xd0, 0xcf, 0x11, 0xe0) })).toBe('legacy-office')
    expect(detectFileKind({ name: 'a.bin', mime: '', bytes: buffer(0x00, 0xff) })).toBe('unknown')
    expect(detectFileKind({ name: 'empty.txt', mime: 'text/plain', bytes: new ArrayBuffer(0) })).toBe('text')
  })
})

describe('normalizer, counters, combine, and error mapping', () => {
  it('normalizes outside fences without changing fenced content', () => {
    expect(normalizeMarkdown('a\r\n\r\n\r\n b  \n```\n x  \n```')).toBe('a\n\n b\n```\n x  \n```\n')
  })

  it('uses script-aware monotonic token estimates and counts', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('日本語')).toBeGreaterThan(0)
    expect(estimateTokens('日本語日本語')).toBeGreaterThan(estimateTokens('日本語'))
    expect(countText('one two')).toEqual({ chars: 7, words: 2, tokens: 2 })
  })

  it('combines stable file boundaries and maps typed errors', () => {
    expect(combineMarkdown([{ name: 'a.txt', markdown: 'A\n' }, { name: 'b.txt', markdown: 'B\n' }])).toBe('# File: a.txt\n\nA\n\n# File: b.txt\n\nB\n')
    expect(errorMessage(new PasswordRequiredError('Encrypted'))).toContain('Save')
    expect(errorMessage(new CorruptFileError('Broken'))).toContain('another copy')
    expect(errorMessage(new UnsupportedFormatError('Nope'))).toBe('Nope')
  })
})
