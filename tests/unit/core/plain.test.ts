import { describe, expect, it } from 'vitest'
import { markdownToPlain } from '../../../src/core/plain'

describe('markdownToPlain', () => {
  it('removes markdown formatting while keeping readable text', () => {
    const text = '# Heading\n\n- first item\n- second item\n\n[docs](https://example.com)\n\n```ts\nconst value = 1\n```'

    const plain = markdownToPlain(text)

    expect(plain).toContain('Heading')
    expect(plain).toContain('first item')
    expect(plain).toContain('docs')
    expect(plain).not.toContain('**')
    expect(plain).not.toContain('```')
  })
})
