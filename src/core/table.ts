/**
 * Escapes pipe characters and converts newlines to <br> for markdown table cells.
 * Also trims whitespace.
 */
export function escapeCellValue(value: string): string {
  // Find the length of trailing whitespace (spaces and tabs only)
  let trailingWhitespaceLen = 0;
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] === ' ' || value[i] === '\t') {
      trailingWhitespaceLen++;
    } else {
      break;
    }
  }

  // Check if there is a trailing newline (right before the trailing whitespace)
  const hasTrailingNewline = trailingWhitespaceLen < value.length &&
                            value[value.length - trailingWhitespaceLen - 1] === '\n';

  let workStr = value;
  let hasTrailingNewlineToKeep = false;

  if (hasTrailingNewline) {
    // The index of the trailing newline
    const trailingNewlineIndex = value.length - trailingWhitespaceLen - 1;

    // Check what precedes this newline
    const charBefore = value[trailingNewlineIndex - 1];
    const isWhitespaceBefore = charBefore === ' ' || charBefore === '\t';

    if (isWhitespaceBefore) {
      // We want to keep this newline as <br
      hasTrailingNewlineToKeep = true;
      // Process the string up to (but not including) this newline
      workStr = value.substring(0, trailingNewlineIndex);
    } else {
      // We want to discard this newline
      hasTrailingNewlineToKeep = false;
      // Process the string up to (but not including) this newline
      workStr = value.substring(0, trailingNewlineIndex);
    }
  }

  // TRIM LEADING WHITESPACE AND NEWLINES FROM WORKSTR
  let start = 0;
  while (start < workStr.length && (workStr[start] === ' ' || workStr[start] === '\t' || workStr[start] === '\n')) {
    start++;
  }

  // TRIM TRAILING WHITESPACE (SPACES AND TABS ONLY) FROM WORKSTR
  let end = workStr.length;
  while (end > start && (workStr[end - 1] === ' ' || workStr[end - 1] === '\t')) {
    end--;
  }

  // Extract the middle part
  workStr = workStr.substring(start, end);

  // Escape pipes and convert newlines in the workStr
  let result = workStr
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>');

  // If we decided to keep the trailing newline, add <br> at the end
  if (hasTrailingNewlineToKeep) {
    result += '<br>';
  }

  // TRIM LEADING WHITESPACE FROM FINAL RESULT (in case we added <br> at the front)
  result = result.trimStart();

  return result;
}

/**
 * Processes a header row: empty cells become "Column N" (1-indexed).
 */
export function processHeaderRow(headerRow: string[]): string[] {
  return headerRow.map((cell, index) =>
    cell.trim() === '' ? `Column ${index + 1}` : cell
  )
}

/**
 * Pads all rows to have the same number of columns (the maximum width).
 */
export function padRowsToEqualLength(rows: string[][]): string[][] {
  if (rows.length === 0) return rows

  const maxCols = Math.max(...rows.map(row => row.length))
  return rows.map(row => {
    const padded = [...row]
    while (padded.length < maxCols) {
      padded.push('')
    }
    return padded
  })
}

/**
 * Finds the index of the first non-empty row (where at least one cell is non-blank).
 * Returns -1 if all rows are empty.
 */
export function findFirstNonEmptyRowIndex(rows: string[][]): number {
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    if (!rows[rowIdx]!.every(cell => cell.trim() === '')) {
      return rowIdx
    }
  }
  return -1
}

/**
 * Trims blank trailing rows and columns from the data.
 * A row/column is considered blank if all its cells are empty strings.
 */
export function trimBlankRowsAndColumns(rows: string[][]): string[][] {
  if (rows.length === 0) return rows

  // Find the last row that is not completely empty
  let lastNonEmptyRow = rows.length - 1
  while (lastNonEmptyRow >= 0) {
    const rowIsEmpty = rows[lastNonEmptyRow]!.every(cell => cell.trim() === '')
    if (!rowIsEmpty) break
    lastNonEmptyRow--
  }

  // If all rows are empty, return empty array
  if (lastNonEmptyRow < 0) return []

  // Slice to keep only rows up to the last non-empty row
  const trimmedRows = rows.slice(0, lastNonEmptyRow + 1)

  // If no rows remain (shouldn't happen due to above check, but safe)
  if (trimmedRows.length === 0) return []

  // First, determine the maximum number of columns in any row
  let maxCols = 0
  for (const row of trimmedRows) {
    maxCols = Math.max(maxCols, row.length)
  }

  // If there are no columns at all, return rows with empty cells
  if (maxCols === 0) {
    return trimmedRows.map(() => [''])
  }

  // Find the first non-empty column
  let firstNonEmptyCol = 0
  while (firstNonEmptyCol < maxCols) {
    let columnIsEmpty = true
    for (const row of trimmedRows) {
      const cellValue = row[firstNonEmptyCol]
      if (cellValue !== undefined && cellValue.trim() !== '') {
        columnIsEmpty = false
        break
      }
    }
    if (!columnIsEmpty) break
    firstNonEmptyCol++
  }

  // If all columns are empty, return rows with empty cells
  if (firstNonEmptyCol >= maxCols) {
    return trimmedRows.map(() => [''])
  }

  // Find the last non-empty column
  let lastNonEmptyCol = maxCols - 1
  while (lastNonEmptyCol >= 0) {
    let columnIsEmpty = true
    for (const row of trimmedRows) {
      const cellValue = row[lastNonEmptyCol]
      if (cellValue !== undefined && cellValue.trim() !== '') {
        columnIsEmpty = false
        break
      }
    }
    if (!columnIsEmpty) break
    lastNonEmptyCol--
  }

  // If all columns are empty (shouldn't happen due to firstNonEmptyCol check, but safe)
  if (lastNonEmptyCol < 0) {
    return trimmedRows.map(() => [''])
  }

  // Slice to keep only columns from firstNonEmptyCol to lastNonEmptyCol (inclusive)
  return trimmedRows.map(row => row.slice(firstNonEmptyCol, lastNonEmptyCol + 1))
}

/**
 * Builds a markdown table from the given data.
 * Assumes the first row is the header.
 */
export function buildMarkdownTable(data: string[][]): string {
  if (data.length === 0) return ''

  // At this point, data has at least one row
  // Handle case where first row might be undefined (though unlikely with length > 0)
  const headerRow = data[0] ?? []
  const processedHeader = processHeaderRow(headerRow)
  const dataRows = data.slice(1)

  // Build table
  const lines: string[] = []
  lines.push(`| ${processedHeader.join(' | ')} |`)
  lines.push(`| ${processedHeader.map(() => '---').join(' | ')} |`)

  for (const row of dataRows) {
    // Handle case where row might be undefined
    const safeRow = row ?? []
    lines.push(`| ${safeRow.join(' | ')} |`)
  }

  return lines.join('\n')
}