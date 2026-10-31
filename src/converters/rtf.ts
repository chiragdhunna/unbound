import { CorruptFileError, NoTextFoundError } from '../core/errors'
import { normalizeMarkdown } from '../core/markdown'
import {
  type Converter,
  type ConverterInput,
  type ConvertContext,
  type ConvertResult
} from '../core/types'

interface RtfState {
  skip: boolean
  bold: boolean
  italic: boolean
  uc: number
}

const SKIPPED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'header',
  'footer',
  'headerl',
  'headerr',
  'headerf',
  'footerl',
  'footerr',
  'footerf',
  'revtbl',
  'generator',
  'author',
  'operator',
  'title',
  'subject',
  'comment',
  'xmlnstbl',
  'latentstyles',
  'themedata',
  'colorschememapping',
  'doccomm'
])

function decodeWindows1252Byte(byte: number): string {
  if (byte >= 0x80 && byte <= 0x9f) {
    const cp1252Map: Record<number, number> = {
      0x80: 0x20ac,
      0x82: 0x201a,
      0x83: 0x0192,
      0x84: 0x201e,
      0x85: 0x2026,
      0x86: 0x2020,
      0x87: 0x2021,
      0x88: 0x02c6,
      0x89: 0x2030,
      0x8a: 0x0160,
      0x8b: 0x2039,
      0x8c: 0x0152,
      0x8e: 0x017d,
      0x91: 0x2018,
      0x92: 0x2019,
      0x93: 0x201c,
      0x94: 0x201d,
      0x95: 0x2022,
      0x96: 0x2013,
      0x97: 0x2014,
      0x98: 0x02dc,
      0x99: 0x2122,
      0x9a: 0x0161,
      0x9b: 0x203a,
      0x9c: 0x0153,
      0x9e: 0x017e,
      0x9f: 0x0178
    }
    const mapped = cp1252Map[byte]
    if (mapped) return String.fromCodePoint(mapped)
  }
  return String.fromCharCode(byte)
}

export function parseRtfToMarkdown(
  input: string,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void
): string {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('{\\rtf')) {
    throw new CorruptFileError(
      'File does not appear to be a valid RTF document.'
    )
  }

  const len = input.length
  let text = ''
  const stack: RtfState[] = [{ skip: false, bold: false, italic: false, uc: 1 }]
  let i = 0

  let currentBold = false
  let currentItalic = false
  let lastProgressCheck = 0

  while (i < len) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    if (i - lastProgressCheck > 5000) {
      lastProgressCheck = i
      if (onProgress) {
        onProgress(Math.round((i / len) * 100))
      }
    }

    const ch = input[i]

    if (ch === '{') {
      const top = stack[stack.length - 1] ?? {
        skip: false,
        bold: false,
        italic: false,
        uc: 1
      }
      stack.push({
        skip: top.skip,
        bold: top.bold,
        italic: top.italic,
        uc: top.uc
      })
      i += 1
      continue
    }

    if (ch === '}') {
      if (stack.length > 1) {
        stack.pop()
        const top = stack[stack.length - 1] ?? {
          skip: false,
          bold: false,
          italic: false,
          uc: 1
        }
        if (currentBold && !top.bold) {
          text += '**'
          currentBold = false
        }
        if (currentItalic && !top.italic) {
          text += '_'
          currentItalic = false
        }
      }
      i += 1
      continue
    }

    const current = stack[stack.length - 1] ?? {
      skip: false,
      bold: false,
      italic: false,
      uc: 1
    }

    if (ch === '\\') {
      i += 1
      if (i >= len) break
      const nextChar = input[i]

      // Escaped characters: \{ \} \\
      if (nextChar === '{' || nextChar === '}' || nextChar === '\\') {
        if (!current.skip) text += nextChar
        i += 1
        continue
      }

      // Hex escape: \'hh
      if (nextChar === "'") {
        i += 1
        const hex = input.slice(i, i + 2)
        i += 2
        if (!current.skip) {
          const byteVal = parseInt(hex, 16)
          if (!Number.isNaN(byteVal)) {
            text += decodeWindows1252Byte(byteVal)
          }
        }
        continue
      }

      // Optional destination prefix: \*
      if (nextChar === '*') {
        current.skip = true
        i += 1
        continue
      }

      // Control symbols
      if (nextChar === '~') {
        if (!current.skip) text += ' '
        i += 1
        continue
      }
      if (nextChar === '_' || nextChar === '-') {
        if (!current.skip) text += '-'
        i += 1
        continue
      }

      // Control word: [a-zA-Z]+(-?[0-9]+)? followed by an optional delimiter space
      const match = input.slice(i).match(/^([a-zA-Z]+)(-?[0-9]+)? ?/)
      if (match) {
        i += match[0].length
        const word = match[1]?.toLowerCase() ?? ''
        const param =
          match[2] !== undefined ? parseInt(match[2], 10) : undefined

        if (SKIPPED_DESTINATIONS.has(word)) {
          current.skip = true
          continue
        }

        if (current.skip) continue

        if (word === 'par' || word === 'sect') {
          text += '\n\n'
        } else if (word === 'line') {
          text += '\n'
        } else if (word === 'tab') {
          text += '\t'
        } else if (word === 'bullet') {
          text += '- '
        } else if (word === 'b') {
          const isBold = param === undefined || param !== 0
          if (isBold !== currentBold) {
            text += '**'
            currentBold = isBold
            current.bold = isBold
          }
        } else if (word === 'i') {
          const isItalic = param === undefined || param !== 0
          if (isItalic !== currentItalic) {
            text += '_'
            currentItalic = isItalic
            current.italic = isItalic
          }
        } else if (word === 'uc') {
          if (param !== undefined) {
            current.uc = Math.max(0, param)
          }
        } else if (word === 'u') {
          if (param !== undefined) {
            let codePoint = param
            if (codePoint < 0) codePoint += 65536
            try {
              text += String.fromCodePoint(codePoint)
            } catch {
              // Ignore invalid code point
            }

            // Skip uc replacement characters
            for (let s = 0; s < current.uc && i < len; s += 1) {
              if (input[i] === '\\' && input[i + 1] === "'") {
                i += 4
              } else if (input[i] === '{' || input[i] === '}') {
                break
              } else {
                i += 1
              }
            }
          }
        }
        continue
      }

      // Unrecognized control symbol: advance 1 char
      i += 1
      continue
    }

    // Ignore raw newlines/returns in RTF code
    if (ch === '\r' || ch === '\n') {
      i += 1
      continue
    }

    if (!current.skip) {
      text += ch
    }
    i += 1
  }

  if (currentItalic) text += '_'
  if (currentBold) text += '**'

  const cleaned = text
    .replace(/ {2,}/g, ' ')
    .replace(/\n +/g, '\n')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleaned) {
    throw new NoTextFoundError('No text found in RTF document.')
  }

  return normalizeMarkdown(cleaned)
}

export const rtfConverter: Converter = {
  kind: 'rtf',
  async convert(
    input: ConverterInput,
    ctx: ConvertContext
  ): Promise<ConvertResult> {
    ctx.onProgress({ phase: 'parsing', current: 0, total: 100, percent: 0 })

    const rtfString = new TextDecoder('latin1').decode(input.bytes)
    const markdown = parseRtfToMarkdown(rtfString, ctx.signal, (percent) =>
      ctx.onProgress({
        phase: 'parsing',
        current: percent,
        total: 100,
        percent
      })
    )

    ctx.onProgress({
      phase: 'complete',
      current: 100,
      total: 100,
      percent: 100
    })

    return {
      markdown,
      warnings: [],
      stats: {}
    }
  }
}
