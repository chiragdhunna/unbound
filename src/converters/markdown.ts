import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'

export const markdownConverter: Converter = {
  kind: 'markdown',
  async convert(input) {
    const raw = new TextDecoder('utf-8').decode(input.bytes)

    return {
      markdown: normalizeMarkdown(raw),
      warnings: [],
      stats: {}
    }
  }
}
