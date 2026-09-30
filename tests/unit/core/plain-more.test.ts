import { describe, expect, it } from 'vitest'
import { markdownToPlain } from '../../../src/core/plain'

describe('markdownToPlain details', () => {
  it('removes emphasis, keeps code, turns links into text and URL, and tables into TSV', () => {
    const result = markdownToPlain('**bold** and *italic* [site](https://example.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst value = 1\n```')
    expect(result).toContain('bold and italic site (https://example.com)')
    expect(result).toContain('A\tB')
    expect(result).toContain('1\t2')
    expect(result).toContain('const value = 1')
    expect(result).not.toContain('**')
  })
})
