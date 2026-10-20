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
    mimeType = 'text/csv'
  ): ConverterInput => ({
    name: 'test.csv',
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
    expect(result.markdown).toContain('| Alice | She said \\"hello\\" |')
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
})
