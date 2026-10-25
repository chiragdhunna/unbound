import { type FileKind } from './types'

const codeExtensions = new Set([
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'cs',
  'rb',
  'php',
  'swift',
  'kt',
  'sql',
  'sh',
  'yaml',
  'yml'
])

const imageMimes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp'
])

const imageExtensions = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp'
])

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return ''
  }

  return name.slice(dotIndex + 1).toLowerCase()
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false
  }

  return signature.every((value, index) => bytes[index] === value)
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

function decodeAsUtf8(sample: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(sample)
  } catch {
    return null
  }
}

function looksLikeText(sample: Uint8Array): boolean {
  if (sample.length === 0) {
    return true
  }

  if (sample.some((char) => char === 0)) {
    return false
  }

  return decodeAsUtf8(sample) !== null
}

export interface DetectionResult {
  kind: FileKind
  warnings: { code: string; message: string; severity: 'info' | 'warn' }[]
}

// End-of-central-directory signature (PK\x05\x06); the record itself is 22 bytes
// plus an optional comment, and a zip comment cannot exceed 65535 bytes.
const EOCD_SEARCH_WINDOW = 66000
const LEADING_NAME_WINDOW = 4096

function findEocdOffset(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - EOCD_SEARCH_WINDOW)
  for (let index = bytes.length - 22; index >= start; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index
    }
  }

  return -1
}

/**
 * Entry names live in the central directory at the end of the archive. A
 * leading-page sample alone misses them in real workbooks: SheetJS writes
 * `xl/workbook.xml` about 11 KB into a minimal .xlsx, so scanning only the
 * first bytes classified every generated workbook as a plain zip.
 */
function centralDirectory(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocdOffset(bytes)
  if (eocd < 0) {
    return bytes.subarray(0, 0)
  }

  const size = view.getUint32(eocd + 12, true)
  const offset = view.getUint32(eocd + 16, true)
  if (offset === 0xffffffff || offset + size > bytes.length) {
    return bytes.subarray(0, 0)
  }

  return bytes.subarray(offset, offset + size)
}

function zipKind(bytes: Uint8Array, extension: string): FileKind {
  // Leading window covers local headers (and stored entry data such as an
  // EPUB `mimetype` payload); the central directory covers every entry name.
  const leading = bytes.subarray(0, Math.min(bytes.length, LEADING_NAME_WINDOW))
  const names =
    new TextDecoder('latin1').decode(leading) +
    new TextDecoder('latin1').decode(centralDirectory(bytes))
  if (names.includes('word/document.xml')) return 'docx'
  if (names.includes('ppt/presentation.xml')) return 'pptx'
  if (names.includes('xl/workbook.xml')) return 'xlsx'
  if (
    names.includes('mimetypeapplication/epub+zip') ||
    names.includes('application/epub+zip') ||
    extension === 'epub'
  )
    return 'epub'
  return 'zip'
}

export function detectFileKindWithWarnings(input: {
  name: string
  mime: string
  bytes: ArrayBuffer
}): DetectionResult {
  const bytes = new Uint8Array(input.bytes)
  const sample = bytes.subarray(0, LEADING_NAME_WINDOW)
  const extension = getExtension(input.name)
  const warnings: DetectionResult['warnings'] = []
  let kind: FileKind

  if (startsWith(sample, [0x25, 0x50, 0x44, 0x46, 0x2d])) kind = 'pdf'
  else if (startsWith(sample, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (extension === 'docx') {
      kind = 'encrypted-office'
    } else if (extension === 'doc') {
      kind = 'legacy-office'
    } else {
      // For other extensions, we check if they are known legacy office extensions; if so, legacy-office, else xlsx.
      const legacyOfficeExtensions = new Set([
        'xls',
        'xlt',
        'xlm',
        'ppt',
        'pps',
        'pot',
        'mdb',
        'ldb'
      ])
      if (legacyOfficeExtensions.has(extension)) {
        kind = 'legacy-office'
      } else {
        kind = 'xlsx'
      }
    }
  } else if (startsWith(sample, [0x50, 0x4b, 0x03, 0x04]))
    kind = zipKind(bytes, extension)
  else if (
    startsWith(sample, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(sample, [0xff, 0xd8, 0xff]) ||
    startsWith(sample, [0x47, 0x49, 0x46, 0x38]) ||
    startsWith(sample, [0x42, 0x4d]) ||
    isWebp(sample) ||
    imageMimes.has(input.mime)
  )
    kind = 'image'
  else if (!looksLikeText(sample)) kind = 'unknown'
  else if (extension === 'md' || extension === 'markdown') kind = 'markdown'
  else if (extension === 'txt') kind = 'text'
  else if (extension === 'csv' || extension === 'tsv') kind = 'csv'
  else if (extension === 'json') kind = 'json'
  else if (extension === 'xml') kind = 'xml'
  else if (extension === 'html' || extension === 'htm') kind = 'html'
  else if (extension === 'rtf') kind = 'rtf'
  else if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm')
    kind = 'xlsx'
  else if (codeExtensions.has(extension)) kind = 'code'
  else kind = 'text'

  const extensionKind =
    extension === 'pdf'
      ? 'pdf'
      : extension === 'docx'
        ? 'docx'
        : extension === 'pptx'
          ? 'pptx'
          : extension === 'xlsx' || extension === 'xls'
            ? 'xlsx'
            : imageExtensions.has(extension)
              ? 'image'
              : undefined
  if (extensionKind && extensionKind !== kind && kind !== 'unknown')
    warnings.push({
      code: 'TYPE_MISMATCH',
      message: `Detected ${kind} content despite a .${extension} extension.`,
      severity: 'info'
    })
  return { kind, warnings }
}

export function detectFileKind(input: {
  name: string
  mime: string
  bytes: ArrayBuffer
}): FileKind {
  return detectFileKindWithWarnings(input).kind
}
