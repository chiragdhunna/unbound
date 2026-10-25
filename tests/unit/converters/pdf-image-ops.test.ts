// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as legacyPdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { decideOcrPages } from '../../../src/converters/ocr/decide'
import {
  extractPages,
  hasImageOpsFromOperatorList,
  hasLargeImageFromOperatorList,
  MAX_TEXT_PAGES_FOR_IMAGE_DETECTION,
  OPS_CODES,
  TRANSFORM_OPS,
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

describe('hasLargeImageFromOperatorList', () => {
  const { OPS } = legacyPdfjs

  it('returns true when an image occupies >= 30% of page area', () => {
    // 600 x 400 image on 600 x 800 page = 240,000 / 480,000 = 50% >= 30%
    const operatorList = {
      fnArray: [TRANSFORM_OPS.transform, OPS.paintImageXObject],
      argsArray: [[600, 0, 0, 400, 0, 0], []]
    }
    expect(hasLargeImageFromOperatorList(operatorList, 600, 800, 0.3)).toBe(true)
  })

  it('returns false when an image occupies < 30% of page area', () => {
    // 100 x 100 image on 600 x 800 page = 10,000 / 480,000 = ~2% < 30%
    const operatorList = {
      fnArray: [TRANSFORM_OPS.transform, OPS.paintImageXObject],
      argsArray: [[100, 0, 0, 100, 0, 0], []]
    }
    expect(hasLargeImageFromOperatorList(operatorList, 600, 800, 0.3)).toBe(false)
  })

  it('tracks transformation matrix stack with save and restore', () => {
    // Large transform is saved, then inside a restore a small transform is painted
    const operatorList = {
      fnArray: [
        TRANSFORM_OPS.save,
        TRANSFORM_OPS.transform, // large: 500x500
        TRANSFORM_OPS.restore,   // restores to 1x1
        TRANSFORM_OPS.transform, // small: 50x50
        OPS.paintImageXObject
      ],
      argsArray: [
        [],
        [500, 0, 0, 500, 0, 0],
        [],
        [50, 0, 0, 50, 0, 0],
        []
      ]
    }
    // 50x50 on 600x800 is < 30%
    expect(hasLargeImageFromOperatorList(operatorList, 600, 800, 0.3)).toBe(false)
  })

  it('returns false when page width or height is 0', () => {
    const operatorList = {
      fnArray: [TRANSFORM_OPS.transform, OPS.paintImageXObject],
      argsArray: [[600, 0, 0, 400, 0, 0], []]
    }
    expect(hasLargeImageFromOperatorList(operatorList, 0, 800)).toBe(false)
    expect(hasLargeImageFromOperatorList(operatorList, 600, 0)).toBe(false)
  })

  it('falls back to hasImageOpsFromOperatorList when argsArray is missing', () => {
    const operatorList = {
      fnArray: [OPS.paintImageXObject]
    }
    expect(hasLargeImageFromOperatorList(operatorList, 600, 800)).toBe(true)
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

  it('detects large embedded images on text pages when detectEmbeddedImages is enabled', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([600, 800])
    page.drawText('This is plenty of selectable text to make it a text-rich page.', {
      x: 50,
      y: 750,
      size: 14,
      font
    })
    const img = await doc.embedPng(PNG_1X1)
    // 500x500 on 600x800 page = 250,000 / 480,000 = 52% >= 30%
    page.drawImage(img, { x: 50, y: 100, width: 500, height: 500 })
    const pdfBytes = await doc.save()

    const withoutOption = await extractPages(legacyPdfjs as unknown as PdfjsLike, pdfBytes, {
      detectEmbeddedImages: false
    })
    expect(withoutOption[0]?.hasLargeImage).toBeFalsy()

    const withOption = await extractPages(legacyPdfjs as unknown as PdfjsLike, pdfBytes, {
      detectEmbeddedImages: true
    })
    expect(withOption[0]?.hasLargeImage).toBe(true)
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

  it('caps embedded image detection to MAX_TEXT_PAGES_FOR_IMAGE_DETECTION: page 20 detected, page 21 not', async () => {
    expect(MAX_TEXT_PAGES_FOR_IMAGE_DETECTION).toBe(20)
    // 25 text-rich pages
    const textPages = Array.from({ length: 25 }, (_, i) => `Page ${i + 1} has plenty of selectable text to count as text-rich.`)
    const { pdfjs, getOperatorList } = fakePdfjs(textPages)
    const pages = await extractPages(pdfjs, new Uint8Array(1), {
      detectEmbeddedImages: true
    })

    // getOperatorList must only be called for the first 20 text pages
    expect(getOperatorList).toHaveBeenCalledTimes(20)

    // Page 20 (index 19) is detected with hasLargeImage = true
    expect(pages[19]?.hasLargeImage).toBe(true)

    // Page 21 (index 20) and page 22 (index 21) are capped: hasLargeImage = false
    expect(pages[20]?.hasLargeImage).toBe(false)
    expect(pages[21]?.hasLargeImage).toBe(false)
  })

  it('preserves low-text page fail-open routing to OCR even after page 20', async () => {
    // 20 text-rich pages, then a low-text page at position 21, then a text page at 22
    const mixed = [
      ...Array.from({ length: 20 }, (_, i) => `Page ${i + 1} has plenty of selectable text.`),
      'scanned', // < 25 chars -> low-text page!
      'Page 22 has plenty of selectable text.'
    ]
    const { pdfjs, getOperatorList } = fakePdfjs(mixed)
    const pages = await extractPages(pdfjs, new Uint8Array(1), {
      detectEmbeddedImages: true
    })

    // 20 text pages + 1 low-text page = 21 getOperatorList calls
    expect(getOperatorList).toHaveBeenCalledTimes(21)

    // Routing for low-text page (index 20) is unaffected and routes to OCR
    const decisions = decideOcrPages(pages)
    expect(decisions[20]?.reason).toBe('image-only')
    expect(pages[20]?.hasImageOps).toBe(true)

    // Page 22 (index 21) was the 21st text page so it was not checked for large images
    expect(pages[21]?.hasLargeImage).toBe(false)
    expect(decisions[21]?.reason).toBe('text')
  })
})
