import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { detectFileKind } from '../../../src/core/detect'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

function sheetJsWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Item', 'Amount'],
    ['Rent', 1200]
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Budget')
  return toArrayBuffer(XLSX.write(workbook, { type: 'buffer' }) as Uint8Array)
}

// Minimal single-entry zip ("notes.txt", stored): local header + central
// directory + end-of-central-directory records, no xl/ entries.
function plainZip(): ArrayBuffer {
  const name = Buffer.from('notes.txt', 'latin1')

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(name.length, 26)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(30 + name.length, 42)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(46 + name.length, 12)
  eocd.writeUInt32LE(30 + name.length, 16)

  return toArrayBuffer(Buffer.concat([local, name, central, name, eocd]))
}

describe('zip content detection', () => {
  it('detects a real SheetJS workbook as xlsx although xl/workbook.xml is past the first 4096 bytes', () => {
    const bytes = sheetJsWorkbook()

    expect(bytes.byteLength).toBeGreaterThan(4096)
    expect(
      detectFileKind({
        name: 'report.bin',
        mime: 'application/octet-stream',
        bytes
      })
    ).toBe('xlsx')
  })

  it('keeps a zip without office entries classified as zip', () => {
    expect(
      detectFileKind({
        name: 'bundle.bin',
        mime: 'application/octet-stream',
        bytes: plainZip()
      })
    ).toBe('zip')
  })

  it('keeps an unknown zip classified as zip when only leading bytes are available', () => {
    const text = new TextEncoder().encode('PK\u0003\u0004 some/other/file.txt')
    expect(
      detectFileKind({
        name: 'bundle.zip',
        mime: '',
        bytes: toArrayBuffer(text)
      })
    ).toBe('zip')
  })
})
