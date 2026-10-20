import {
  escapeCellValue,
  processHeaderRow,
  padRowsToEqualLength,
  trimBlankRowsAndColumns,
  buildMarkdownTable
} from '../core/table'
import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'
import { decodeText } from '../core/encoding'
import { CorruptFileError, NoTextFoundError } from '../core/errors'

/**
 * Escapes a cell that was quoted in the source CSV. Pipes become `\|` and
 * newlines become `<br>`, but whitespace is preserved exactly as written.
 */
function escapeQuotedCell(value: string): string {
  return value.replace(/\r\n?|\n/g, '<br>').replace(/\|/g, '\\|')
}

/**
 * Picks the field delimiter: `.tsv` filename or TSV MIME type force tabs,
 * otherwise the first line is sniffed for tabs, semicolons, or commas.
 */
function detectDelimiter(name: string, mime: string, text: string): string {
  if (
    name.toLowerCase().endsWith('.tsv') ||
    mime === 'text/tab-separated-values'
  ) {
    return '\t'
  }

  const firstLineEnd = text.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? text : text.substring(0, firstLineEnd)
  const tabCount = (firstLine.match(/\t/g) || []).length
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length

  if (tabCount > commaCount && tabCount > semicolonCount) {
    return '\t'
  }
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    return ';'
  }
  return ','
}

/**
 * Converts CSV/TSV content to a markdown table.
 * Handles quoted fields, escaped quotes, newlines within quotes, and delimiter detection.
 */
export const csvConverter: Converter = {
  kind: 'csv',
  async convert(input, ctx) {
    ctx.signal.throwIfAborted()

    // Detect encoding and convert to UTF-8 string
    const { text, warnings } = decodeText(input.bytes)

    // Handle empty content
    if (!text || text.length === 0) {
      throw new CorruptFileError('This CSV/TSV file is empty.')
    }

    ctx.signal.throwIfAborted()

    const delimiter = detectDelimiter(input.name, input.mime, text)

    ctx.signal.throwIfAborted()

    // Parse CSV/TSV content (RFC4180 style, plus backslash-escaped quotes),
    // tracking which fields were quoted so their text can be preserved exactly
    const rows: string[][] = []
    const quotedFlags: boolean[][] = []
    let currentRow: string[] = []
    let currentRowQuoted: boolean[] = []
    let currentField = ''
    let currentFieldQuoted = false
    let inQuotes = false
    let i = 0

    while (i < text.length) {
      const char = text[i]

      if (inQuotes) {
        if (char === '"' && i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote ("" -> ")
          currentField += '"'
          i += 2 // Skip both quotes
          continue
        } else if (char === '"') {
          // End quote
          inQuotes = false
        } else if (
          char === '\\' &&
          i + 1 < text.length &&
          text[i + 1] === '"'
        ) {
          // Backslash-escaped quote (\" -> ")
          currentField += '"'
          i += 2 // Skip both backslash and quote
          continue
        } else {
          // Regular character inside quotes
          currentField += char
        }
      } else {
        if (char === '"') {
          // Start quote
          inQuotes = true
          if (currentField.length === 0) {
            currentFieldQuoted = true
          }
        } else if (char === delimiter) {
          // End field
          currentRow.push(currentField)
          currentRowQuoted.push(currentFieldQuoted)
          currentField = ''
          currentFieldQuoted = false
        } else if (char === '\n' || char === '\r') {
          // End row (handle \r\n)
          if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
            i++ // Skip \n in \r\n
          }
          currentRow.push(currentField)
          currentRowQuoted.push(currentFieldQuoted)
          rows.push(currentRow)
          quotedFlags.push(currentRowQuoted)
          currentRow = []
          currentRowQuoted = []
          currentField = ''
          currentFieldQuoted = false
        } else {
          // Regular character
          currentField += char
        }
      }

      i++
    }

    // Handle last field and row if no trailing newline
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField)
      currentRowQuoted.push(currentFieldQuoted)
      rows.push(currentRow)
      quotedFlags.push(currentRowQuoted)
    }

    ctx.signal.throwIfAborted()

    // Check if we have any rows at all
    if (rows.length === 0) {
      throw new NoTextFoundError('No text found in the CSV/TSV file.')
    }

    // Escape every cell: quoted cells keep their exact text (only pipes and
    // newlines are escaped for markdown), unquoted cells are trimmed as before
    const escapedRows = rows.map((row, rowIndex) =>
      row.map((cell, colIndex) => {
        const quoted = (quotedFlags[rowIndex] ?? [])[colIndex] ?? false
        return quoted ? escapeQuotedCell(cell) : escapeCellValue(cell)
      })
    )

    ctx.signal.throwIfAborted()

    // Pad rows to equal length
    const paddedRows = padRowsToEqualLength(escapedRows)

    // Trim blank trailing rows/columns so content that is entirely empty
    // is reported as "no text found"
    const trimmedRows = trimBlankRowsAndColumns(paddedRows)

    // If all rows were trimmed away, we have no meaningful content
    if (trimmedRows.length === 0) {
      throw new NoTextFoundError('No text found in the CSV/TSV file.')
    }

    ctx.signal.throwIfAborted()

    // Process header row (empty cells become Column N)
    const processedHeader = processHeaderRow(trimmedRows[0] ?? [])

    // Build markdown table
    const markdownTable = buildMarkdownTable([
      processedHeader,
      ...trimmedRows.slice(1)
    ])

    ctx.onProgress({ phase: 'csv', current: 1, total: 1 })

    // Normalize markdown (remove excessive whitespace, ensure proper formatting)
    const normalizedMarkdown = normalizeMarkdown(markdownTable)

    return {
      markdown: normalizedMarkdown,
      warnings,
      stats: {}
    }
  }
}
