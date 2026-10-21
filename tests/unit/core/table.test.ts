import {
  escapeCellValue,
  processHeaderRow,
  padRowsToEqualLength,
  findFirstNonEmptyRowIndex,
  trimBlankRowsAndColumns,
  buildMarkdownTable
} from '../../../src/core/table'

describe('table utilities', () => {
  describe('escapeCellValue', () => {
    it('should escape pipe characters', () => {
      expect(escapeCellValue('hello|world')).toBe('hello\\|world')
    })

    it('should escape multiple pipe characters', () => {
      expect(escapeCellValue('a|b|c|d')).toBe('a\\|b\\|c\\|d')
    })

    it('should convert newlines to <br>', () => {
      expect(escapeCellValue('hello\nworld')).toBe('hello<br>world')
    })

    it('should handle multiple newlines', () => {
      expect(escapeCellValue('a\nb\nc\n')).toBe('a<br>b<br>c')
    })

    it('should trim whitespace', () => {
      expect(escapeCellValue('  hello  ')).toBe('hello')
      expect(escapeCellValue('  \n  hello  \n  ')).toBe('hello<br>')
    })

    it('should handle empty string', () => {
      expect(escapeCellValue('')).toBe('')
    })
  })

  describe('processHeaderRow', () => {
    it('should convert empty header cells to Column N', () => {
      expect(processHeaderRow(['', 'Name', ''])).toEqual(['Column 1', 'Name', 'Column 3'])
    })

    it('should preserve non-empty header cells', () => {
      expect(processHeaderRow(['ID', 'Name', 'Age'])).toEqual(['ID', 'Name', 'Age'])
    })

    it('should handle mixed empty and non-empty cells', () => {
      expect(processHeaderRow(['', '', 'Data', '', ''])).toEqual(['Column 1', 'Column 2', 'Data', 'Column 4', 'Column 5'])
    })

    it('should handle whitespace-only cells as empty', () => {
      expect(processHeaderRow([' ', '  \t  ', 'Name'])).toEqual(['Column 1', 'Column 2', 'Name'])
    })
  })

  describe('padRowsToEqualLength', () => {
    it('should pad shorter rows with empty strings', () => {
      expect(padRowsToEqualLength([['a', 'b'], ['x', 'y', 'z']])).toEqual([
        ['a', 'b', ''],
        ['x', 'y', 'z']
      ])
    })

    it('should not modify rows that are already equal length', () => {
      expect(padRowsToEqualLength([['a', 'b'], ['x', 'y']])).toEqual([
        ['a', 'b'],
        ['x', 'y']
      ])
    })

    it('should handle empty input', () => {
      expect(padRowsToEqualLength([])).toEqual([])
    })

    it('should handle rows of varying lengths', () => {
      expect(padRowsToEqualLength([['a'], ['b', 'c'], ['d', 'e', 'f']])).toEqual([
        ['a', '', ''],
        ['b', 'c', ''],
        ['d', 'e', 'f']
      ])
    })
  })

  describe('findFirstNonEmptyRowIndex', () => {
    it('should find the first row with non-empty cells', () => {
      expect(findFirstNonEmptyRowIndex([['', ''], ['', 'data'], ['more', '']])).toBe(1)
    })

    it('should return -1 when all rows are empty', () => {
      expect(findFirstNonEmptyRowIndex([['', ''], ['', '']])).toBe(-1)
    })

    it('should handle whitespace-only cells as empty', () => {
      expect(findFirstNonEmptyRowIndex([['   ', '\t\t'], ['', 'data']])).toBe(1)
    })

    it('should return 0 when first row has data', () => {
      expect(findFirstNonEmptyRowIndex([['data', ''], ['', '']])).toBe(0)
    })
  })

  describe('trimBlankRowsAndColumns', () => {
    it('should trim blank trailing rows and columns', () => {
      expect(trimBlankRowsAndColumns([
        ['a', 'b', ''],
        ['c', 'd', ''],
        ['', '', '']
      ])).toEqual([
        ['a', 'b'],
        ['c', 'd']
      ])
    })

    it('should handle all blank rows', () => {
      expect(trimBlankRowsAndColumns([
        ['', ''],
        ['', '']
      ])).toEqual([])
    })

    it('should preserve non-blank data', () => {
      expect(trimBlankRowsAndColumns([
        ['a', 'b'],
        ['c', 'd']
      ])).toEqual([
        ['a', 'b'],
        ['c', 'd']
      ])
    })

    it('should handle mixed blank and non-blank columns', () => {
      expect(trimBlankRowsAndColumns([
        ['', 'a', ''],
        ['', 'b', ''],
        ['', 'c', '']
      ])).toEqual([
        ['a'],
        ['b'],
        ['c']
      ])
    })
  })

  describe('buildMarkdownTable', () => {
    it('should build a markdown table from data', () => {
      const data = [
        ['Name', 'Age'],
        ['Alice', '25'],
        ['Bob', '30']
      ]
      expect(buildMarkdownTable(data)).toBe(
        '| Name | Age |\n| --- | --- |\n| Alice | 25 |\n| Bob | 30 |'
      )
    })

    it('should handle empty data', () => {
      expect(buildMarkdownTable([])).toBe('')
    })

    it('should process header row (empty cells become Column N)', () => {
      const data = [
        ['', 'Age'],
        ['Alice', '25']
      ]
      expect(buildMarkdownTable(data)).toBe(
        '| Column 1 | Age |\n| --- | --- |\n| Alice | 25 |'
      )
    })

    it('should handle single row data', () => {
      const data = [['Name', 'Value']]
      expect(buildMarkdownTable(data)).toBe(
        '| Name | Value |\n| --- | --- |'
      )
    })
  })
})