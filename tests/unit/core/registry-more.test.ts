import { describe, expect, it } from 'vitest'
import { loadConverter } from '../../../src/core/registry'
import { detectFileKind } from '../../../src/core/detect'
import { UnsupportedFormatError } from '../../../src/core/errors'

describe('converter registry', () => {
  it('loads registered converters lazily', async () => {
    for (const kind of [
      'text',
      'markdown',
      'json',
      'xml',
      'code',
      'docx'
    ] as const) {
      expect((await loadConverter(kind)).kind).toBe(kind)
    }
  })

  it('rejects unregistered kinds', async () => {
    await expect(loadConverter('legacy-office')).rejects.toBeInstanceOf(
      UnsupportedFormatError
    )
  })

  it('detects csv/tsv files and routes them to the csv converter', async () => {
    const bytes = new TextEncoder().encode(
      'name,quote\nAna,"say ""hi"""'
    ).buffer

    expect(detectFileKind({ name: 'a.csv', mime: 'text/csv', bytes })).toBe(
      'csv'
    )
    expect(
      detectFileKind({
        name: 'a.tsv',
        mime: 'text/tab-separated-values',
        bytes
      })
    ).toBe('csv')
    expect((await loadConverter('csv')).kind).toBe('csv')
  })
})
