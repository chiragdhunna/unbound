import { type Warning } from './types'

export interface DecodeResult {
  text: string
  warnings: Warning[]
}

function decodeUtf16BigEndian(bytes: Uint8Array): string {
  const swapped = new Uint8Array(bytes.length)
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1] ?? 0
    swapped[index + 1] = bytes[index] ?? 0
  }
  return new TextDecoder('utf-16le').decode(swapped)
}

function decodeWindows1252(bytes: Uint8Array): string {
  // Lookup table for windows-1252 code points (0-255)
  const cp: number[] = []
  for (let i = 0; i < 256; i++) {
    cp[i] = i
  }
  // Override for 0x80-0x9F per WHATWG windows-1252
  cp[0x80] = 0x20ac // €
  cp[0x82] = 0x201a // ‚
  cp[0x83] = 0x0192 // ƒ
  cp[0x84] = 0x201e // „
  cp[0x85] = 0x2026 // …
  cp[0x86] = 0x2020 // †
  cp[0x87] = 0x2021 // ‡
  cp[0x88] = 0x02c6 // ˆ
  cp[0x89] = 0x2030 // ‰
  cp[0x8a] = 0x0160 // Š
  cp[0x8b] = 0x2039 // ‹
  cp[0x8c] = 0x0152 // Œ
  // 0x8D is undefined (U+008D)
  cp[0x8d] = 0x008d
  cp[0x8e] = 0x017d // Ž
  // 0x8F is undefined (U+008F)
  cp[0x8f] = 0x008f
  // 0x90 is undefined (U+0090)
  cp[0x90] = 0x0090
  cp[0x91] = 0x2018 // ‘
  cp[0x92] = 0x2019 // ’
  cp[0x93] = 0x201c // “
  cp[0x94] = 0x201d // ”
  cp[0x95] = 0x2022 // •
  cp[0x96] = 0x2013 // –
  cp[0x97] = 0x2014 // —
  cp[0x98] = 0x02dc // ˜
  cp[0x99] = 0x2122 // ™
  cp[0x9a] = 0x0161 // š
  cp[0x9b] = 0x203a // ›
  cp[0x9c] = 0x0153 // œ
  // 0x9D is undefined (U+009D)
  cp[0x9d] = 0x009d
  cp[0x9e] = 0x017e // ž
  cp[0x9f] = 0x0178 // Ÿ

  // Process in chunks to avoid stack overflow on large inputs
  const chars: string[] = []
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    for (let j = 0; j < chunk.length; j++) {
      const byte = chunk[j]
      // @ts-expect-error TS2538 false positive
      const codePoint = cp[byte]
      // All code points are in BMP (Basic Multilingual Plane) for windows-1252
      chars.push(String.fromCharCode(codePoint))
    }
  }
  return chars.join('')
}

export function decodeText(bytes: ArrayBuffer): DecodeResult {
  const input = new Uint8Array(bytes)
  if (
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
  ) {
    return {
      text: new TextDecoder('utf-8').decode(input.slice(3)),
      warnings: []
    }
  }
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(input.slice(2)),
      warnings: []
    }
  }
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return { text: decodeUtf16BigEndian(input.slice(2)), warnings: [] }
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(input),
      warnings: []
    }
  } catch {
    return {
      text: decodeWindows1252(input),
      warnings: [
        {
          code: 'ENCODING_FALLBACK',
          message: 'Input was decoded with Windows-1252 fallback.',
          severity: 'info'
        }
      ]
    }
  }
}
