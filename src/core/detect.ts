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

export function detectFileKind(input: { name: string; mime: string; bytes: ArrayBuffer }): FileKind {
  const sample = new Uint8Array(input.bytes.slice(0, 4096))
  const extension = getExtension(input.name)

  if (startsWith(sample, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'pdf'
  }

  if (startsWith(sample, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (extension === 'xls') {
      return 'xlsx'
    }

    if (extension === 'doc' || extension === 'ppt') {
      return 'legacy-office'
    }

    if (extension === 'docx' || extension === 'pptx' || extension === 'xlsx') {
      return 'encrypted-office'
    }

    return 'unknown'
  }

  if (startsWith(sample, [0x50, 0x4b, 0x03, 0x04])) {
    if (extension === 'docx') return 'docx'
    if (extension === 'pptx') return 'pptx'
    if (extension === 'xlsx' || extension === 'xlsm') return 'xlsx'
    if (extension === 'epub') return 'epub'
    return 'zip'
  }

  if (startsWith(sample, [0x89, 0x50, 0x4e, 0x47])) {
    return 'image'
  }

  if (startsWith(sample, [0xff, 0xd8, 0xff])) {
    return 'image'
  }

  if (startsWith(sample, [0x47, 0x49, 0x46, 0x38])) {
    return 'image'
  }

  if (startsWith(sample, [0x42, 0x4d])) {
    return 'image'
  }

  if (imageMimes.has(input.mime)) {
    return 'image'
  }

  if (!looksLikeText(sample)) {
    return 'unknown'
  }

  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'txt') return 'text'
  if (extension === 'csv' || extension === 'tsv') return 'csv'
  if (extension === 'json') return 'json'
  if (extension === 'xml') return 'xml'
  if (extension === 'html' || extension === 'htm') return 'html'
  if (extension === 'rtf') return 'rtf'
  if (codeExtensions.has(extension)) return 'code'

  return 'text'
}
