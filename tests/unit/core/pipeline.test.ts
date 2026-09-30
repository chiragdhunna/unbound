import { describe, expect, it } from 'vitest'
import { convertFile } from '../../../src/core/pipeline'
import { createConvertContext } from '../../../src/core/context'
import { UnsupportedFormatError } from '../../../src/core/errors'

describe('convertFile', () => {
  it('converts txt files into normalized markdown', async () => {
    const file = new File(['line one\r\nline two'], 'sample.txt', { type: 'text/plain' })

    const result = await convertFile(file, createConvertContext())

    expect(result.markdown).toBe('line one\nline two\n')
  })

  it('throws friendly unsupported error for unsupported binary', async () => {
    const file = new File([new Uint8Array([0x00, 0x02, 0xff])], 'blob.bin', {
      type: 'application/octet-stream'
    })

    await expect(convertFile(file, createConvertContext())).rejects.toBeInstanceOf(UnsupportedFormatError)
  })
})
