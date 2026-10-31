import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { epubConverter } from '../../../src/converters/epub'
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

async function buildEpubBuffer(opts: {
  title?: string
  author?: string
  chapters?: Array<{
    id: string
    href: string
    content: string
    title?: string
    linear?: boolean
  }>
  manifestOrder?: string[]
  opfDir?: string
  imagesCount?: number
  drm?: boolean | 'rights' | 'font-only'
  customOpf?: string
  skipContainer?: boolean
  skipOpf?: boolean
}): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  if (!opts.skipContainer) {
    const opfPath = opts.opfDir ? `${opts.opfDir}/content.opf` : 'content.opf'
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    )
  }

  if (opts.drm === 'rights') {
    zip.file('META-INF/rights.xml', '<rights>protected</rights>')
  } else if (opts.drm === true) {
    zip.file(
      'META-INF/encryption.xml',
      `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData>
    <EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
    <CipherData>
      <CipherReference URI="chapter1.xhtml"/>
    </CipherData>
  </EncryptedData>
</encryption>`
    )
  } else if (opts.drm === 'font-only') {
    zip.file(
      'META-INF/encryption.xml',
      `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData>
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData>
      <CipherReference URI="fonts/custom.otf"/>
    </CipherData>
  </EncryptedData>
</encryption>`
    )
  }

  const chapters = opts.chapters ?? [
    {
      id: 'ch1',
      href: 'chapter1.xhtml',
      title: 'Chapter One',
      content: '<p>This is the first chapter content.</p>'
    }
  ]

  const opfDir = opts.opfDir ?? ''
  const opfFile = opfDir ? `${opfDir}/content.opf` : 'content.opf'

  if (!opts.skipOpf) {
    if (opts.customOpf) {
      zip.file(opfFile, opts.customOpf)
    } else {
      const manifestIds = opts.manifestOrder ?? chapters.map((c) => c.id)
      const manifestEntries = manifestIds
        .map((id) => {
          const ch = chapters.find((c) => c.id === id)
          if (!ch) return ''
          return `<item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`
        })
        .join('\n    ')

      const spineEntries = chapters
        .map(
          (c) =>
            `<itemref idref="${c.id}"${c.linear === false ? ' linear="no"' : ''}/>`
        )
        .join('\n    ')

      const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${opts.title ? `<dc:title>${opts.title}</dc:title>` : ''}
    ${opts.author ? `<dc:creator>${opts.author}</dc:creator>` : ''}
  </metadata>
  <manifest>
    ${manifestEntries}
  </manifest>
  <spine>
    ${spineEntries}
  </spine>
</package>`
      zip.file(opfFile, opfContent)
    }
  }

  for (const ch of chapters) {
    const fullHref = opfDir ? `${opfDir}/${ch.href}` : ch.href
    const html = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${ch.title ?? ''}</title>
  </head>
  <body>
    ${ch.title ? `<h1>${ch.title}</h1>` : ''}
    ${ch.content}
    ${opts.imagesCount ? '<img src="cover.jpg" alt="cover"/>'.repeat(opts.imagesCount) : ''}
  </body>
</html>`
    zip.file(fullHref, html)
  }

  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('epubConverter', () => {
  it('converts EPUB with metadata header and correct chapter titles', async () => {
    const bytes = await buildEpubBuffer({
      title: 'Moby Dick',
      author: 'Herman Melville',
      chapters: [
        {
          id: 'c1',
          href: 'c1.xhtml',
          title: 'Loomings',
          content: '<p>Call me Ishmael.</p>'
        },
        {
          id: 'c2',
          href: 'c2.xhtml',
          title: 'The Carpet-Bag',
          content: '<p>I stuffed a shirt or two into my old carpet-bag.</p>'
        }
      ]
    })

    const ctx = makeContext()
    const result = await epubConverter.convert(
      { name: 'moby.epub', mime: 'application/epub+zip', bytes },
      ctx
    )

    expect(result.markdown).toContain('# Moby Dick')
    expect(result.markdown).toContain('*By Herman Melville*')
    expect(result.markdown).toContain('## Loomings')
    expect(result.markdown).toContain('Call me Ishmael.')
    expect(result.markdown).toContain('## The Carpet-Bag')
    expect(result.markdown).toContain(
      'I stuffed a shirt or two into my old carpet-bag.'
    )
    expect(result.stats.pages).toBe(2)
    expect(ctx.onProgress).toHaveBeenCalledWith({
      phase: 'epub',
      current: 1,
      total: 2
    })
    expect(ctx.onProgress).toHaveBeenCalledWith({
      phase: 'epub',
      current: 2,
      total: 2
    })
  })

  it('respects spine reading order even when manifest or files are ordered differently', async () => {
    const bytes = await buildEpubBuffer({
      title: 'Ordered Book',
      chapters: [
        {
          id: 'part2',
          href: 'part2.xhtml',
          title: 'Second Part',
          content: '<p>This was written second.</p>'
        },
        {
          id: 'part1',
          href: 'part1.xhtml',
          title: 'First Part',
          content: '<p>This was written first.</p>'
        }
      ],
      manifestOrder: ['part1', 'part2']
    })

    const result = await epubConverter.convert(
      { name: 'ordered.epub', mime: 'application/epub+zip', bytes },
      makeContext()
    )

    const posPart2 = result.markdown.indexOf('Second Part')
    const posPart1 = result.markdown.indexOf('First Part')
    expect(posPart2).toBeLessThan(posPart1)
  })

  it('falls back to Chapter N when chapter has no title or heading', async () => {
    const bytes = await buildEpubBuffer({
      chapters: [
        {
          id: 'c1',
          href: 'text.xhtml',
          content: '<p>Just raw paragraph text without any heading.</p>'
        }
      ]
    })

    const result = await epubConverter.convert(
      { name: 'untitled.epub', mime: 'application/epub+zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('## Chapter 1')
    expect(result.markdown).toContain(
      'Just raw paragraph text without any heading.'
    )
  })

  it('resolves nested hrefs containing ../ correctly', async () => {
    const bytes = await buildEpubBuffer({
      title: 'Nested Book',
      opfDir: 'OPS',
      chapters: [
        {
          id: 'c1',
          href: 'sub/../c1.xhtml',
          title: 'Nested Chapter',
          content: '<p>Resolved through parent navigation.</p>'
        }
      ]
    })

    const result = await epubConverter.convert(
      { name: 'nested.epub', mime: 'application/epub+zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain('## Nested Chapter')
    expect(result.markdown).toContain('Resolved through parent navigation.')
  })

  it('counts omitted images and emits EPUB_IMAGES_OMITTED warning', async () => {
    const bytes = await buildEpubBuffer({
      title: 'Illustrated Book',
      chapters: [
        {
          id: 'c1',
          href: 'ch1.xhtml',
          title: 'Illustrated Chapter',
          content: '<p>Look at the picture.</p>'
        }
      ],
      imagesCount: 3
    })

    const result = await epubConverter.convert(
      { name: 'illustrated.epub', mime: 'application/epub+zip', bytes },
      makeContext()
    )

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('EPUB_IMAGES_OMITTED')
    expect(result.warnings[0]?.message).toContain('3 images were omitted')
  })

  it('throws PasswordRequiredError when EPUB contains DRM encryption or rights.xml', async () => {
    const drmBytes = await buildEpubBuffer({ drm: true })
    await expect(
      epubConverter.convert(
        { name: 'drm.epub', mime: 'application/epub+zip', bytes: drmBytes },
        makeContext()
      )
    ).rejects.toThrow(PasswordRequiredError)

    const rightsBytes = await buildEpubBuffer({ drm: 'rights' })
    await expect(
      epubConverter.convert(
        {
          name: 'rights.epub',
          mime: 'application/epub+zip',
          bytes: rightsBytes
        },
        makeContext()
      )
    ).rejects.toThrow(PasswordRequiredError)
  })

  it('allows benign font obfuscation in encryption.xml without throwing DRM error', async () => {
    const fontBytes = await buildEpubBuffer({
      title: 'Custom Font Book',
      drm: 'font-only',
      chapters: [
        {
          id: 'c1',
          href: 'c1.xhtml',
          title: 'Font Chapter',
          content: '<p>Content using embedded font.</p>'
        }
      ]
    })

    const result = await epubConverter.convert(
      { name: 'font.epub', mime: 'application/epub+zip', bytes: fontBytes },
      makeContext()
    )

    expect(result.markdown).toContain('Content using embedded font.')
  })

  it('throws CorruptFileError for corrupted zip bytes or missing container', async () => {
    const corruptBytes = new Uint8Array([1, 2, 3, 4, 5]).buffer
    await expect(
      epubConverter.convert(
        {
          name: 'corrupt.epub',
          mime: 'application/epub+zip',
          bytes: corruptBytes
        },
        makeContext()
      )
    ).rejects.toThrow(CorruptFileError)

    const noContainerBytes = await buildEpubBuffer({ skipContainer: true })
    await expect(
      epubConverter.convert(
        {
          name: 'no-container.epub',
          mime: 'application/epub+zip',
          bytes: noContainerBytes
        },
        makeContext()
      )
    ).rejects.toThrow(CorruptFileError)
  })

  it('throws NoTextFoundError when EPUB has empty chapters', async () => {
    const emptyBytes = await buildEpubBuffer({
      chapters: [
        {
          id: 'empty',
          href: 'empty.xhtml',
          content: ''
        }
      ]
    })

    await expect(
      epubConverter.convert(
        { name: 'empty.epub', mime: 'application/epub+zip', bytes: emptyBytes },
        makeContext()
      )
    ).rejects.toThrow(NoTextFoundError)
  })

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    const bytes = await buildEpubBuffer({})
    await expect(
      epubConverter.convert(
        { name: 'cancel.epub', mime: 'application/epub+zip', bytes },
        makeContext({ signal: controller.signal })
      )
    ).rejects.toThrow(CancelledError)
  })

  it('guards against oversized entries (zip-bomb guard)', async () => {
    const bytes = await buildEpubBuffer({
      chapters: [
        { id: 'ch1', href: 'ch1.xhtml', content: '<p>normal text</p>' }
      ]
    })

    const loadedZip = await JSZip.loadAsync(bytes)
    const bigEntry = loadedZip.file('ch1.xhtml') as unknown as {
      _data: { uncompressedSize: number }
    }
    bigEntry._data = { uncompressedSize: 25 * 1024 * 1024 }

    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(loadedZip)

    await expect(
      epubConverter.convert(
        { name: 'bomb.epub', mime: 'application/epub+zip', bytes },
        makeContext()
      )
    ).rejects.toThrow(TooLargeError)

    vi.restoreAllMocks()
  })

  it('converts external links without fetching remote resources', async () => {
    const bytes = await buildEpubBuffer({
      title: 'Links Book',
      chapters: [
        {
          id: 'c1',
          href: 'links.xhtml',
          title: 'Link Chapter',
          content:
            '<p>Visit <a href="https://example.com/info">External Site</a> for details.</p>'
        }
      ]
    })

    const result = await epubConverter.convert(
      { name: 'links.epub', mime: 'application/epub+zip', bytes },
      makeContext()
    )

    expect(result.markdown).toContain(
      '[External Site](https://example.com/info)'
    )
  })
})
