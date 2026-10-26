import { describe, expect, it } from 'vitest'
import { detectFileKind, detectFileKindWithWarnings } from '../../../src/core/detect'

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

  it('detects real pptx zip as pptx', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<p:presentation/>')
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    expect(
      detectFileKind({
        name: 'presentation.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes
      })
    ).toBe('pptx')
  })

  it('handles .pptx with garbage bytes safely as unknown', () => {
    expect(
      detectFileKind({
        name: 'corrupt.pptx',
        mime: 'application/octet-stream',
        bytes: makeBuffer([0x00, 0xff, 0xfe, 0x00])
      })
    ).toBe('unknown')
  })

  it('detects OLE2 bytes with .pptx extension as encrypted-office', () => {
    expect(
      detectFileKind({
        name: 'encrypted.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: makeBuffer([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb2])
      })
    ).toBe('encrypted-office')
  })

  it('detects OLE2 bytes with .ppt extension as legacy-office', () => {
    expect(
      detectFileKind({
        name: 'legacy.ppt',
        mime: 'application/vnd.ms-powerpoint',
        bytes: makeBuffer([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00])
      })
    ).toBe('legacy-office')
  })

  it('detects RTF file by magic bytes {\\rtf', () => {
    const rtfBytes = new TextEncoder().encode('{\\rtf1\\ansi\\deff0 Hello}').buffer
    expect(
      detectFileKind({
        name: 'document.rtf',
        mime: 'application/rtf',
        bytes: rtfBytes
      })
    ).toBe('rtf')
  })

  it('detects RTF file by magic bytes even with misleading extension', () => {
    const rtfBytes = new TextEncoder().encode('{\\rtf1\\ansi\\deff0 Hello}').buffer
    const result = detectFileKindWithWarnings({
      name: 'document.txt',
      mime: 'text/plain',
      bytes: rtfBytes
    })
    expect(result.kind).toBe('rtf')
  })

  it('detects HTML file by extension', () => {
    const htmlBytes = new TextEncoder().encode('<html><body>Hello</body></html>').buffer
    expect(
      detectFileKind({
        name: 'page.html',
        mime: 'text/html',
        bytes: htmlBytes
      })
    ).toBe('html')
  })

  it('detects HTML file by DOCTYPE even with misleading .txt extension', () => {
    const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html><body>Hello</body></html>').buffer
    const result = detectFileKindWithWarnings({
      name: 'page.txt',
      mime: 'text/plain',
      bytes: htmlBytes
    })
    expect(result.kind).toBe('html')
  })
})
