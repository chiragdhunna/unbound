import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as legacyPdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs'
import { pdfConverter } from '../../src/converters/pdf'
import { getPdfjs } from '../../src/converters/pdf/worker'
import { docxConverter } from '../../src/converters/docx'
import { xlsxConverter } from '../../src/converters/xlsx'
import { pptxConverter } from '../../src/converters/pptx'
import { epubConverter } from '../../src/converters/epub'
import { zipConverter } from '../../src/converters/zip'
import { type ConvertContext } from '../../src/core/types'

vi.mock('../../src/converters/pdf/worker', () => ({
  getPdfjs: vi.fn()
}))

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

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

describe('Performance budgets (E5)', () => {
  beforeEach(() => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
  })

  it('converts a typical 20-page PDF in < 5 seconds', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 20; i++) {
      const page = doc.addPage([612, 792])
      page.drawText(`Chapter ${i + 1}: Overview of Section ${i + 1}`, {
        x: 50,
        y: 700,
        size: 18,
        font
      })
      page.drawText(
        'This is a typical body paragraph spanning multiple lines in a document.',
        { x: 50, y: 650, size: 12, font }
      )
      page.drawText(
        'Second line with some key metrics: item count = 42, latency = 12ms.',
        { x: 50, y: 630, size: 12, font }
      )
    }
    const pdfBytes = await doc.save()

    const start = performance.now()
    const result = await pdfConverter.convert(
      {
        name: 'typical-20page.pdf',
        mime: 'application/pdf',
        bytes: toArrayBuffer(pdfBytes)
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Chapter 1')
    expect(result.markdown).toContain('Chapter 20')
    expect(elapsed).toBeLessThan(5000)
  }, 10000)

  it('converts a typical DOCX in < 5 seconds', async () => {
    const paragraphs: Paragraph[] = []
    for (let i = 0; i < 50; i++) {
      paragraphs.push(
        new Paragraph({
          text: `Section Heading ${i + 1}`,
          heading: HeadingLevel.HEADING_2
        }),
        new Paragraph({
          children: [
            new TextRun(`Detailed content paragraph ${i + 1} with text data.`)
          ]
        })
      )
    }
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }]
    })
    const buffer = await Packer.toBuffer(doc)
    const bytes = new Uint8Array(buffer)

    const start = performance.now()
    const result = await docxConverter.convert(
      {
        name: 'typical.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: toArrayBuffer(bytes)
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Section Heading 1')
    expect(elapsed).toBeLessThan(5000)
  }, 10000)

  it('converts a typical XLSX in < 5 seconds', async () => {
    const wb = XLSX.utils.book_new()
    for (let s = 1; s <= 3; s++) {
      const data: (string | number)[][] = [['ID', 'Name', 'Value', 'Score']]
      for (let r = 1; r <= 100; r++) {
        data.push([r, `User_${r}`, r * 10.5, r % 2 === 0 ? 'Pass' : 'Fail'])
      }
      const ws = XLSX.utils.aoa_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, `Sheet${s}`)
    }
    const wbBuf = XLSX.write(wb, {
      type: 'array',
      bookType: 'xlsx'
    }) as ArrayBuffer

    const start = performance.now()
    const result = await xlsxConverter.convert(
      {
        name: 'typical.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        bytes: wbBuf
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Sheet1')
    expect(result.markdown).toContain('User_1')
    expect(elapsed).toBeLessThan(5000)
  }, 10000)

  it('converts a typical PPTX in < 5 seconds', async () => {
    const pptx = new pptxgen()
    for (let i = 1; i <= 10; i++) {
      const slide = pptx.addSlide()
      slide.addText(`Slide ${i} Title`, { x: 1, y: 1, fontSize: 20 })
      slide.addText(
        `Slide ${i} key points and bullet points describing the topic.`,
        { x: 1, y: 2, fontSize: 14 }
      )
    }
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer

    const start = performance.now()
    const result = await pptxConverter.convert(
      {
        name: 'typical.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: toArrayBuffer(new Uint8Array(buf))
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Slide 1 Title')
    expect(elapsed).toBeLessThan(5000)
  }, 10000)

  it('converts a large 320-page PDF in < 60 seconds', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let i = 0; i < 320; i++) {
      const page = doc.addPage([612, 792])
      page.drawText(`Page ${i + 1} heading summary`, {
        x: 50,
        y: 700,
        size: 14,
        font
      })
      page.drawText(`Body text line on page ${i + 1} with analytical data.`, {
        x: 50,
        y: 660,
        size: 11,
        font
      })
    }
    const pdfBytes = await doc.save()

    const start = performance.now()
    const result = await pdfConverter.convert(
      {
        name: 'large-320page.pdf',
        mime: 'application/pdf',
        bytes: toArrayBuffer(pdfBytes)
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Page 1 heading summary')
    expect(result.markdown).toContain('Page 320 heading summary')
    expect(elapsed).toBeLessThan(60000)
  }, 70000)

  it('converts a ZIP of 50 small files in < 10 seconds', async () => {
    const zip = new JSZip()
    for (let i = 1; i <= 50; i++) {
      zip.file(
        `folder/file_${i}.txt`,
        `File ${i} contents line 1.\nFile ${i} contents line 2.\n`
      )
    }
    const buf = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer

    const start = performance.now()
    const result = await zipConverter.convert(
      {
        name: 'archive-50files.zip',
        mime: 'application/zip',
        bytes: toArrayBuffer(new Uint8Array(buf))
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('File 1 contents')
    expect(result.markdown).toContain('File 50 contents')
    expect(elapsed).toBeLessThan(10000)
  }, 15000)

  it('converts an EPUB with 200 chapters in < 5 seconds', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    )

    let manifestItems = ''
    let spineItems = ''
    for (let i = 1; i <= 200; i++) {
      manifestItems += `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>\n`
      spineItems += `<itemref idref="ch${i}"/>\n`
      zip.file(
        `OEBPS/ch${i}.xhtml`,
        `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter ${i}</title></head>
  <body>
    <h2>Chapter ${i}</h2>
    <p>This is the paragraph text content for chapter ${i}.</p>
  </body>
</html>`
      )
    }

    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>200 Chapter Book</dc:title>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
    zip.file('OEBPS/content.opf', opf)

    const buf = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer

    const start = performance.now()
    const result = await epubConverter.convert(
      {
        name: 'book-200ch.epub',
        mime: 'application/epub+zip',
        bytes: toArrayBuffer(new Uint8Array(buf))
      },
      makeContext()
    )
    const elapsed = performance.now() - start

    expect(result.markdown).toContain('Chapter 1')
    expect(result.markdown).toContain('Chapter 200')
    expect(elapsed).toBeLessThan(5000)
  }, 10000)
})
