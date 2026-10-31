export const JUNK_PATTERNS = [
  '__MACOSX',
  '.DS_Store',
  'Thumbs.db',
  '.git',
  'node_modules',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '__pycache__'
] as const

export function isJunkPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/')
  for (const segment of segments) {
    if (
      JUNK_PATTERNS.some((p) => segment === p || segment.startsWith(p + '/'))
    ) {
      return true
    }
    if (segment === '.DS_Store' || segment === 'Thumbs.db') {
      return true
    }
  }
  const filename = segments[segments.length - 1] || ''
  if (
    filename.endsWith('.pyc') ||
    filename.endsWith('.class') ||
    filename.endsWith('.lock') ||
    filename === 'package-lock.json' ||
    filename === 'yarn.lock' ||
    filename === 'pnpm-lock.yaml'
  ) {
    return true
  }
  return false
}

export const FOLDER_MAX_FILES = 500

export function getFileDisplayName(file: {
  name: string
  webkitRelativePath?: string
}): string {
  if (file.webkitRelativePath && file.webkitRelativePath.trim() !== '') {
    return file.webkitRelativePath.replace(/\\/g, '/')
  }
  return file.name
}

export interface FolderFilterResult<
  T extends { name: string; webkitRelativePath?: string }
> {
  accepted: T[]
  skippedJunkCount: number
  limitReached: boolean
}

export function filterFolderFiles<
  T extends { name: string; webkitRelativePath?: string }
>(
  files: Iterable<T> | ArrayLike<T>,
  maxFiles: number = FOLDER_MAX_FILES
): FolderFilterResult<T> {
  const fileArray = Array.from(files)
  const accepted: T[] = []
  let skippedJunkCount = 0
  let limitReached = false

  for (const file of fileArray) {
    const relativeOrName = getFileDisplayName(file)
    if (isJunkPath(relativeOrName)) {
      skippedJunkCount++
      continue
    }
    if (accepted.length >= maxFiles) {
      limitReached = true
      break
    }
    accepted.push(file)
  }

  return { accepted, skippedJunkCount, limitReached }
}
