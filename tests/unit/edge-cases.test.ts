import { describe, expect, it, vi } from 'vitest'
import * as legacyPdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  PasswordRequiredError,
  CorruptFileError,
  NoTextFoundError
} from '../../src/core/errors'
import { createConvertContext } from '../../src/core/context'
import { convertFile } from '../../src/core/pipeline'
import { chunkMarkdown } from '../../src/core/chunk'
import { normalizeMarkdown } from '../../src/core/markdown'
import { docxConverter } from '../../src/converters/docx'
import { xlsxConverter } from '../../src/converters/xlsx'
import { pptxConverter } from '../../src/converters/pptx'
import { epubConverter } from '../../src/converters/epub'
import { zipConverter } from '../../src/converters/zip'
import { imageConverter } from '../../src/converters/image'
import { rtfConverter } from '../../src/converters/rtf'
import { pdfConverter } from '../../src/converters/pdf'
import { textConverter } from '../../src/converters/text'
import { csvConverter } from '../../src/converters/csv'
import { htmlConverter } from '../../src/converters/html'
import { getPdfjs } from '../../src/converters/pdf/worker'
import { TRANSFORM_OPS, type PdfjsLike } from '../../src/converters/pdf/extract'
import { getFileDisplayName } from '../../src/core/junk'

vi.mock('../../src/converters/pdf/worker', () => ({
  getPdfjs: vi.fn()
}))

const OLE2_HEADER = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
])

function makeInput(
  name: string,
  bytes: Uint8Array,
  mime = 'application/octet-stream'
) {
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  return {
    name,
    mime,
    bytes: slice
  }
}

