import { describe, expect, it } from 'vitest'
import { chunkMarkdown, chunkMarkdownWithWarnings, joinChunks } from '../../../src/core/chunk'

describe('chunkMarkdown', () => {
  it('keeps code fences intact and can be rejoined exactly', () => {
    const text = ['```ts', 'const value = 1;', '```', '', '## Section', 'A second line.'].join('\n')

    const chunks = chunkMarkdown(text, { maxChars: 25, label: false })
    const rebuilt = joinChunks(chunks)

    expect(chunks.length).toBeGreaterThan(1)
    expect(rebuilt).toBe(text)
    expect(chunks.some((chunk) => chunk.includes('```ts'))).toBe(true)
  })

  it('rejoins generated paragraph bodies exactly', () => {
    const text = Array.from({ length: 40 }, (_, index) => `## Section ${index}\n\nParagraph ${index} with enough text to force multiple chunks.`).join('\n\n')
    const chunks = chunkMarkdown(text, { maxChars: 100 })
    expect(joinChunks(chunks)).toBe(text)
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true)
  })

  it('does not split table rows and repeats the table header', () => {
    const text = ['| Name | Value |', '| --- | --- |', ...Array.from({ length: 12 }, (_, index) => `| item-${index} | value-${index} |`)].join('\n')
    const chunks = chunkMarkdown(text, { maxChars: 65 })
    expect(chunks.every((chunk) => !chunk.split('\n').some((line) => line.includes('| item-') && !line.endsWith('|')))).toBe(true)
    expect(chunks.slice(1).every((chunk) => chunk.startsWith('| Name | Value |\n| --- | --- |'))).toBe(true)
  })

  it('warns instead of splitting an unsplittable oversized fence', () => {
    const result = chunkMarkdownWithWarnings('```\n' + 'x'.repeat(200) + '\n```', { maxChars: 20 })
    expect(result.chunks).toHaveLength(1)
    expect(result.warnings[0]).toContain('code fence')
  })
})
