import { describe, expect, it, vi } from 'vitest'

// Mock the xlsx package
vi.mock('xlsx', async () => {
  return {
    __esModule: true,
    default: {
      read: vi.fn(),
      utils: {
        decode_range: vi.fn(),
        encode_cell: vi.fn(),
        sheet_to_json: vi.fn()
      }
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

import { xlsxConverter } from '../../../src/converters/xlsx'
import { PasswordRequiredError, CorruptFileError, NoTextFoundError } from '../../../src/core/errors'

describe('xlsxConverter', () => {
  // Helper to get the mocked XLSX module's default export
  const getMockXLSX = async () => {
    const xlsxModule = await import('xlsx')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return xlsxModule.default as any
  }

  it('converts two sheets with correct order and headers', async () => {
    // Mock workbook with two sheets
    const mockWorkbook = {
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Name', t: 's' },
          'B1': { v: 'Age', t: 's' },
          'A2': { v: 'John', t: 's' },
          'B2': { v: 25, t: 'n' },
          'A3': { v: 'Jane', t: 's' },
          'B3': { v: 30, t: 'n' },
          '!ref': 'A1:B3'
        },
        Sheet2: {
          'A1': { v: 'Product', t: 's' },
          'B1': { v: 'Price', t: 's' },
          'A2': { v: 'Apple', t: 's' },
          'B2': { v: 1.5, t: 'n' },
          '!ref': 'A1:B2'
        }
      }
    }

    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue(mockWorkbook)

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:B3') return { s: { c: 0, r: 0 }, e: { c: 1, r: 2 } }
      if (ref === 'A1:B2') return { s: { c: 0, r: 0 }, e: { c: 1, r: 1 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100), // Non-empty to pass empty input check
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('## Sheet: Sheet1')
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| John | 25 |')
    expect(result.markdown).toContain('| Jane | 30 |')
    expect(result.markdown).toContain('## Sheet: Sheet2')
    expect(result.markdown).toContain('| Product | Price |')
    expect(result.markdown).toContain('| Apple | 1.5 |')
    expect(result.warnings).toHaveLength(0)
  })

  it('formats date cells as ISO dates', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {
          'A1': { v: new Date('2026-01-15T10:30:00Z'), t: 'd' },
          'A2': { v: new Date('2026-01-15T00:00:00Z'), t: 'd' },
          '!ref': 'A1:A2'
        }
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:A2') return { s: { c: 0, r: 0 }, e: { c: 0, r: 1 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('2026-01-15T10:30:00')
    expect(result.markdown).toContain('2026-01-15')
    // Should NOT contain the US format "1/15/26"
    expect(result.markdown).not.toContain('1/15/26')
  })

  it('escapes pipe and newline characters in cells', async () => {
    const mockXLSX = await getMockXLSX()
    // Create a string with a newline character
    const cellWithNewline = 'a|b' + String.fromCharCode(10) + 'c'
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Header', t: 's' },
          'A2': { v: cellWithNewline, t: 's' },
          '!ref': 'A1:A2'
        }
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:A2') return { s: { c: 0, r: 0 }, e: { c: 0, r: 1 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    // The input string 'a|b\\n'c (where \\n is a newline) should have pipe escaped to '\\|' and newline replaced by '<br>'
    expect(result.markdown).toContain('a\\|b<br>c')
    // Should NOT contain unescaped pipes or raw newlines
    expect(result.markdown).not.toContain('a|b' + String.fromCharCode(10) + 'c')
  })

  it('handles merged cells correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Merged Value', t: 's' },
          'B1': { v: 'Other', t: 's' },
          'A2': { v: 'Cell A2', t: 's' },
          'B2': { v: 'Cell B2', t: 's' },
          '!merges': [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 }}], // Merge A1:B1
          '!ref': 'A1:B2'
        }
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:B2') return { s: { c: 0, r: 0 }, e: { c: 1, r: 1 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('## Sheet: Sheet1')
    expect(result.markdown).toContain('| Merged Value | Column 2 |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Cell A2 | Cell B2 |')
    expect(result.warnings).toContainEqual({
      code: 'MERGED_CELLS',
      message: 'Merged cells were found; values appear only in the top-left cell.',
      severity: 'warn'
    })
  })

  it('skips empty sheets with warning', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Data', t: 's' },
          '!ref': 'A1:A1'
        },
        Sheet2: {} // Empty sheet
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:A1') return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('## Sheet: Sheet1')
    expect(result.markdown).toContain('| Data |')
    expect(result.markdown).not.toContain('## Sheet: Sheet2')
    expect(result.warnings).toContainEqual({
      code: 'EMPTY_SHEET',
      message: "Sheet 'Sheet2' is empty and was skipped.",
      severity: 'warn'
    })
  })

  it('throws NoTextFoundError when all sheets are empty', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {}, // Empty sheet
        Sheet2: {}  // Empty sheet
      }
    })

    // We need to mock the decode_range and encode_cell to avoid errors, but since the sheets are empty,
    // the range might be undefined. We'll mock them to return dummy values.
    mockXLSX.utils.decode_range.mockReturnValue({ s: { c: 0, r: 0 }, e: { c: 0, r: 0 } })
    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    await expect(
      xlsxConverter.convert(
        {
          name: 'test.xlsx',
          bytes: new ArrayBuffer(100), // Non-empty to pass empty input check
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          signal: new AbortController().signal,
          onProgress: () => undefined,
          requestPassword: async () => null,
          options: { ocrLanguage: 'en', forceOcr: false }
        }
      )
    ).rejects.toThrow(NoTextFoundError)
  })

  it('handles empty header cells correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {
          'A1': { v: '', t: 's' }, // Empty header
          'B1': { v: 'Column B', t: 's' },
          'A2': { v: 'Value A2', t: 's' },
          'B2': { v: 'Value B2', t: 's' },
          '!ref': 'A1:B2'
        }
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:B2') return { s: { c: 0, r: 0 }, e: { c: 1, r: 1 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('| Column 1 | Column B |')
    expect(result.markdown).toContain('| Value A2 | Value B2 |')
  })

  it('handles .xls files the same as .xlsx', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Name', t: 's' },
          'B1': { v: 'Value', t: 's' },
          '!ref': 'A1:B1'
        }
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:B1') return { s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xls',
        bytes: new ArrayBuffer(100), // Non-empty to pass empty input check
        mime: 'application/vnd.ms-excel'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('## Sheet: Sheet1')
    expect(result.markdown).toContain('| Name | Value |')
  })

  it('labels hidden sheets correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {
          'A1': { v: 'Visible', t: 's' },
          '!ref': 'A1:A1'
        },
        Sheet2: {
          'A1': { v: 'Hidden', t: 's' },
          '!ref': 'A1:A1'
        }
      },
      Workbook: {
        Sheets: [
          { Hidden: 0 }, // Sheet1 visible
          { Hidden: 1 }  // Sheet2 hidden
        ]
      }
    })

    mockXLSX.utils.decode_range.mockImplementation((ref: string) => {
      if (ref === 'A1:A1') return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } }
      return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 }}
    })

    mockXLSX.utils.encode_cell.mockImplementation((cell: { c: number; r: number }) => {
      const colChar = String.fromCharCode(65 + cell.c)
      return `${colChar}${cell.r + 1}`
    })

    const result = await xlsxConverter.convert(
      {
        name: 'test.xlsx',
        bytes: new ArrayBuffer(100),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        requestPassword: async () => null,
        options: { ocrLanguage: 'en', forceOcr: false }
      }
    )

    expect(result.markdown).toContain('## Sheet: Sheet1')
    expect(result.markdown).toContain('## Sheet: Sheet2 (hidden)')
  })

  it('handles corrupt files correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockImplementation(() => {
      throw new Error('File corrupted')
    })

    await expect(
      xlsxConverter.convert(
        {
          name: 'test.xlsx',
          bytes: new ArrayBuffer(0),
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          signal: new AbortController().signal,
          onProgress: () => undefined,
          requestPassword: async () => null,
          options: { ocrLanguage: 'en', forceOcr: false }
        }
      )
    ).rejects.toThrow(CorruptFileError)
  })

  it('handles password-protected files correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockImplementation(() => {
      throw new Error('File is encrypted')
    })

    await expect(
      xlsxConverter.convert(
        {
          name: 'test.xlsx',
          bytes: new ArrayBuffer(100),
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          signal: new AbortController().signal,
          onProgress: () => undefined,
          requestPassword: async () => null,
          options: { ocrLanguage: 'en', forceOcr: false }
        }
      )
    ).rejects.toThrow(PasswordRequiredError)
  })

  it('handles zero-byte input correctly', async () => {
    await expect(
      xlsxConverter.convert(
        {
          name: 'test.xlsx',
          bytes: new ArrayBuffer(0),
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          signal: new AbortController().signal,
          onProgress: () => undefined,
          requestPassword: async () => null,
          options: { ocrLanguage: 'en', forceOcr: false }
        }
      )
    ).rejects.toThrow(CorruptFileError)
  })

  it('handles random garbage bytes correctly', async () => {
    const mockXLSX = await getMockXLSX()
    mockXLSX.read.mockImplementation(() => {
      throw new Error('Invalid file format')
    })

    await expect(
      xlsxConverter.convert(
        {
          name: 'test.xlsx',
          bytes: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).buffer, // PNG header
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        {
          signal: new AbortController().signal,
          onProgress: () => undefined,
          requestPassword: async () => null,
          options: { ocrLanguage: 'en', forceOcr: false }
        }
      )
    ).rejects.toThrow(CorruptFileError)
  })
})