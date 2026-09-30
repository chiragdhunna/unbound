import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'

function detectLanguage(name: string): string {
  const ext = name.includes('.') ? name.split('.').at(-1) ?? '' : ''
  return ext.toLowerCase()
}

export const codeConverter: Converter = {
  kind: 'code',
  async convert(input) {
    const raw = new TextDecoder('utf-8').decode(input.bytes)
    const language = detectLanguage(input.name)

    return {
      markdown: normalizeMarkdown(`\`\`\`${language}\n${raw}\n\`\`\``),
      warnings: [],
      stats: {}
    }
  }
}
