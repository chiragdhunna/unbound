import { describe, expect, it } from 'vitest'
import { convertFile } from '../../../src/core/pipeline'
import { createConvertContext } from '../../../src/core/context'
import { UnsupportedFormatError } from '../../../src/core/errors'

describe('convertFile', () => {
  it('converts txt files into normalized markdown', async () => {
    const file = new File(['line one\r\nline two'], 'sample.txt', {
      type: 'text/plain'
    })

    const result = await convertFile(file, createConvertContext())

    expect(result.markdown).toBe('line one\nline two\n')
  })

  it('throws friendly unsupported error for unsupported binary', async () => {
    const file = new File([new Uint8Array([0x00, 0x02, 0xff])], 'blob.bin', {
      type: 'application/octet-stream'
    })

    await expect(
      convertFile(file, createConvertContext())
    ).rejects.toBeInstanceOf(UnsupportedFormatError)
  })

  it('converts a File named a.csv into the exact markdown table', async () => {
    const file = new File(['name,quote\nAna,"say ""hi"""'], 'a.csv', {
      type: 'text/csv'
    })

    const result = await convertFile(file, createConvertContext())

    expect(result.markdown).toBe(
      '| name | quote |\n| --- | --- |\n| Ana | say "hi" |\n'
    )
  })

  it('reads file bytes via FileReader fallback when file.arrayBuffer is not available', async () => {
    const file = new File(['hello fallback'], 'test.txt', {
      type: 'text/plain'
    })
    // @ts-expect-error simulating browser where file.arrayBuffer is undefined
    file.arrayBuffer = undefined

    const result = await convertFile(file, createConvertContext())
    expect(result.markdown).toBe('hello fallback\n')
  })

  it('rejects when FileReader encounters an error', async () => {
    const file = new File(['data'], 'test.txt', { type: 'text/plain' })
    // @ts-expect-error simulating browser where file.arrayBuffer is undefined
    file.arrayBuffer = undefined

    const origFileReader = globalThis.FileReader
    class ErrorFileReader {
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      readAsArrayBuffer() {
        setTimeout(() => this.onerror?.(), 0)
      }
    }
    // @ts-expect-error mocking FileReader
    globalThis.FileReader = ErrorFileReader

    try {
      await expect(convertFile(file, createConvertContext())).rejects.toThrow(
        'Failed to read file bytes.'
      )
    } finally {
      globalThis.FileReader = origFileReader
    }
  })

  it('rejects when FileReader result is not an ArrayBuffer', async () => {
    const file = new File(['data'], 'test.txt', { type: 'text/plain' })
    // @ts-expect-error simulating browser where file.arrayBuffer is undefined
    file.arrayBuffer = undefined

    const origFileReader = globalThis.FileReader
    class BadResultFileReader {
      result = 'not an array buffer'
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      readAsArrayBuffer() {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    // @ts-expect-error mocking FileReader
    globalThis.FileReader = BadResultFileReader

    try {
      await expect(convertFile(file, createConvertContext())).rejects.toThrow(
        'File bytes could not be read as an ArrayBuffer.'
      )
    } finally {
      globalThis.FileReader = origFileReader
    }
  })
})
