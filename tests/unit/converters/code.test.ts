import { describe, expect, it } from 'vitest'
import { codeConverter } from '../../../src/converters/code'

describe('codeConverter', () => {
  it('uses a fence longer than backticks in content', async () => {
    const result = await codeConverter.convert({ name: 'sample.ts', mime: 'text/plain', bytes: new TextEncoder().encode('const x = ````;').buffer }, {} as never)
    expect(result.markdown.startsWith('`````ts')).toBe(true)
    expect(result.markdown).toContain('const x = ````;')
  })
})
