import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'
import { decodeText } from '../core/encoding'

export const textConverter: Converter = {
  kind: 'text',
  async convert(input) {
    const decoded = decodeText(input.bytes)
    return {
      markdown: normalizeMarkdown(decoded.text),
      warnings: decoded.warnings,
      stats: {}
    }
  }
}
