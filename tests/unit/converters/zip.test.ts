import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import {
  zipConverter,
  buildAsciiFileTree,
  sanitizeZipEntryPath,
  isZipEncrypted,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_FILE_BYTES,
  ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES,
  ZIP_MAX_OUTPUT_CHARS
} from '../../../src/converters/zip'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  PasswordRequiredError,
  TooLargeError
} from '../../../src/core/errors'
import { type ConvertContext } from '../../../src/core/types'

function makeContext(overrides?: Partial<ConvertContext>): ConvertContext {
  return {
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    requestPassword: vi.fn(),
    options: {
      ocrLanguage: 'eng',
      forceOcr: false,
      pdfPageMarkers: false
    },
    ...overrides
  }
}

async function createZipBuffer(
  files: Record<string, string | Uint8Array>
): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content)
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('zipConverter and zip helpers', () => {
  it('sanitizes zip-slip paths containing .. or absolute paths', () => {
    expect(sanitizeZipEntryPath('../../evil.txt')).toBe('evil.txt')
    expect(sanitizeZipEntryPath('/etc/passwd')).toBe('etc/passwd')
    expect(sanitizeZipEntryPath('foo/../bar/./baz.txt')).toBe('bar/baz.txt')
    expect(sanitizeZipEntryPath('..')).toBe('')
  })

  it('builds ascii file tree with indentation and skipped summary', () => {
    const tree = buildAsciiFileTree(
      'project.zip',
      ['docs/guide.md', 'docs/notes.txt', 'src/main.ts', 'README.md'],
      3
    )
    expect(tree).toContain('project.zip/')
    expect(tree).toContain('  docs/')
    expect(tree).toContain('    guide.md')
    expect(tree).toContain('    notes.txt')
    expect(tree).toContain('  src/')
    expect(tree).toContain('    main.ts')
    expect(tree).toContain('  README.md')
    expect(tree).toContain('(3 skipped: junk or unsupported)')
  })

  it('detects encrypted zip entries with bit 0 set', () => {
    const encryptedBytes = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04, // signature
      0x14,
      0x00, // version
      0x01,
      0x00, // general purpose bit flag (bit 0 set)
      0x00,
      0x00, // compression
      0x00,
      0x00,
      0x00,
      0x00, // time/date
      0x00,
      0x00,
      0x00,
      0x00, // crc
      0x04,
      0x00,
      0x00,
      0x00, // csize
      0x04,
      0x00,
      0x00,
      0x00, // usize
      0x04,
      0x00, // name length (4)
      0x00,
      0x00, // extra length
      ...new TextEncoder().encode('file'),
      0x00,
      0x00,
      0x00,
      0x00
    ]).buffer

    expect(isZipEncrypted(encryptedBytes)).toBe(true)
  })

  it('converts a multi-file zip producing file tree and # File: boundaries', async () => {
    const bytes = await createZipBuffer({
      'README.md': '# Project Readme\n\nWelcome to project.',
      'docs/guide.txt': 'Step 1: Install.\nStep 2: Run.'
    })

    const ctx = makeContext()
    const result = await zipConverter.convert(
      { name: 'archive.zip', mime: 'application/zip', bytes },
      ctx
    )

    expect(result.markdown).toContain('## Files')
    expect(result.markdown).toContain('archive.zip/')
    expect(result.markdown).toContain('# File: README.md')
    expect(result.markdown).toContain('# Project Readme')
    expect(result.markdown).toContain('# File: docs/guide.txt')
    expect(result.markdown).toContain('Step 1: Install.')
    expect(result.stats.files).toBe(2)
    expect(ctx.onProgress).toHaveBeenCalledWith({
      phase: 'zip',
      current: 1,
      total: 2
    })
    expect(ctx.onProgress).toHaveBeenCalledWith({
      phase: 'zip',
      current: 2,
      total: 2
    })
  })

  it('filters out junk files and OS metadata', async () => {
    const bytes = await createZipBuffer({
      '__MACOSX/._note.txt': 'mac junk',
      '.DS_Store': 'ds store junk',
      'valid.txt': 'Valid text file.',
      '.git/config': 'git repo data',
      'node_modules/pkg/index.js': 'module code',
      'Thumbs.db': 'thumb junk',
      'script.pyc': 'compiled python'
    })

    const result = await zipConverter.convert(
      { name: 'with-junk.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('# File: valid.txt')
    expect(result.markdown).not.toContain('__MACOSX')
    expect(result.markdown).not.toContain('.DS_Store')
    expect(result.markdown).not.toContain('Thumbs.db')
    expect(result.markdown).not.toContain('.git/config')
    expect(result.markdown).not.toContain('node_modules')
    expect(result.markdown).toContain('skipped: junk or unsupported')
    expect(result.stats.files).toBe(1)
  })

  it('recurses into nested zip archives up to depth limit', async () => {
    const level4Zip = await createZipBuffer({
      'level4.txt': 'Exceeds depth 3 limit'
    })
    const innerInnerZip = await createZipBuffer({
      'level3.txt': 'Deepest level text.',
      'level4.zip': new Uint8Array(level4Zip)
    })
    const innerZip = await createZipBuffer({
      'level2.txt': 'Level 2 text.',
      'nested2.zip': new Uint8Array(innerInnerZip)
    })
    const outerBytes = await createZipBuffer({
      'level1.txt': 'Level 1 text.',
      'nested1.zip': new Uint8Array(innerZip)
    })

    const result = await zipConverter.convert(
      { name: 'nested.zip', mime: 'application/zip', bytes: outerBytes },
      makeContext()
    )

    expect(result.markdown).toContain('# File: level1.txt')
    expect(result.markdown).toContain('# File: nested1.zip/level2.txt')
    expect(result.markdown).toContain(
      '# File: nested1.zip/nested2.zip/level3.txt'
    )
    expect(result.markdown).not.toContain('level4.txt')
    expect(result.stats.files).toBe(3)
  })

  it('sanitizes zip-slip entry names when converting', async () => {
    const bytes = await createZipBuffer({
      '../../escape.txt': 'Should be sanitized to escape.txt'
    })

    const result = await zipConverter.convert(
      { name: 'slip.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('# File: escape.txt')
    expect(result.markdown).not.toContain('../../')
  })

  it('isolates per-file failure without aborting archive conversion', async () => {
    const bytes = await createZipBuffer({
      'good1.txt': 'First good file.',
      'corrupt.docx': new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), // corrupt docx
      'good2.txt': 'Second good file.'
    })

    const result = await zipConverter.convert(
      { name: 'partial.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('# File: good1.txt')
    expect(result.markdown).toContain('First good file.')
    expect(result.markdown).toContain('# File: corrupt.docx')
    expect(result.markdown).toContain('> ⚠ corrupt.docx:')
    expect(result.markdown).toContain('# File: good2.txt')
    expect(result.markdown).toContain('Second good file.')
    expect(result.warnings.some((w) => w.code === 'ZIP_ENTRIES_FAILED')).toBe(
      true
    )
  })

  it('caps at ZIP_MAX_ENTRIES and emits ZIP_LIMIT_REACHED warning', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 505; i++) {
      files[`file_${i}.txt`] = `Content for file ${i}`
    }
    const bytes = await createZipBuffer(files)

    const result = await zipConverter.convert(
      { name: 'big.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.stats.files).toBe(ZIP_MAX_ENTRIES)
    expect(result.stats.truncated).toBe(true)
    expect(result.warnings.some((w) => w.code === 'ZIP_LIMIT_REACHED')).toBe(
      true
    )
  })

  it('rejects declared-size zip-bomb entries before inflating', async () => {
    const bytes = await createZipBuffer({ 'file1.txt': 'content' })
    const loadedZip = await JSZip.loadAsync(bytes)
    const bigEntry = loadedZip.file('file1.txt') as unknown as {
      _data: { uncompressedSize: number }
    }
    bigEntry._data = { uncompressedSize: 60 * 1024 * 1024 } // > 50 MB

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(loadedZip)

    await expect(
      zipConverter.convert(
        { name: 'bomb.zip', mime: 'application/zip', bytes },
        makeContext()
      )
    ).rejects.toThrow(TooLargeError)

    vi.restoreAllMocks()
  })

  it('throws PasswordRequiredError when zip is encrypted', async () => {
    const encryptedBytes = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      0x14,
      0x00,
      0x01,
      0x00, // bit 0 set
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x04,
      0x00,
      0x00,
      0x00,
      0x04,
      0x00,
      0x00,
      0x00,
      0x04,
      0x00,
      0x00,
      0x00,
      ...new TextEncoder().encode('file'),
      0x00,
      0x00,
      0x00,
      0x00
    ]).buffer

    await expect(
      zipConverter.convert(
        { name: 'secret.zip', mime: 'application/zip', bytes: encryptedBytes },
        makeContext()
      )
    ).rejects.toThrow(PasswordRequiredError)
  })

  it('throws CorruptFileError for corrupted zip bytes', async () => {
    const corrupt = new Uint8Array([1, 2, 3, 4, 5]).buffer
    await expect(
      zipConverter.convert(
        { name: 'bad.zip', mime: 'application/zip', bytes: corrupt },
        makeContext()
      )
    ).rejects.toThrow(CorruptFileError)
  })

  it('throws NoTextFoundError when zip has no convertible files', async () => {
    const bytes = await createZipBuffer({
      '.DS_Store': 'junk only',
      'binary.bin': new Uint8Array([0x00, 0xff, 0xfe])
    })

    await expect(
      zipConverter.convert(
        { name: 'empty.zip', mime: 'application/zip', bytes },
        makeContext()
      )
    ).rejects.toThrow(NoTextFoundError)
  })

  it('supports cancellation during archive processing', async () => {
    const controller = new AbortController()
    controller.abort()

    const bytes = await createZipBuffer({ 'file.txt': 'hello' })
    await expect(
      zipConverter.convert(
        { name: 'cancel.zip', mime: 'application/zip', bytes },
        makeContext({ signal: controller.signal })
      )
    ).rejects.toThrow(CancelledError)
  })

  it('converts a mixed zip with json, csv, and markdown files', async () => {
    const bytes = await createZipBuffer({
      'data.json': JSON.stringify({ key: 'value' }),
      'table.csv': 'A,B\n1,2',
      'notes.md': '# Notes\n- bullet point'
    })

    const result = await zipConverter.convert(
      { name: 'mixed.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('# File: data.json')
    expect(result.markdown).toContain('"key": "value"')
    expect(result.markdown).toContain('# File: table.csv')
    expect(result.markdown).toContain('| A | B |')
    expect(result.markdown).toContain('# File: notes.md')
    expect(result.markdown).toContain('- bullet point')
  })

  it('skips entries exceeding per-file size limit during inflation and emits warning', async () => {
    const bytes = await createZipBuffer({
      'file1.txt': 'ok',
      'big.txt': 'will be simulated as big'
    })
    const loadedZip = await JSZip.loadAsync(bytes)
    const bigEntry = loadedZip.file('big.txt')!
    vi.spyOn(bigEntry, 'async').mockResolvedValue(
      new ArrayBuffer(ZIP_MAX_FILE_BYTES + 10)
    )

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(loadedZip)

    const result = await zipConverter.convert(
      { name: 'bigentry.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.warnings.some((w) => w.code === 'ZIP_LIMIT_REACHED')).toBe(
      true
    )
    expect(result.markdown).toContain('# File: file1.txt')
    expect(result.markdown).not.toContain('# File: big.txt')

    vi.restoreAllMocks()
  })

  it('halts and emits warning when total uncompressed bytes limit is exceeded during inflation', async () => {
    const bytes = await createZipBuffer({
      'a.txt': 'part1',
      'b.txt': 'part2',
      'c.txt': 'part3',
      'd.txt': 'part4',
      'e.txt': 'part5',
      'f.txt': 'part6'
    })
    const loadedZip = await JSZip.loadAsync(bytes)
    // buffer per entry is under 50MB per-file limit, but 5 entries reach > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES
    const entrySize = Math.floor(ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES / 4.5)
    const mockBuffer = new Uint8Array(entrySize).fill(0x61)
    for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt']) {
      const entry = loadedZip.file(name)!
      vi.spyOn(entry, 'async').mockResolvedValue(mockBuffer.buffer)
    }

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(loadedZip)

    const result = await zipConverter.convert(
      { name: 'huge.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.warnings.some((w) => w.code === 'ZIP_LIMIT_REACHED')).toBe(
      true
    )
    expect(result.markdown).toContain('# File: a.txt')
    expect(result.markdown).not.toContain('# File: f.txt')

    vi.restoreAllMocks()
  })

  it('halts and emits warning when total output characters exceed ZIP_MAX_OUTPUT_CHARS', async () => {
    const bytes = await createZipBuffer({
      'a.txt': 'a'.repeat(ZIP_MAX_OUTPUT_CHARS + 10),
      'b.txt': 'second'
    })

    const result = await zipConverter.convert(
      { name: 'bigoutput.zip', mime: 'application/zip', bytes },
      makeContext()
    )

    expect(result.warnings.some((w) => w.code === 'ZIP_LIMIT_REACHED')).toBe(
      true
    )
    expect(result.markdown).toContain('# File: a.txt')
    expect(result.markdown).not.toContain('# File: b.txt')
  })

  it('aborts mid-archive when signal is aborted during loop', async () => {
    const controller = new AbortController()
    const bytes = await createZipBuffer({
      'a.txt': 'first',
      'b.txt': 'second'
    })

    let step = 0
    const ctx = makeContext({
      signal: controller.signal,
      onProgress: () => {
        step++
        if (step === 1) {
          controller.abort()
        }
      }
    })

    await expect(
      zipConverter.convert(
        { name: 'cancel_mid.zip', mime: 'application/zip', bytes },
        ctx
      )
    ).rejects.toThrow(CancelledError)
  })
})
