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
    if (JUNK_PATTERNS.some((p) => segment === p || segment.startsWith(p + '/'))) {
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
