export type FileKind =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'csv'
  | 'text'
  | 'markdown'
  | 'image'
  | 'rtf'
  | 'html'
  | 'json'
  | 'xml'
  | 'code'
  | 'epub'
  | 'zip'
  | 'legacy-office'
  | 'encrypted-office'
  | 'unknown'

export interface Warning {
  code: string
  message: string
  severity: 'info' | 'warn'
  page?: number
}

export interface ConvertStats {
  pages?: number
  slides?: number
  sheets?: number
  files?: number
  ocrPages?: number
  ocrConfidence?: number
  truncated?: boolean
}

export interface ConvertResult {
  markdown: string
  warnings: Warning[]
  stats: ConvertStats
}

export interface ConvertOptions {
  ocrLanguage: string
  forceOcr: boolean
}

export interface ConvertContext {
  signal: AbortSignal
  onProgress: (p: { phase: string; current: number; total: number }) => void
  requestPassword: (reason: 'required' | 'incorrect') => Promise<string | null>
  options: ConvertOptions
}

export interface ConverterInput {
  name: string
  bytes: ArrayBuffer
  mime: string
}

export interface Converter {
  kind: FileKind
  convert(input: ConverterInput, ctx: ConvertContext): Promise<ConvertResult>
}
