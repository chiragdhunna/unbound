import { type Converter } from '../core/types'
import { normalizeMarkdown } from '../core/markdown'
import {
  escapeCellValue,
  padRowsToEqualLength,
  trimBlankRowsAndColumns,
  findFirstNonEmptyRowIndex,
  buildMarkdownTable
} from '../core/table'
import { PasswordRequiredError, CorruptFileError, NoTextFoundError } from '../core/errors'

function hasOle2Signature(bytes: ArrayBuffer): boolean {
  const view = new Uint8Array(bytes.slice(0, 8))
  return (
    view.length >= 4 &&
    view[0] === 0xd0 &&
    view[1] === 0xcf &&
    view[2] === 0x11 &&
    view[3] === 0xe0
  )
}

export const xlsxConverter: Converter = {
  kind: 'xlsx',
  async convert(input, ctx) {
    // Check for empty input
    if (input.bytes.byteLength === 0) {
      throw new CorruptFileError('This spreadsheet could not be read; it may be corrupted.')
    }

    if (input.name.toLowerCase().endsWith('.xlsx') && hasOle2Signature(input.bytes)) {
      throw new PasswordRequiredError(
        'This XLSX is password protected or saved with an Office encryption wrapper. Save it without a password and try again.'
      )
    }

    let XLSX
    try {
      // Lazy-load SheetJS
      const XLSXModule = await import('xlsx')
      XLSX = XLSXModule.default
    } catch (_err) {
      void _err; // Mark as intentionally used
      throw new CorruptFileError('This spreadsheet could not be read; it may be corrupted.')
    }

    try {
      // Report progress: starting conversion
      ctx.onProgress({ phase: 'xlsx', current: 0, total: 1 })

      // Read workbook with cached values, no formula evaluation
      const workbook = XLSX.read(input.bytes, {
        type: 'array',
        cellDates: true,
        cellFormula: false
      })

      const markdownParts: string[] = []
      const warnings: { code: string; message: string; severity: 'info' | 'warn' }[] = []
      let hasAnyData = false

      // Process each sheet in workbook order
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]

        // Check if sheet is hidden
        const isHidden = workbook.Workbook?.Sheets?.[workbook.SheetNames.indexOf(sheetName)]?.Hidden

        // Check if sheet is completely empty (all cells blank after trimming)
        if (!worksheet || Object.keys(worksheet).length === 0) {
          warnings.push({
            code: 'EMPTY_SHEET',
            message: `Sheet '${sheetName}' is empty and was skipped.`,
            severity: 'warn'
          })
          continue
        }

        // Get the range of the worksheet
        const range = worksheet['!ref']
        if (!range) {
          // No data in sheet
          warnings.push({
            code: 'EMPTY_SHEET',
            message: `Sheet '${sheetName}' is empty and was skipped.`,
            severity: 'warn'
          })
          continue
        }

        // Decode the range to get dimensions
        const { s: start, e: end } = XLSX.utils.decode_range(range)

        // Extract all cell values
        const rows: string[][] = []
        for (let rowNum = start.r; rowNum <= end.r; rowNum++) {
          const row: string[] = []
          for (let colNum = start.c; colNum <= end.c; colNum++) {
            const address = { c: colNum, r: rowNum }
            const cellRef = XLSX.utils.encode_cell(address)
            const cell = worksheet[cellRef]

            let cellValue = ''
            if (cell) {
              if (cell.t === 'd') { // Date cell
                // Format as ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm if time part
                const date = cell.v as Date
                const isoString = date.toISOString()
                if (isoString.endsWith('T00:00:00.000Z')) {
                  const datePart = isoString.split('T')[0]
                  cellValue = datePart !== undefined ? datePart : ''
                } else {
                  cellValue = isoString.replace('Z', '') // Keep time part, remove Z
                }
              } else if (cell.w !== undefined) { // Formatted text available
                cellValue = cell.w
              } else {
                cellValue = String(cell.v)
              }
            }

            // Escape pipe characters and handle newlines
            cellValue = escapeCellValue(cellValue)
            row.push(cellValue)
          }
          rows.push(row)
        }

        // Check if sheet is completely empty (all cells blank after trimming)
        const isEmptySheet = rows.every(row => row.every(cell => cell.trim() === ''))
        if (isEmptySheet) {
          warnings.push({
            code: 'EMPTY_SHEET',
            message: `Sheet '${sheetName}' is empty and was skipped.`,
            severity: 'warn'
          })
          continue
        }

        hasAnyData = true

        // Add sheet header
        const sheetHeader = `## Sheet: ${sheetName}${isHidden ? ' (hidden)' : ''}`
        markdownParts.push(sheetHeader)
        markdownParts.push('') // blank line

        // Process merged cells
        const merges = worksheet['!merges'] || []

        // Create a 2D array to track which cells have values from merges
        const valueMap: Map<string, string> = new Map()

        // Process merges - only top-left cell keeps value
        for (const merge of merges) {
          const { s: start, e: end } = merge
          const topLeftRef = XLSX.utils.encode_cell({ c: start.c, r: start.r })
          const topLeftCell = worksheet[topLeftRef]

          let mergeValue = ''
          if (topLeftCell) {
            if (topLeftCell.t === 'd') { // Date cell
              const date = topLeftCell.v as Date
              const isoString = date.toISOString()
              if (isoString.endsWith('T00:00:00.000Z')) {
                const datePart = isoString.split('T')[0]
                mergeValue = datePart !== undefined ? datePart : ''
              } else {
                mergeValue = isoString.replace('Z', '')
              }
            } else if (topLeftCell.w !== undefined) {
              mergeValue = topLeftCell.w
            } else {
              mergeValue = String(topLeftCell.v)
            }
            mergeValue = escapeCellValue(mergeValue)
          }

          // Set value for top-left cell
          valueMap.set(topLeftRef, mergeValue)

          // Clear other cells in the merge range
          for (let rowNum = start.r; rowNum <= end.r; rowNum++) {
            for (let colNum = start.c; colNum <= end.c; colNum++) {
              if (rowNum === start.r && colNum === start.c) continue // Skip top-left
              const address = { c: colNum, r: rowNum }
              const cellRef = XLSX.utils.encode_cell(address)
              valueMap.set(cellRef, '') // Empty cell
            }
          }
        }

        // Build table data with proper values from merges
        const tableData: string[][] = []
        for (let rowNum = start.r; rowNum <= end.r; rowNum++) {
          const row: string[] = []
          for (let colNum = start.c; colNum <= end.c; colNum++) {
            const address = { c: colNum, r: rowNum }
            const cellRef = XLSX.utils.encode_cell(address)
            const valueMapValue = valueMap.get(cellRef)

            if (valueMapValue !== undefined) {
              row.push(valueMapValue)
            } else {
              // Get original cell value
              const cell = worksheet[cellRef]
              let cellValue = ''
              if (cell) {
                if (cell.t === 'd') { // Date cell
                  const date = cell.v as Date
                  const isoString = date.toISOString()
                  if (isoString.endsWith('T00:00:00.000Z')) {
                    const datePart = isoString.split('T')[0]
                    cellValue = datePart !== undefined ? datePart : ''
                  } else {
                    cellValue = isoString.replace('Z', '')
                  }
                } else if (cell.w !== undefined) {
                  cellValue = cell.w
                } else {
                  cellValue = String(cell.v)
                }
                cellValue = escapeCellValue(cellValue)
              }
              row.push(cellValue)
            }
          }
          tableData.push(row)
        }

        // Find first non-empty row to use as header
        const headerRowIndex = findFirstNonEmptyRowIndex(tableData)

        if (headerRowIndex === -1) {
          // All rows are empty (shouldn't happen due to earlier check, but safety)
          warnings.push({
            code: 'EMPTY_SHEET',
            message: `Sheet '${sheetName}' is empty and was skipped.`,
            severity: 'warn'
          })
          continue
        }

        // Trim blank trailing rows and columns
        const trimmedData = trimBlankRowsAndColumns(tableData)

        // Pad rows to have same number of columns
        const paddedData = padRowsToEqualLength(trimmedData)

        // Extract header (first non-empty row after trimming)
        // Need to adjust headerRowIndex based on trimming
        const dataWithoutEmptyRows = tableData.slice(0, headerRowIndex)
        const emptyRowsCountAtTop = dataWithoutEmptyRows.filter(row =>
          row.every(cell => cell.trim() === '')).length
        const adjustedHeaderIndex = headerRowIndex - emptyRowsCountAtTop

        const headerRow = paddedData[adjustedHeaderIndex]!
        const dataRows = paddedData.slice(adjustedHeaderIndex + 1)

        // Build table using shared function
        const tableMarkdown = buildMarkdownTable([headerRow, ...dataRows])
        markdownParts.push(tableMarkdown)
        markdownParts.push('') // blank line after table
      }

      // Add warning for merged cells if any were found
      let hasMergesInWorkbook = false
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (worksheet && worksheet['!merges'] && worksheet['!merges'].length > 0) {
          hasMergesInWorkbook = true
          break
        }
      }

      if (hasMergesInWorkbook) {
        warnings.push({
          code: 'MERGED_CELLS',
          message: 'Merged cells were found; values appear only in the top-left cell.',
          severity: 'warn'
        })
      }

      // If no data found in any sheet, throw NoTextFoundError
      if (!hasAnyData) {
        throw new NoTextFoundError('No text found in the spreadsheet.')
      }

      // Report progress: conversion complete
      ctx.onProgress({ phase: 'xlsx', current: 1, total: 1 })

      // Join all parts and normalize markdown
      const markdown = normalizeMarkdown(markdownParts.join('\n'))

      return {
        markdown: markdown || '# Spreadsheet\n\nNo readable text was found in this spreadsheet.',
        warnings,
        stats: { sheets: workbook.SheetNames.length }
      }
    } catch (err) {
      if (err instanceof PasswordRequiredError || err instanceof NoTextFoundError || err instanceof CorruptFileError) {
        throw err
      }

      // Check if it's a password/encryption error
      if ((err as Error).message && (/password|encrypt/i.test((err as Error).message))) {
        throw new PasswordRequiredError('This spreadsheet is password protected. Save it without a password and try again.')
      }

      throw new CorruptFileError('This spreadsheet could not be read; it may be corrupted.')
    }
  }
}