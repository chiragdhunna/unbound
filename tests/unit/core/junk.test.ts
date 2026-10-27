import { describe, expect, it } from 'vitest'
import { isJunkPath, JUNK_PATTERNS } from '../../../src/core/junk'

describe('isJunkPath and JUNK_PATTERNS', () => {
  it('exports expected junk patterns', () => {
    expect(JUNK_PATTERNS).toContain('__MACOSX')
    expect(JUNK_PATTERNS).toContain('.git')
    expect(JUNK_PATTERNS).toContain('node_modules')
    expect(JUNK_PATTERNS).toContain('.DS_Store')
  })

  it('identifies OS and editor junk directories and files', () => {
    expect(isJunkPath('__MACOSX/._file.txt')).toBe(true)
    expect(isJunkPath('foo/.DS_Store')).toBe(true)
    expect(isJunkPath('Thumbs.db')).toBe(true)
    expect(isJunkPath('sub/dir/Thumbs.db')).toBe(true)
    expect(isJunkPath('.git/config')).toBe(true)
    expect(isJunkPath('project/node_modules/pkg/index.js')).toBe(true)
    expect(isJunkPath('.vscode/settings.json')).toBe(true)
    expect(isJunkPath('.idea/workspace.xml')).toBe(true)
    expect(isJunkPath('dist/bundle.js')).toBe(true)
    expect(isJunkPath('build/output.css')).toBe(true)
    expect(isJunkPath('src/__pycache__/module.cpython-310.pyc')).toBe(true)
  })

  it('identifies compiled and lock files', () => {
    expect(isJunkPath('script.pyc')).toBe(true)
    expect(isJunkPath('App.class')).toBe(true)
    expect(isJunkPath('package-lock.json')).toBe(true)
    expect(isJunkPath('yarn.lock')).toBe(true)
    expect(isJunkPath('pnpm-lock.yaml')).toBe(true)
    expect(isJunkPath('Cargo.lock')).toBe(true)
  })

  it('allows valid document and code paths', () => {
    expect(isJunkPath('src/index.ts')).toBe(false)
    expect(isJunkPath('README.md')).toBe(false)
    expect(isJunkPath('docs/guide.pdf')).toBe(false)
    expect(isJunkPath('nested/folder/notes.docx')).toBe(false)
    expect(isJunkPath('data/table.xlsx')).toBe(false)
  })
})
