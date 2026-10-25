// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as legacyPdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { decideOcrPages } from '../../../src/converters/ocr/decide'
import {
  extractPages,
  hasImageOpsFromOperatorList,
  OPS_CODES,
  type PdfjsLike
} from '../../../src/converters/pdf/extract'

// 1x1 PNG; scaled to a full page it is what a scanned page looks like to pdfjs.
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
)

const TEXT = 'This is a normal text page with plenty of characters.'

/** Builds [image-only, text, blank] as a real PDF. */
async function buildThreePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(PNG_1X1)
  doc.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([612, 792]).drawText(TEXT, { x: 50, y: 700, size: 12, font })
  doc.addPage([612, 792])
  return doc.save()
}

describe('image operator codes', () => {
  it('match the installed pdfjs OPS table, so a pdfjs upgrade that renumbers them fails here', () => {
    const { OPS } = legacyPdfjs
    expect(new Set(OPS_CODES)).toEqual(
      new Set([
        OPS.paintImageMaskXObject,
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintImageMaskXObjectRepeat
      ])
    )
  })

  it('treats generic form painting and unrelated ops as non-image', () => {
    const { OPS } = legacyPdfjs
    expect(hasImageOpsFromOperatorList({ fnArray: [OPS.paintXObject, OPS.save, OPS.restore] })).toBe(
      false
    )
    expect(hasImageOpsFromOperatorList({ fnArray: [OPS.save, OPS.paintImageXObject] })).toBe(true)
    expect(hasImageOpsFromOperatorList({ fnArray: [] })).toBe(false)
  })
})

describe('extractPages hasImageOps on real PDFs', () => {
  it('flags an image-only page, not a text page or a blank page', async () => {
    const pages = await extractPages(legacyPdfjs as unknown as PdfjsLike, await buildThreePagePdf())

    expect(pages).toHaveLength(3)
    expect(pages[0]?.items.length).toBe(0)
    expect(pages[0]?.hasImageOps).toBe(true)
    expect(pages[1]?.items.length).toBeGreaterThan(0)
    expect(pages[1]?.hasImageOps).toBe(false)
    expect(pages[2]?.hasImageOps).toBe(false)
  })

  it('feeds decideOcrPages so a scanned page is image-only, text is text, blank is empty', async () => {
    const pages = await extractPages(legacyPdfjs as unknown as PdfjsLike, await buildThreePagePdf())

    expect(decideOcrPages(pages).map((decision) => decision.reason)).toEqual([
      'image-only',
      'text',
      'empty'
    ])
    expect(decideOcrPages(pages, { forceOcr: true }).map((decision) => decision.reason)).toEqual([
      'forced',
      'forced',
      'forced'
    ])
  })
})

describe('extractPages page handling', () => {
  function fakePdfjs(textPerPage: string[]) {
    const getOperatorList = vi.fn(async () => ({ fnArray: [legacyPdfjs.OPS.paintImageXObject] }))
    const cleanup = vi.fn()
    const pdfjs: PdfjsLike = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: textPerPage.length,
          getPage: async (pageNumber: number) => ({
            getTextContent: async () => ({
              items: [{ str: textPerPage[pageNumber - 1], transform: [1, 0, 0, 1, 0, 0] }]
            }),
            getOperatorList,
            cleanup,
            view: [0, 0, 612, 792]
          })
        }),
        destroy: async () => undefined
      })
    }
    return { pdfjs, getOperatorList, cleanup }
  }

  it('releases every page after reading it', async () => {
    const { pdfjs, cleanup } = fakePdfjs(['one', 'two', 'three'])
    await extractPages(pdfjs, new Uint8Array(1))
    expect(cleanup).toHaveBeenCalledTimes(3)
  })

  it('reads the operator list only for pages with too little text to skip OCR', async () => {
    const { pdfjs, getOperatorList } = fakePdfjs(['hi', 'x'.repeat(40)])
    const pages = await extractPages(pdfjs, new Uint8Array(1))

    expect(getOperatorList).toHaveBeenCalledTimes(1)
    expect(pages[0]?.hasImageOps).toBe(true)
    expect(pages[1]?.hasImageOps).toBe(false)
  })

  it('fails open when an operator list cannot be read so low-text pages route to OCR', async () => {
    const { pdfjs, getOperatorList } = fakePdfjs(['hi'])
    getOperatorList.mockRejectedValueOnce(new Error('boom'))
    const pages = await extractPages(pdfjs, new Uint8Array(1))
    expect(pages[0]?.hasImageOps).toBe(true)
  })
})
