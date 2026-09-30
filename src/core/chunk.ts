export interface ChunkOptions {
  maxChars?: number
  label?: boolean
}

export interface ChunkResult {
  chunks: string[]
  warnings: string[]
}

function isFence(line: string): boolean {
  return /^\s*(`{3,}|~{3,})/.test(line)
}

function isTable(lines: string[]): boolean {
  return lines.length >= 2 && /^\s*\|/.test(lines[0] ?? '') && /^\s*\|?\s*:?-{3,}/.test(lines[1] ?? '')
}

function splitUnits(input: string): string[] {
  const lines = input.split('\n')
  const units: string[] = []
  let current: string[] = []
  let insideFence = false

  for (const [index, line] of lines.entries()) {
    current.push(line)
    if (isFence(line)) insideFence = !insideFence
    if (!insideFence && line === '') {
      units.push(`${current.join('\n')}${index < lines.length - 1 ? '\n' : ''}`)
      current = []
    }
  }

  if (current.length) units.push(current.join('\n'))
  return units.length ? units : ['']
}

function splitTable(unit: string, maxChars: number): { chunks: string[]; warnings: string[] } {
  const trailingNewline = unit.endsWith('\n') ? '\n' : ''
  const lines = unit.replace(/\n$/, '').split('\n')
  const header = lines.slice(0, 2).join('\n')
  const rows = lines.slice(2)
  const chunks: string[] = []
  const warnings: string[] = []
  let current = header

  for (const row of rows) {
    const candidate = `${current}\n${row}`
    if (candidate.length <= maxChars || current === header && !chunks.length) {
      current = candidate
      continue
    }
    chunks.push(current)
    current = `${header}\n${row}`
  }

  if (current) chunks.push(`${current}${trailingNewline}`)
  for (const chunk of chunks) {
    if (chunk.length > maxChars) warnings.push('A table row or header is larger than the configured chunk limit.')
  }
  return { chunks, warnings }
}

function splitOversizeUnit(unit: string, maxChars: number): { chunks: string[]; warnings: string[] } {
  if (unit.length <= maxChars) return { chunks: [unit], warnings: [] }
  const lines = unit.split('\n')
  const fenced = lines.some(isFence)
  if (fenced) return { chunks: [unit], warnings: ['A code fence is larger than the configured chunk limit and was kept intact.'] }

  const chunks: string[] = []
  for (let offset = 0; offset < unit.length; offset += maxChars) chunks.push(unit.slice(offset, offset + maxChars))
  return { chunks, warnings: [] }
}

export function chunkMarkdownWithWarnings(input: string, options: ChunkOptions = {}): ChunkResult {
  const { maxChars = 12000, label = false } = options
  const normalized = input.replace(/\r\n/g, '\n')
  if (normalized.length <= maxChars) return { chunks: [label ? normalized : normalized], warnings: [] }

  const chunks: string[] = []
  const warnings: string[] = []
  let current = ''

  for (const unit of splitUnits(normalized)) {
    const lines = unit.replace(/\n$/, '').split('\n')
    const pieces = isTable(lines) ? splitTable(unit, maxChars) : splitOversizeUnit(unit, maxChars)
    warnings.push(...pieces.warnings)
    for (const piece of pieces.chunks) {
      if (piece.length > maxChars || piece.includes('\n\n') && current.length + piece.length > maxChars) {
        if (current) chunks.push(current)
        current = piece
      } else if (!current) {
        current = piece
      } else if (current.length + piece.length <= maxChars) {
        current += piece
      } else {
        chunks.push(current)
        current = piece
      }
    }
  }
  if (current) chunks.push(current)

  if (!label) return { chunks, warnings }
  return {
    chunks: chunks.map((chunk, index) => `[Part ${index + 1} of ${chunks.length}]\n\n${chunk}`),
    warnings
  }
}

export function chunkMarkdown(input: string, options: ChunkOptions = {}): string[] {
  return chunkMarkdownWithWarnings(input, options).chunks
}

export function joinChunks(chunks: string[]): string {
  return chunks.join('')
}
