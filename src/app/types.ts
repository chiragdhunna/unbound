import type { ConvertProgress } from '../core/types'

export type OutputMode = 'markdown' | 'plain'
export type BatchMode = 'separate' | 'combined'
export type JobStatus = 'queued' | 'converting' | 'done' | 'error'

export type Job = {
  id: string
  name: string
  status: JobStatus
  output: string
  rawMarkdown: string
  warnings: string[]
  warningCodes?: string[]
  error: string | null
  size: number
  file: File
  attemptId: number
  progress?: ConvertProgress
}

export type Settings = {
  outputMode: OutputMode
  batchMode: BatchMode
  quickPaste: boolean
  chunkLimit: number
  chunkUnit: 'chars' | 'tokens'
  pageMarkers: boolean
  chunkLabels: boolean
  chunkPreamble: boolean
}

export const STORAGE_KEY = 'unbound-settings-v1'

export const defaultSettings: Settings = {
  outputMode: 'markdown',
  batchMode: 'separate',
  quickPaste: false,
  chunkLimit: 12000,
  chunkUnit: 'chars',
  pageMarkers: false,
  chunkLabels: true,
  chunkPreamble: false
}
