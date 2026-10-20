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

    // Determine delimiter: MIME type first, then content sniffing
    let delimiter: string
    if (input.mime === 'text/tab-separated-values') {
      delimiter = '\t'
    } else if (input.mime === 'text/csv') {
      delimiter = ','
    } else {
      const firstLineEnd = text.indexOf('\n')
      const firstLine =
        firstLineEnd === -1 ? text : text.substring(0, firstLineEnd)
      const tabCount = (firstLine.match(/\t/g) || []).length
      const commaCount = (firstLine.match(/,/g) || []).length
      delimiter = tabCount > commaCount ? '\t' : ','
    }

    ctx.signal.throwIfAborted()

    // Parse CSV/TSV content (RFC4180 style, plus backslash-escaped quotes)
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentField = ''
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
        } else if (char === delimiter) {
          // End field
          currentRow.push(currentField)
          currentField = ''
        } else if (char === '\n' || char === '\r') {
          // End row (handle \r\n)
          if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
            i++ // Skip \n in \r\n
          }
          currentRow.push(currentField)
          rows.push(currentRow)
          currentRow = []
          currentField = ''
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
      rows.push(currentRow)
    }

    ctx.signal.throwIfAborted()

    // Check if we have any rows at all
    if (rows.length === 0) {
      throw new NoTextFoundError('No text found in the CSV/TSV file.')
    }

    const headerRow = rows[0]
    if (!headerRow) {
      throw new NoTextFoundError('No text found in the CSV/TSV file.')
    }

    // Pad data rows to equal length
    const paddedDataRows = padRowsToEqualLength(rows.slice(1))

    ctx.signal.throwIfAborted()

    // Trim blank trailing rows/columns BEFORE header processing, so content
    // that is entirely empty is reported as "no text found"
    const trimmedRows = trimBlankRowsAndColumns([headerRow, ...paddedDataRows])

    // If all rows were trimmed away, we have no meaningful content
    if (trimmedRows.length === 0) {
      throw new NoTextFoundError('No text found in the CSV/TSV file.')
    }

    ctx.signal.throwIfAborted()

    // Process header row (empty cells become Column N) and escape all cells
    const processedHeader = processHeaderRow(trimmedRows[0] ?? []).map((cell) =>
      escapeCellValue(cell)
    )
    const escapedDataRows = trimmedRows
      .slice(1)
      .map((row) => row.map((cell) => escapeCellValue(cell)))

    ctx.signal.throwIfAborted()

    // Build markdown table
    const markdownTable = buildMarkdownTable([
      processedHeader,
      ...escapedDataRows
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
