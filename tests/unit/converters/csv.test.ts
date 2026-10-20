import { csvConverter } from '../../../src/converters/csv'
import {
  type ConvertContext,
  type ConverterInput
} from '../../../src/core/types'

describe('csvConverter', () => {
  const createContext = (): ConvertContext => ({
    signal: AbortSignal.timeout(1000),
    onProgress: () => {},
    requestPassword: async () => null,
    options: { ocrLanguage: 'en', forceOcr: false }
  })

  const createInput = (
    text: string,
    mimeType = 'text/csv',
    name = 'test.csv'
  ): ConverterInput => ({
    name,
    bytes: new TextEncoder().encode(text).buffer,
    mime: mimeType
  })

  it('parses basic CSV', async () => {
    const input = createInput('Name,Age\nAlice,25\nBob,30')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |')
    expect(result.markdown).toContain('| Bob | 30 |')
  })

  it('parses TSV when mime type indicates', async () => {
    const input = createInput(
      'Name\tAge\nAlice\t25\nBob\t30',
      'text/tab-separated-values'
    )
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |')
    expect(result.markdown).toContain('| Bob | 30 |')
  })

  it('detects TSV from content when plain text mime', async () => {
    const input = createInput('Name\tAge\tCity\nAlice\t25\tNY', 'text/plain')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age | City |')
    expect(result.markdown).toContain('| --- | --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 | NY |')
  })

  it('handles quoted fields', async () => {
    const input = createInput('"Name","Age"\n"Alice","25"\n"Bob","30"')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |')
    expect(result.markdown).toContain('| Bob | 30 |')
  })

  it('handles escaped quotes in fields', async () => {
    const input = createInput('Quote,Text\n"Alice","She said \\"hello\\""')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Quote | Text |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | She said "hello" |')
  })

  it('handles newlines inside quoted fields', async () => {
    const input = createInput('Description\n"Line 1\nLine 2"')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Description |')
    expect(result.markdown).toContain('| --- |')
    expect(result.markdown).toContain('| Line 1<br>Line 2 |')
  })

  it('handles empty fields', async () => {
    const input = createInput('Name,Age,City\nAlice,25,\nBob,,NY')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age | City |')
    expect(result.markdown).toContain('| --- | --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |  |')
    expect(result.markdown).toContain('| Bob |  | NY |')
  })

  it('processes header row (empty cells become Column N)', async () => {
    const input = createInput(',Age,\nAlice,25,NY\nBob,30,LA')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Column 1 | Age | Column 3 |')
    expect(result.markdown).toContain('| --- | --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 | NY |')
    expect(result.markdown).toContain('| Bob | 30 | LA |')
  })

  it('trims blank trailing rows and columns', async () => {
    const input = createInput('Name,Age,\nAlice,25,\n,\n,')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |')
  })

  it('handles whitespace in fields', async () => {
    const input = createInput(' Name , Age \n Alice , 25 \n Bob , 30 ')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
    expect(result.markdown).toContain('| Alice | 25 |')
    expect(result.markdown).toContain('| Bob | 30 |')
  })

  it('handles single row (header only)', async () => {
    const input = createInput('Name,Age')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toContain('| Name | Age |')
    expect(result.markdown).toContain('| --- | --- |')
  })

  it('throws CorruptFileError for empty input', async () => {
    const input = createInput('')
    await expect(csvConverter.convert(input, createContext())).rejects.toThrow(
      'This CSV/TSV file is empty.'
    )
  })

  it('throws NoTextFoundError for empty content', async () => {
    const input = createInput(',,\n,,\n,,')
    await expect(csvConverter.convert(input, createContext())).rejects.toThrow(
      'No text found in the CSV/TSV file.'
    )
  })

  // --- Exact-text preservation (values stay EXACTLY as written in source) ---

  it('keeps quoted quotes exact: say ""hi"" becomes say "hi"', async () => {
    const input = createInput('name,quote\nAna,"say ""hi"""')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| name | quote |\n| --- | --- |\n| Ana | say "hi" |\n'
    )
  })

  it('keeps leading zeros exact: 007 stays 007', async () => {
    const input = createInput('id\n007')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe('| id |\n| --- |\n| 007 |\n')
  })

  it('keeps exponent notation exact: 1e3 stays 1e3', async () => {
    const input = createInput('value\n1e3')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe('| value |\n| --- |\n| 1e3 |\n')
  })

  it('keeps leading/trailing spaces inside quoted cells exact', async () => {
    const input = createInput('name,city\n" Ana "," New York "')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| name | city |\n| --- | --- |\n|  Ana  |  New York  |\n'
    )
  })

  it('converts a newline inside quotes to <br> exactly', async () => {
    const input = createInput('desc\n"line1\nline2"')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe('| desc |\n| --- |\n| line1<br>line2 |\n')
  })

  it('escapes a pipe inside a quoted cell as \\| exactly', async () => {
    const input = createInput('a,b\n"x|y",z')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe('| a | b |\n| --- | --- |\n| x\\|y | z |\n')
  })

  it('routes TSV by filename even when mime says csv', async () => {
    const input = createInput('Name\tAge\nAlice\t25', 'text/csv', 'table.tsv')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| Name | Age |\n| --- | --- |\n| Alice | 25 |\n'
    )
  })

  it('routes semicolon-delimited content by sniffing the first line', async () => {
    const input = createInput('name;age\nAlice;30')
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| name | age |\n| --- | --- |\n| Alice | 30 |\n'
    )
  })

  it('strips a UTF-8 BOM and keeps content exact', async () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('name,quote\nAna,"say ""hi"""')
    ])
    const input: ConverterInput = {
      name: 'bom.csv',
      bytes: bytes.buffer,
      mime: 'text/csv'
    }
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| name | quote |\n| --- | --- |\n| Ana | say "hi" |\n'
    )
  })

  it('decodes windows-1252 bytes and warns about the fallback', async () => {
    // "name,city\nCaf" + 0xE9 (é in windows-1252; invalid as UTF-8)
    const bytes = new Uint8Array([
      ...Array.from('name,city\nCaf').map((c) => c.charCodeAt(0)),
      0xe9
    ])
    const input: ConverterInput = {
      name: 'legacy.csv',
      bytes: bytes.buffer,
      mime: 'text/csv'
    }
    const result = await csvConverter.convert(input, createContext())
    expect(result.markdown).toBe(
      '| name | city |\n| --- | --- |\n| Café |  |\n'
    )
    expect(
      result.warnings.some((warning) => warning.code === 'ENCODING_FALLBACK')
    ).toBe(true)
  })
})
