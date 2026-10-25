import { describe, expect, it } from 'vitest'
import { createConvertContext } from '../../../src/core/context'

describe('createConvertContext', () => {
  it('creates a context with active signal and default options', () => {
    const ctx = createConvertContext()
    expect(ctx.signal.aborted).toBe(false)
    expect(ctx.options).toEqual({
      ocrLanguage: 'eng',
      forceOcr: false,
      pdfPageMarkers: false
    })
  })

  it('provides a callable default onProgress handler', () => {
    const ctx = createConvertContext()
    expect(() => ctx.onProgress({ phase: 'test', current: 1, total: 1 })).not.toThrow()
  })

  it('provides a default requestPassword handler that resolves to null', async () => {
    const ctx = createConvertContext()
    const password = await ctx.requestPassword('required')
    expect(password).toBeNull()

    const incorrect = await ctx.requestPassword('incorrect')
    expect(incorrect).toBeNull()
  })
})
