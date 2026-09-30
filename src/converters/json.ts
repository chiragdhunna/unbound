import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'

function fencedCodeBlock(content: string, language: string): string {
  const longestBacktickRun = Math.max(...(content.match(/`+/g) ?? ['']).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))
  return `${fence}${language}\n${content}\n${fence}`
}

export const jsonConverter: Converter = {
  kind: 'json',
  async convert(input) {
    const raw = new TextDecoder('utf-8').decode(input.bytes)

    try {
      const parsed = JSON.parse(raw)
      return {
        markdown: normalizeMarkdown(fencedCodeBlock(JSON.stringify(parsed, null, 2), 'json')),
        warnings: [],
        stats: {}
      }
    } catch {
      return {
        markdown: normalizeMarkdown(fencedCodeBlock(raw, 'json')),
        warnings: [
          {
            code: 'INVALID_JSON',
            message: 'JSON is not valid. Preserving raw content in a fenced block.',
            severity: 'warn'
          }
        ],
        stats: {}
      }
    }
  }
}
