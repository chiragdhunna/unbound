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

export function decodeText(bytes: ArrayBuffer): DecodeResult {
  const input = new Uint8Array(bytes)
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(input.slice(3)), warnings: [] }
  }
  if (input.length >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(input.slice(2)), warnings: [] }
  }
  if (input.length >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return { text: decodeUtf16BigEndian(input.slice(2)), warnings: [] }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(input), warnings: [] }
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(input),
      warnings: [{ code: 'ENCODING_FALLBACK', message: 'Input was decoded with Windows-1252 fallback.', severity: 'info' }]
    }
  }
}
