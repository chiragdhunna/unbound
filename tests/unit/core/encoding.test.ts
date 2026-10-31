import { describe, expect, it } from 'vitest'
import { decodeText } from '../../../src/core/encoding'

const bytes = (value: string) => new TextEncoder().encode(value).buffer

describe('decodeText', () => {
  it('decodes UTF-8, UTF-8 BOM, and UTF-16 BOMs', () => {
    expect(decodeText(bytes('hello')).text).toBe('hello')
    expect(
      decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]).buffer).text
    ).toBe('hi')
    expect(
      decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]).buffer)
        .text
    ).toBe('hi')
    expect(
      decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]).buffer)
        .text
    ).toBe('hi')
  })

  it('falls back to windows-1252 with an info warning', () => {
    const result = decodeText(new Uint8Array([0x93, 0x48, 0x69, 0x94]).buffer)
    expect(result.text).toBe('“Hi”')
    expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
  })
})

describe('windows-1252 fallback', () => {
  it.each([
    [0x80, '€'], // €
    [0x81, '\u0081'], // undefined
    [0x82, '‚'], // ‚
    [0x83, 'ƒ'], // ƒ
    [0x84, '„'], // „
    [0x85, '…'], // …
    [0x86, '†'], // †
    [0x87, '‡'], // ‡
    [0x88, 'ˆ'], // ˆ
    [0x89, '‰'], // ‰
    [0x8a, 'Š'], // Š
    [0x8b, '‹'], // ‹
    [0x8c, 'Œ'], // Œ
    [0x8d, '\u008D'], // undefined
    [0x8e, 'Ž'], // Ž
    [0x8f, '\u008F'], // undefined
    [0x90, '\u0090'], // undefined
    [0x91, '‘'], // ‘
    [0x92, '’'], // ’
    [0x93, '“'], // “
    [0x94, '”'], // ”
    [0x95, '•'], // •
    [0x96, '–'], // –
    [0x97, '—'], // —
    [0x98, '˜'], // ˜
    [0x99, '™'], // ™
    [0x9a, 'š'], // š
    [0x9b, '›'], // ›
    [0x9c, 'œ'], // œ
    [0x9d, '\u009D'], // undefined
    [0x9e, 'ž'], // ž
    [0x9f, 'Ÿ'] // Ÿ
  ])('maps byte %i to %o', (byte, expected) => {
    const result = decodeText(new Uint8Array([byte]).buffer)
    expect(result.text).toBe(expected)
    expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
  })

  it('passes through 0xA0-0xFF unchanged', () => {
    // Test a few representative bytes
    const samples: [number, string][] = [
      [0xa0, ' '], // non-breaking space
      [0xe9, 'é'], // e acute
      [0xf1, 'ñ'], // n tilde
      [0xff, 'ÿ'] // y diaeresis
    ]
    for (const [byte, expected] of samples) {
      const result = decodeText(new Uint8Array([byte]).buffer)
      expect(result.text).toBe(expected)
      expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
    }
  })

  it('handles large buffers without stack overflow', () => {
    const size = 1024 * 1024 // 1 MB
    const bytes = new Uint8Array(size)
    // Fill with a byte that requires the lookup table, say 0x93 (“)
    for (let i = 0; i < size; i++) {
      bytes[i] = 0x93
    }
    const result = decodeText(bytes.buffer)
    const expected = '“'.repeat(size) // “ repeated
    expect(result.text).toBe(expected)
    expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
  })
})
