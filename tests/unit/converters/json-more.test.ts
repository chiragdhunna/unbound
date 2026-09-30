import { describe, expect, it } from 'vitest'
import { jsonConverter } from '../../../src/converters/json'

describe('jsonConverter edge cases', () => {
  it('preserves invalid JSON and warns', async () => {
    const result = await jsonConverter.convert({ name: 'broken.json', mime: 'application/json', bytes: new TextEncoder().encode('{broken').buffer }, {} as never)
    expect(result.warnings[0]?.code).toBe('INVALID_JSON')
    expect(result.markdown).toContain('{broken')
  })

  it('selects a safe fence for backticks inside valid JSON strings', async () => {
    const result = await jsonConverter.convert({ name: 'safe.json', mime: 'application/json', bytes: new TextEncoder().encode(JSON.stringify({ value: '````' })).buffer }, {} as never)
    expect(result.markdown.startsWith('`````json')).toBe(true)
  })
})