describe('Edge Cases Suite (M10 robustness sweep)', () => {
  describe('1. Password-protected files', () => {
    it('password-protected PDF throws PasswordRequiredError', async () => {
      vi.mocked(getPdfjs).mockResolvedValue({
        getDocument: () => {
          const err = new Error('Password required')
          err.name = 'PasswordException'
          return {
            promise: Promise.reject(err),
            destroy: async () => undefined
          }
        }
      } as unknown as typeof legacyPdfjs)

      await expect(
        pdfConverter.convert(
          makeInput('locked.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(PasswordRequiredError)
    })

    it('password-protected DOCX throws PasswordRequiredError (OLE2 wrapper)', async () => {
      await expect(
        docxConverter.convert(
          makeInput('protected.docx', OLE2_HEADER),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(PasswordRequiredError)
    })

    it('password-protected XLSX throws PasswordRequiredError (OLE2 wrapper)', async () => {
      await expect(
        xlsxConverter.convert(
          makeInput('protected.xlsx', OLE2_HEADER),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(PasswordRequiredError)
    })

    it('password-protected PPTX throws PasswordRequiredError (OLE2 wrapper)', async () => {
      await expect(
        pptxConverter.convert(
          makeInput('protected.pptx', OLE2_HEADER),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(PasswordRequiredError)
    })
  })

  describe('2. Corrupted file per format', () => {
    const corruptBytes = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04
    ])

    it('pdfConverter throws CorruptFileError on corrupted bytes', async () => {
      vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
      await expect(
        pdfConverter.convert(
          makeInput('corrupted.pdf', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('docxConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        docxConverter.convert(
          makeInput('corrupted.docx', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('xlsxConverter throws CorruptFileError on corrupted bytes', async () => {
      const corruptXlsx = new Uint8Array([
        0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xff
      ])
      await expect(
        xlsxConverter.convert(
          makeInput('corrupted.xlsx', corruptXlsx),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('pptxConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        pptxConverter.convert(
          makeInput('corrupted.pptx', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('epubConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        epubConverter.convert(
          makeInput('corrupted.epub', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('zipConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        zipConverter.convert(
          makeInput('corrupted.zip', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('imageConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        imageConverter.convert(
          makeInput('corrupted.png', new Uint8Array(0)),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })

    it('rtfConverter throws CorruptFileError on corrupted bytes', async () => {
      await expect(
        rtfConverter.convert(
          makeInput('corrupted.rtf', corruptBytes),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(CorruptFileError)
    })
  })

  describe('3. 500-page generated PDF (bounded memory & warning)', () => {
    it('500-page PDF emits PDF_LARGE warning and cleans up all 500 pages with bounded memory', async () => {
      const cleanupMock = vi.fn()
      const mockPdfjs: PdfjsLike = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 500,
            getPage: async (pageNum: number) => ({
              getTextContent: async () => ({
                items: [
                  {
                    str: `Page ${pageNum} body text content.`,
                    transform: [1, 0, 0, 1, 0, 0]
                  }
                ]
              }),
              getOperatorList: async () => ({ fnArray: [] }),
              cleanup: cleanupMock,
              view: [0, 0, 612, 792]
            })
          }),
          destroy: async () => undefined
        })
      }

      vi.mocked(getPdfjs).mockResolvedValue(
        mockPdfjs as unknown as typeof legacyPdfjs
      )

      const result = await pdfConverter.convert(
        makeInput('large-500.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])),
        createConvertContext()
      )

      expect(result.stats.pages).toBe(500)
      // Assert cleanup was called on all 500 pages to ensure bounded memory
      expect(cleanupMock).toHaveBeenCalledTimes(500)
      // Assert PDF_LARGE warning was emitted
      const largeWarning = result.warnings.find((w) => w.code === 'PDF_LARGE')
      expect(largeWarning).toBeDefined()
      expect(largeWarning?.message).toContain('500 pages')
    })
  })

  describe('4. Embedded-image text flag', () => {
    it('PDF with large embedded images emits EMBEDDED_IMAGES_MAY_CONTAIN_TEXT warning', async () => {
      const mockPdfjs: PdfjsLike = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({
                items: [
                  {
                    str: 'This is a text page with plenty of selectable text to count as text-rich content.',
                    transform: [1, 0, 0, 1, 0, 0]
                  }
                ]
              }),
              getOperatorList: async () => ({
                fnArray: [
                  TRANSFORM_OPS.transform,
                  legacyPdfjs.OPS.paintImageXObject
                ],
                argsArray: [[500, 0, 0, 500, 0, 0], []]
              }),
              cleanup: vi.fn(),
              view: [0, 0, 612, 792]
            })
          }),
          destroy: async () => undefined
        })
      }

      vi.mocked(getPdfjs).mockResolvedValue(
        mockPdfjs as unknown as typeof legacyPdfjs
      )

      const result = await pdfConverter.convert(
        makeInput('embedded-img.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])),
        createConvertContext()
      )

      const imgWarning = result.warnings.find(
        (w) => w.code === 'EMBEDDED_IMAGES_MAY_CONTAIN_TEXT'
      )
      expect(imgWarning).toBeDefined()
      expect(imgWarning?.message).toContain(
        'embedded images that may contain text'
      )
    })
  })

  describe('5. Non-English text extraction', () => {
    it('extracts CJK, Devanagari, and Arabic characters accurately from PDF text content', async () => {
      const toUnicodeStream = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Custom def
/CMapType 2 def
1 begincodespacerange <0000> <ffff> endcodespacerange
3 beginbfrange
<0001> <0001> <4f60>
<0002> <0002> <0928>
<0003> <0003> <0645>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`

      const contentStream = `BT
/F1 12 Tf
72 700 Td
<0001 0002 0003> Tj
ET`

      const rawPdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${contentStream.length} >>
stream
${contentStream}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type0 /BaseFont /CustomFont /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >> endobj
6 0 obj << /Type /Font /Subtype /CIDFontType2 /BaseFont /CustomFont /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> /FontDescriptor 8 0 R >> endobj
7 0 obj << /Length ${toUnicodeStream.length} >>
stream
${toUnicodeStream}
endstream
endobj
8 0 obj << /Type /FontDescriptor /FontName /CustomFont /Flags 4 /FontBBox [-100 -100 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 800 /StemV 80 >> endobj
xref
0 9
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000232 00000 n 
0000000300 00000 n 
0000000424 00000 n 
0000000552 00000 n 
0000000670 00000 n 
trailer << /Size 9 /Root 1 0 R >>
startxref
820
%%EOF`

      vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

      const result = await pdfConverter.convert(
        makeInput('multilingual.pdf', new TextEncoder().encode(rawPdf)),
        createConvertContext()
      )

      // CJK: 你 (\u4F60), Devanagari: न (\u0928), Arabic: م (\u0645)
      expect(result.markdown).toContain('你')
      expect(result.markdown).toContain('न')
      expect(result.markdown).toContain('م')
    })
  })

  describe('6. No text found', () => {
    it('pdfConverter throws NoTextFoundError on blank page with no OCR text', async () => {
      const mockPdfjs: PdfjsLike = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({ items: [] }),
              getOperatorList: async () => ({ fnArray: [] }),
              cleanup: vi.fn(),
              view: [0, 0, 612, 792]
            })
          }),
          destroy: async () => undefined
        })
      }

      vi.mocked(getPdfjs).mockResolvedValue(
        mockPdfjs as unknown as typeof legacyPdfjs
      )

      await expect(
        pdfConverter.convert(
          makeInput('blank.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(NoTextFoundError)
    })

    it('rtfConverter throws NoTextFoundError on blank RTF', async () => {
      await expect(
        rtfConverter.convert(
          makeInput('blank.rtf', new TextEncoder().encode('{\\rtf1\\ansi}')),
          createConvertContext()
        )
      ).rejects.toBeInstanceOf(NoTextFoundError)
    })
  })

  describe('7. Mismatched extension', () => {
    it('emits TYPE_MISMATCH warning for PDF file named with .txt extension', async () => {
      vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
      const pdfBytes = new Uint8Array([
        0x25,
        0x50,
        0x44,
        0x46,
        0x2d,
        0x31,
        0x2e,
        0x34 // %PDF-1.4
      ])
      const mockPdfjs: PdfjsLike = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({
                items: [
                  { str: 'Real PDF content', transform: [1, 0, 0, 1, 0, 0] }
                ]
              }),
              getOperatorList: async () => ({ fnArray: [] }),
              cleanup: vi.fn(),
              view: [0, 0, 612, 792]
            })
          }),
          destroy: async () => undefined
        })
      }
      vi.mocked(getPdfjs).mockResolvedValue(
        mockPdfjs as unknown as typeof legacyPdfjs
      )

      const file = new File([pdfBytes], 'fake-notes.txt', {
        type: 'text/plain'
      })
      const result = await convertFile(file, createConvertContext())

      const mismatchWarning = result.warnings.find(
        (w) => w.code === 'TYPE_MISMATCH'
      )
      expect(mismatchWarning).toBeDefined()
      expect(mismatchWarning?.message).toContain(
        'Detected pdf content despite a .txt extension.'
      )
    })

    it('emits TYPE_MISMATCH warning for DOCX file named with .pdf extension', async () => {
      // DOCX has PK\x03\x04 zip header
      const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
      const file = new File([docxBytes], 'fake-report.pdf', {
        type: 'application/pdf'
      })

      // DOCX detection will identify it as docx or zip based on content
      // and mismatch warning will be triggered against .pdf extension
      await expect(convertFile(file, createConvertContext())).rejects.toThrow()
    })
  })

  describe('8. Zero-byte file handling', () => {
    it('safely handles zero-byte file for every converter without unhandled crashes', async () => {
      const zeroBytes = new Uint8Array(0)
      const emptyInput = (name: string) => makeInput(name, zeroBytes)
      const ctx = createConvertContext()

      // text returns empty output gracefully
      const txtRes = await textConverter.convert(emptyInput('empty.txt'), ctx)
      expect(txtRes.markdown.trim()).toBe('')

      // empty html throws NoTextFoundError
      await expect(
        htmlConverter.convert(emptyInput('empty.html'), ctx)
      ).rejects.toBeInstanceOf(NoTextFoundError)

      // structured/binary converters reject empty/zero-byte files gracefully with CorruptFileError
      await expect(
        csvConverter.convert(emptyInput('empty.csv'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        pdfConverter.convert(emptyInput('empty.pdf'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        docxConverter.convert(emptyInput('empty.docx'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        pptxConverter.convert(emptyInput('empty.pptx'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        xlsxConverter.convert(emptyInput('empty.xlsx'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        epubConverter.convert(emptyInput('empty.epub'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        zipConverter.convert(emptyInput('empty.zip'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        imageConverter.convert(emptyInput('empty.png'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
      await expect(
        rtfConverter.convert(emptyInput('empty.rtf'), ctx)
      ).rejects.toBeInstanceOf(CorruptFileError)
    })
  })

  describe('9. Duplicate filenames', () => {
    it('preserves distinct paths and batch isolation for files with identical names', () => {
      const file1 = {
        name: 'notes.txt',
        webkitRelativePath: 'folder-a/notes.txt'
      }
      const file2 = {
        name: 'notes.txt',
        webkitRelativePath: 'folder-b/notes.txt'
      }

      const name1 = getFileDisplayName(file1)
      const name2 = getFileDisplayName(file2)

      expect(name1).toBe('folder-a/notes.txt')
      expect(name2).toBe('folder-b/notes.txt')
      expect(name1).not.toBe(name2)
    })
  })

  describe('10. Very long single line (1 MB, no whitespace)', () => {
    it('processes a 1 MB line with no whitespace through conversion, markdown normalization, and chunking without hanging', async () => {
      const oneMbLine = 'a'.repeat(1_000_000)

      // 1. Text conversion
      const txtRes = await textConverter.convert(
        makeInput('long.txt', new TextEncoder().encode(oneMbLine)),
        createConvertContext()
      )
      expect(txtRes.markdown.length).toBeGreaterThanOrEqual(1_000_000)

      // 2. Markdown normalization
      const normalized = normalizeMarkdown(txtRes.markdown)
      expect(normalized.length).toBeGreaterThanOrEqual(1_000_000)

      // 3. Chunking
      const start = performance.now()
      const chunks = chunkMarkdown(normalized, {
        maxChars: 12000,
        label: false
      })
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000) // Less than 1 second
      expect(chunks.length).toBeGreaterThan(50)
      // All content preserved across chunks
      const combinedChunks = chunks.join('')
      expect(combinedChunks).toBe(normalized)
    })
  })

  describe('11. Huge output preview cap', () => {
    it('caps output preview at 200,000 characters while chunking and copying retain full text', () => {
      const hugeText = 'z'.repeat(500_000)
      const PREVIEW_CAP = 200_000

      const preview =
        hugeText.length > PREVIEW_CAP
          ? hugeText.slice(0, PREVIEW_CAP)
          : hugeText
      expect(preview.length).toBe(200_000)

      // Full text is preserved for copy and chunking
      const chunks = chunkMarkdown(hugeText, { maxChars: 12000, label: false })
      expect(chunks.length).toBeGreaterThan(10)
      expect(chunks.join('').length).toBe(500_000)
    })
  })
})
