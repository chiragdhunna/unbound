import { describe, expect, it } from 'vitest'
import { decodeText } from '../../../src/core/encoding'

const bytes = (value: string) => new TextEncoder().encode(value).buffer

describe('decodeText', () => {
  it('decodes UTF-8, UTF-8 BOM, and UTF-16 BOMs', () => {
    expect(decodeText(bytes('hello')).text).toBe('hello')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]).buffer).text).toBe('hi')
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]).buffer).text).toBe('hi')
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]).buffer).text).toBe('hi')
  })

  it('falls back to windows-1252 with an info warning', () => {
    const result = decodeText(new Uint8Array([0x93, 0x48, 0x69, 0x94]).buffer)
    expect(result.text).toBe('“Hi”')
    expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
  })
})
