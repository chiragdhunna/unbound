import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'
import { decodeText } from '../core/encoding'

function detectLanguage(name: string): string {
  const ext = name.includes('.') ? name.split('.').at(-1) ?? '' : ''
  return ext.toLowerCase()
}

export const codeConverter: Converter = {
  kind: 'code',
  async convert(input) {
    const decoded = decodeText(input.bytes)
    const raw = decoded.text
    const language = detectLanguage(input.name)
    const longestBacktickRun = Math.max(...(raw.match(/`+/g) ?? ['']).map((run) => run.length))
    const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))

    return {
      markdown: normalizeMarkdown(`${fence}${language}\n${raw}\n${fence}`),
      warnings: decoded.warnings,
      stats: {}
    }
  }
}
