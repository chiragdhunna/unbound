import { marked } from 'marked'

function flattenText(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node]
  }

  if (!node || typeof node !== 'object') {
    return []
  }

  if (Array.isArray(node)) {
    return node.flatMap((item) => flattenText(item))
  }

  const record = node as Record<string, unknown>

  if (record.type === 'link') {
    const label = Array.isArray(record.tokens) ? record.tokens.flatMap((item) => flattenText(item)).join('') : ''
    const href = typeof record.href === 'string' ? record.href : ''
    return [href ? `${label} (${href})` : label]
  }

  if (Array.isArray(record.tokens)) {
    return record.tokens.flatMap((item) => flattenText(item))
  }

  if (Array.isArray(record.items)) {
    return record.items.flatMap((item) => flattenText(item))
  }

  if (Array.isArray(record.cells)) {
    return record.cells.flatMap((item) => flattenText(item))
  }

  if (Array.isArray(record.header)) {
    return record.header.flatMap((item) => flattenText(item))
  }

  if (typeof record.text === 'string') {
    return [record.text]
  }

  if (typeof record.raw === 'string') {
    return [record.raw]
  }

  return []
}

export function markdownToPlain(input: string): string {
  if (!input.trim()) {
    return ''
  }

  const tokens = marked.lexer(input) as unknown[]
  const parts: string[] = []

  for (const token of tokens) {
    const record = token as Record<string, unknown>

    if (!record || typeof record !== 'object') {
      continue
    }

    switch (record.type) {
      case 'heading': {
        const text = flattenText(record).join(' ').replace(/\s+/g, ' ').trim()
        if (text) parts.push(text)
        break
      }
      case 'paragraph': {
        const text = flattenText(record).join(' ').replace(/\s+/g, ' ').trim()
        if (text) parts.push(text)
        break
      }
      case 'list': {
        const items = Array.isArray(record.items) ? record.items : []
        for (const item of items) {
          const text = flattenText(item).join(' ').replace(/\s+/g, ' ').trim()
          if (text) parts.push(`- ${text}`)
        }
        break
      }
      case 'table': {
        const header = Array.isArray(record.header) ? [record.header] : []
        const rows = Array.isArray(record.rows) ? record.rows : []
        for (const row of [...header, ...rows]) {
          const cells = Array.isArray(row) ? row : []
          const text = cells
            .map((cell) => flattenText(cell).join(' ').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\t')
          if (text) parts.push(text)
        }
        break
      }
      case 'code': {
        const text = flattenText(record).join('\n').trim()
        if (text) parts.push(text)
        break
      }
      default: {
        const fallback = flattenText(record).join(' ').replace(/\s+/g, ' ').trim()
        if (fallback) parts.push(fallback)
      }
    }
  }

  return parts.join('\n\n').trim()
}
