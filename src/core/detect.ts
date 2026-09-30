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

const imageMimes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'])

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

function zipKind(sample: Uint8Array, extension: string): FileKind {
  const names = new TextDecoder('latin1').decode(sample)
  if (names.includes('word/document.xml')) return 'docx'
  if (names.includes('ppt/presentation.xml')) return 'pptx'
  if (names.includes('xl/workbook.xml')) return 'xlsx'
  if (names.includes('mimetypeapplication/epub+zip') || extension === 'epub') return 'epub'
  return 'zip'
}

export function detectFileKindWithWarnings(input: { name: string; mime: string; bytes: ArrayBuffer }): DetectionResult {
  const sample = new Uint8Array(input.bytes.slice(0, 4096))
  const extension = getExtension(input.name)
  const warnings: DetectionResult['warnings'] = []
  let kind: FileKind

  if (startsWith(sample, [0x25, 0x50, 0x44, 0x46, 0x2d])) kind = 'pdf'
  else if (startsWith(sample, [0xd0, 0xcf, 0x11, 0xe0])) {
    kind = extension === 'xls' ? 'xlsx' : extension === 'doc' || extension === 'ppt' ? 'legacy-office' : extension === 'docx' || extension === 'pptx' || extension === 'xlsx' ? 'encrypted-office' : 'unknown'
  } else if (startsWith(sample, [0x50, 0x4b, 0x03, 0x04])) kind = zipKind(sample, extension)
  else if (startsWith(sample, [0x89, 0x50, 0x4e, 0x47]) || startsWith(sample, [0xff, 0xd8, 0xff]) || startsWith(sample, [0x47, 0x49, 0x46, 0x38]) || startsWith(sample, [0x42, 0x4d]) || imageMimes.has(input.mime)) kind = 'image'
  else if (!looksLikeText(sample)) kind = 'unknown'
  else if (extension === 'md' || extension === 'markdown') kind = 'markdown'
  else if (extension === 'txt') kind = 'text'
  else if (extension === 'csv' || extension === 'tsv') kind = 'csv'
  else if (extension === 'json') kind = 'json'
  else if (extension === 'xml') kind = 'xml'
  else if (extension === 'html' || extension === 'htm') kind = 'html'
  else if (extension === 'rtf') kind = 'rtf'
  else if (codeExtensions.has(extension)) kind = 'code'
  else kind = 'text'

  const extensionKind = extension === 'pdf' ? 'pdf' : extension === 'docx' ? 'docx' : extension === 'pptx' ? 'pptx' : extension === 'xlsx' || extension === 'xls' ? 'xlsx' : extension === 'png' || extension === 'jpg' || extension === 'jpeg' ? 'image' : undefined
  if (extensionKind && extensionKind !== kind && kind !== 'unknown') warnings.push({ code: 'TYPE_MISMATCH', message: `Detected ${kind} content despite a .${extension} extension.`, severity: 'info' })
  return { kind, warnings }
}

export function detectFileKind(input: { name: string; mime: string; bytes: ArrayBuffer }): FileKind {
  return detectFileKindWithWarnings(input).kind
}
