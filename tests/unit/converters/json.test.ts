import { describe, expect, it } from 'vitest'
import { jsonConverter } from '../../../src/converters/json'
import { createConvertContext } from '../../../src/core/context'

const context = createConvertContext()

describe('jsonConverter', () => {
  it('pretty-prints valid JSON in a fenced block', async () => {
    const input = {
      name: 'data.json',
      mime: 'application/json',
      bytes: new TextEncoder().encode('{"hello":"world"}').buffer
    }

    const result = await jsonConverter.convert(input, context)

    expect(result.markdown).toContain('```json')
    expect(result.markdown).toContain('"hello": "world"')
    expect(result.warnings).toHaveLength(0)
  })

  it('keeps invalid JSON with a warning', async () => {
    const input = {
      name: 'broken.json',
      mime: 'application/json',
      bytes: new TextEncoder().encode('{oops').buffer
    }

    const result = await jsonConverter.convert(input, context)

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('INVALID_JSON')
  })
})
