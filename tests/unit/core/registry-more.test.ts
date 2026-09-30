import { describe, expect, it } from 'vitest'
import { loadConverter } from '../../../src/core/registry'
import { UnsupportedFormatError } from '../../../src/core/errors'

describe('converter registry', () => {
  it('loads registered converters lazily', async () => {
    for (const kind of ['text', 'markdown', 'json', 'xml', 'code', 'docx'] as const) {
      expect((await loadConverter(kind)).kind).toBe(kind)
    }
  })

  it('rejects unregistered kinds', async () => {
    await expect(loadConverter('pdf')).rejects.toBeInstanceOf(UnsupportedFormatError)
  })
})
