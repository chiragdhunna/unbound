import { detectFileKind } from './detect'
import { UnsupportedFormatError } from './errors'
import { loadConverter } from './registry'
import { type ConvertContext, type ConvertResult } from './types'

const supportedKinds = new Set([
  'text',
  'markdown',
  'json',
  'xml',
  'code',
  'docx',
  'pptx',
  'xlsx',
  'csv',
  'pdf',
  'image'
])

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file bytes.'))
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('File bytes could not be read as an ArrayBuffer.'))
        return
      }

      resolve(reader.result)
    }
    reader.readAsArrayBuffer(file)
  })
}

export async function convertFile(
  file: File,
  ctx: ConvertContext
): Promise<ConvertResult> {
  const bytes = await readFileBytes(file)
  const kind = detectFileKind({
    name: file.name,
    mime: file.type,
    bytes
  })

  if (!supportedKinds.has(kind)) {
    throw new UnsupportedFormatError(
      `Unsupported format for now (${kind}). Supported: txt, md, json, xml, code, pdf, docx, pptx, xlsx, xls, xlsm, csv, tsv, and image (png, jpg, webp, bmp, gif) files.`
    )
  }

  const converter = await loadConverter(kind)
  return converter.convert(
    {
      name: file.name,
      bytes,
      mime: file.type
    },
    ctx
  )
}
