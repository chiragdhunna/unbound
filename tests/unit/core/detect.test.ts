import { describe, expect, it } from 'vitest'
import { detectFileKind } from '../../../src/core/detect'

function makeBuffer(values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

describe('detectFileKind', () => {
  it('detects PDFs by signature', () => {
    expect(
      detectFileKind({
        name: 'document.txt',
        mime: 'text/plain',
        bytes: makeBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
      })
    ).toBe('pdf')
  })

  it('detects XLSX by extension when text decodes', () => {
    const bytes = new TextEncoder().encode('some text').buffer
    expect(detectFileKind({ name: 'spreadsheet.xlsx', mime: 'text/plain', bytes })).toBe('xlsx')
  })

  it('detects XLS by extension when text decodes', () => {
    const bytes = new TextEncoder().encode('some text').buffer
    expect(detectFileKind({ name: 'spreadsheet.xls', mime: 'text/plain', bytes })).toBe('xlsx')
  })

  it('detects XLSM by extension when text decodes', () => {
    const bytes = new TextEncoder().encode('some text').buffer
    expect(detectFileKind({ name: 'spreadsheet.xlsm', mime: 'text/plain', bytes })).toBe('xlsx')
  })

  it('detects XLS by OLE2 signature', () => {
    expect(
      detectFileKind({
        name: 'document.txt',
        mime: 'text/plain',
        bytes: makeBuffer([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00])
      })
    ).toBe('xlsx')
  })

  it('detects markdown by extension when text decodes', () => {
    const bytes = new TextEncoder().encode('# heading').buffer
    expect(detectFileKind({ name: 'notes.md', mime: 'text/markdown', bytes })).toBe('markdown')
  })

  it('detects code by extension', () => {
    const bytes = new TextEncoder().encode('logger.log("ok")').buffer
    expect(detectFileKind({ name: 'index.ts', mime: 'text/plain', bytes })).toBe('code')
  })

  it('returns unknown for binary content', () => {
    expect(detectFileKind({ name: 'blob.bin', mime: 'application/octet-stream', bytes: makeBuffer([0x00, 0xff, 0x00]) })).toBe(
      'unknown'
    )
  })
})
