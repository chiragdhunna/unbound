import { describe, expect, it } from 'vitest'
import { markdownConverter } from '../../../src/converters/markdown'
import { xmlConverter } from '../../../src/converters/xml'

describe('markdown and XML converters', () => {
  it('normalizes Markdown without wrapping it', async () => {
    const result = await markdownConverter.convert({ name: 'a.md', mime: 'text/markdown', bytes: new TextEncoder().encode('# Heading\r\n').buffer }, {} as never)
    expect(result.markdown).toBe('# Heading\n')
  })

  it('wraps XML in a safe language fence', async () => {
    const result = await xmlConverter.convert({ name: 'a.xml', mime: 'application/xml', bytes: new TextEncoder().encode('<root />').buffer }, {} as never)
    expect(result.markdown).toContain('```xml')
    expect(result.markdown).toContain('<root />')
  })
})
