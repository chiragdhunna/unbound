import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'

export const xmlConverter: Converter = {
  kind: 'xml',
  async convert(input) {
    const raw = new TextDecoder('utf-8').decode(input.bytes)

    return {
      markdown: normalizeMarkdown(`\`\`\`xml\n${raw}\n\`\`\``),
      warnings: [],
      stats: {}
    }
  }
}
