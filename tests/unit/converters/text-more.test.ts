import { describe, expect, it } from 'vitest'
import { textConverter } from '../../../src/converters/text'

describe('textConverter', () => {
  it('returns decoding warnings for legacy bytes', async () => {
    const result = await textConverter.convert({ name: 'legacy.txt', mime: 'text/plain', bytes: new Uint8Array([0x93, 0x48, 0x69, 0x94]).buffer }, {} as never)
    expect(result.markdown).toContain('“Hi”')
    expect(result.warnings[0]?.code).toBe('ENCODING_FALLBACK')
  })
})
