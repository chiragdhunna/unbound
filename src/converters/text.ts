import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'

function decode(bytes: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(bytes)
}

export const textConverter: Converter = {
  kind: 'text',
  async convert(input) {
    return {
      markdown: normalizeMarkdown(decode(input.bytes)),
      warnings: [],
      stats: {}
    }
  }
}
