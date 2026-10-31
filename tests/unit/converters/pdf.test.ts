// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as legacyPdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  extractPageItems,
  type PdfjsLike
} from '../../../src/converters/pdf/extract'
import { layoutPagesToMarkdown } from '../../../src/converters/pdf/layout'
import { pdfConverter } from '../../../src/converters/pdf'
import { getPdfjs } from '../../../src/converters/pdf/worker'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  OcrFailedError,
  PasswordRequiredError,
  errorMessage
} from '../../../src/core/errors'
import { createConvertContext } from '../../../src/core/context'

const mockRecognize = vi.fn()
const mockTerminate = vi.fn().mockResolvedValue(undefined)
const mockRenderPdfPageToCanvas = vi.fn()
const mockReleaseCanvas = vi.fn()

vi.mock('../../../src/converters/pdf/worker', () => ({
  getPdfjs: vi.fn()
}))

vi.mock('../../../src/converters/ocr/engine', () => ({
  createOcrEngine: vi.fn(() => ({
    recognize: mockRecognize,
    terminate: mockTerminate
  }))
}))

vi.mock('../../../src/converters/ocr/render', () => ({
  renderPdfPageToCanvas: (...args: unknown[]) =>
    mockRenderPdfPageToCanvas(...args),
  releaseCanvas: (...args: unknown[]) => mockReleaseCanvas(...args)
}))

const goldenMarkdown = [
  '# Quarterly Budget Review',
  '',
  'This is a normal twelve point paragraph that spans two lines in the generated fixture document.',
  '',
  '- Rent 1200',
  '- Groceries 250',
  '- Savings 300',
  '',
  'Page two has a single normal paragraph of body text.'
].join('\n')

async function buildGoldenPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const pageOne = doc.addPage([612, 792])
  pageOne.drawText('Quarterly Budget Review', { x: 72, y: 700, size: 24, font })
  pageOne.drawText('This is a normal twelve point paragraph that spans', {
    x: 72,
    y: 650,
    size: 12,
    font
  })
  pageOne.drawText('two lines in the generated fixture document.', {
    x: 72,
    y: 634,
    size: 12,
    font
  })
  pageOne.drawText('- Rent 1200', { x: 72, y: 600, size: 12, font })
  pageOne.drawText('- Groceries 250', { x: 72, y: 582, size: 12, font })
  pageOne.drawText('- Savings 300', { x: 72, y: 564, size: 12, font })

  const pageTwo = doc.addPage([612, 792])
  pageTwo.drawText('Page two has a single normal paragraph of body text.', {
    x: 72,
    y: 700,
    size: 12,
    font
  })

  return doc.save()
}

async function buildBlankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([612, 792])
  doc.addPage([612, 792])
  return doc.save()
}

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82
])

async function buildImagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const img = await doc.embedPng(TINY_PNG)
  const page = doc.addPage([612, 792])
  page.drawImage(img, { x: 50, y: 50, width: 100, height: 100 })
  return doc.save()
}

async function buildMixedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792])
  p1.drawText('Page one has selectable text for layout.', {
    x: 72,
    y: 700,
    size: 12,
    font
  })
  const p2 = doc.addPage([612, 792])
  const img = await doc.embedPng(TINY_PNG)
  p2.drawImage(img, { x: 50, y: 50, width: 100, height: 100 })
  return doc.save()
}

async function buildEmbeddedImagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([600, 800])
  page.drawText(
    'This is selectable text on a page with a large embedded image.',
    {
      x: 50,
      y: 750,
      size: 12,
      font
    }
  )
  const img = await doc.embedPng(TINY_PNG)
  // 500x500 on 600x800 page = 250,000 / 480,000 = 52% >= 30%
  page.drawImage(img, { x: 50, y: 100, width: 500, height: 500 })
  return doc.save()
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function converterInput(bytes: Uint8Array) {
  return {
    name: 'fixture.pdf',
    bytes: toArrayBuffer(bytes),
    mime: 'application/pdf'
  }
}

describe('pdf extraction and conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecognize.mockReset()
    mockTerminate.mockReset().mockResolvedValue(undefined)
    mockRenderPdfPageToCanvas.mockReset().mockResolvedValue({
      canvas: {} as HTMLCanvasElement,
      width: 100,
      height: 100
    })
    mockReleaseCanvas.mockReset()
  })

  it('extracts a pdf-lib fixture through the node build and renders the golden markdown', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const pages = await extractPageItems(
      legacyPdfjs as unknown as PdfjsLike,
      await buildGoldenPdf()
    )

    expect(pages).toHaveLength(2)
    const { markdown } = layoutPagesToMarkdown(pages)
    expect(markdown).toBe(goldenMarkdown)
  })

  it('converts the golden fixture end to end with pages, warnings, and progress', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const progress: { phase: string; current: number; total: number }[] = []
    const ctx = {
      ...createConvertContext(),
      onProgress: (p: { phase: string; current: number; total: number }) =>
        progress.push(p)
    }

    const result = await pdfConverter.convert(
      converterInput(await buildGoldenPdf()),
      ctx
    )

    expect(result.markdown).toBe(`${goldenMarkdown}\n`)
    expect(result.warnings).toEqual([])
    expect(result.stats).toEqual({ pages: 2 })
    expect(progress).toEqual([
      { phase: 'pdf', current: 1, total: 2 },
      { phase: 'pdf', current: 2, total: 2 }
    ])
  })

  it('maps PasswordException to PasswordRequiredError', async () => {
    vi.mocked(getPdfjs).mockResolvedValue({
      getDocument: () => ({
        promise: Promise.reject({ name: 'PasswordException' }),
        destroy: () => Promise.resolve()
      })
    } as unknown as Awaited<ReturnType<typeof getPdfjs>>)

    await expect(
      pdfConverter.convert(
        converterInput(await buildGoldenPdf()),
        createConvertContext()
      )
    ).rejects.toBeInstanceOf(PasswordRequiredError)
  })

  it('maps garbage bytes to CorruptFileError', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await expect(
      pdfConverter.convert(converterInput(garbage), createConvertContext())
    ).rejects.toBeInstanceOf(CorruptFileError)
  })

  it('maps zero-byte input to CorruptFileError without loading pdfjs', async () => {
    const zero = new Uint8Array(0)
    await expect(
      pdfConverter.convert(converterInput(zero), createConvertContext())
    ).rejects.toBeInstanceOf(CorruptFileError)

    expect(getPdfjs).not.toHaveBeenCalled()
  })

  it('throws NoTextFoundError for a blank-page PDF (no text and no images)', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    await expect(
      pdfConverter.convert(
        converterInput(await buildBlankPdf()),
        createConvertContext()
      )
    ).rejects.toBeInstanceOf(NoTextFoundError)
  })

  it('routes a scanned PDF page with images to OCR and returns recognized markdown', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: '# SCANNED INVOICE\n\nTotal: $1,234.56',
      confidence: 88
    })

    const progress: { phase: string; current: number; total: number }[] = []
    const ctx = {
      ...createConvertContext(),
      onProgress: (p: { phase: string; current: number; total: number }) =>
        progress.push(p)
    }

    const result = await pdfConverter.convert(
      converterInput(await buildImagePdf()),
      ctx
    )

    expect(result.markdown).toBe('# SCANNED INVOICE\n\nTotal: $1,234.56\n')
    expect(result.warnings).toEqual([])
    expect(result.stats).toEqual({
      pages: 1,
      ocrPages: 1,
      ocrConfidence: 88
    })
    expect(mockRecognize).toHaveBeenCalledTimes(1)
    expect(mockRenderPdfPageToCanvas).toHaveBeenCalledTimes(1)
    expect(mockReleaseCanvas).toHaveBeenCalledTimes(1)
    expect(mockTerminate).toHaveBeenCalled()
    expect(progress.some((p) => p.phase === 'ocr')).toBe(true)
  })

  it('routes to OCR when getOperatorList throws on a low-text page (fail open)', async () => {
    const rawPdf = await buildBlankPdf()
    const realDoc = await legacyPdfjs.getDocument({ data: rawPdf.slice(0) })
      .promise

    const fakePdfjs = {
      ...legacyPdfjs,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: realDoc.numPages,
          getPage: async (num: number) => {
            const page = await realDoc.getPage(num)
            return {
              ...page,
              view: page.view,
              cleanup: () => page.cleanup(),
              getTextContent: () => page.getTextContent(),
              getOperatorList: async () => {
                throw new Error('Simulated operator list failure')
              }
            }
          }
        }),
        destroy: async () => undefined
      })
    }
    vi.mocked(getPdfjs).mockResolvedValue(
      fakePdfjs as unknown as typeof legacyPdfjs
    )
    mockRecognize
      .mockResolvedValueOnce({
        text: 'PAGE 1 RECOVERED VIA FAIL OPEN',
        confidence: 90
      })
      .mockResolvedValueOnce({
        text: 'PAGE 2 RECOVERED VIA FAIL OPEN',
        confidence: 90
      })

    const result = await pdfConverter.convert(
      converterInput(rawPdf),
      createConvertContext()
    )

    expect(result.markdown).toContain('PAGE 1 RECOVERED VIA FAIL OPEN')
    expect(result.markdown).toContain('PAGE 2 RECOVERED VIA FAIL OPEN')
    expect(result.stats.ocrPages).toBe(2)
  })

  it('routes mixed PDF pages correctly, applying page markers when requested', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: 'SCANNED PAGE TWO CONTENT',
      confidence: 88
    })

    const ctx = {
      ...createConvertContext(),
      options: { ocrLanguage: 'eng', forceOcr: false, pdfPageMarkers: true }
    }

    const result = await pdfConverter.convert(
      converterInput(await buildMixedPdf()),
      ctx
    )

    expect(result.markdown).toContain('--- Page 1 ---')
    expect(result.markdown).toContain(
      'Page one has selectable text for layout.'
    )
    expect(result.markdown).toContain('--- Page 2 ---')
    expect(result.markdown).toContain('SCANNED PAGE TWO CONTENT')
    expect(result.stats.pages).toBe(2)
    expect(result.stats.ocrPages).toBe(1)
    expect(result.stats.ocrConfidence).toBe(88)
  })

  it('warns when OCR confidence is low (< 70)', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: 'SOME UNRELIABLE SCANNED TEXT',
      confidence: 35
    })

    const result = await pdfConverter.convert(
      converterInput(await buildImagePdf()),
      createConvertContext()
    )

    expect(result.warnings).toContainEqual({
      code: 'OCR_LOW_CONFIDENCE',
      message: 'OCR output looks unreliable (mean confidence: 35%).',
      severity: 'warn'
    })
    expect(result.stats.ocrConfidence).toBe(35)
  })

  it('warns with "Low OCR confidence" when mean confidence is between 40 and 69', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: 'SOME REASONABLY DETECTED TEXT OVER TEN CHARS',
      confidence: 55
    })

    const result = await pdfConverter.convert(
      converterInput(await buildImagePdf()),
      createConvertContext()
    )

    expect(result.warnings).toContainEqual({
      code: 'OCR_LOW_CONFIDENCE',
      message: 'Low OCR confidence (mean confidence: 55%).',
      severity: 'warn'
    })
    expect(result.stats.ocrConfidence).toBe(55)
  })

  it('warns with "OCR output looks unreliable" when extracted text is less than 10 characters', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: 'ABC',
      confidence: 90
    })

    const result = await pdfConverter.convert(
      converterInput(await buildImagePdf()),
      createConvertContext()
    )

    expect(result.warnings).toContainEqual({
      code: 'OCR_LOW_CONFIDENCE',
      message: 'OCR output looks unreliable (mean confidence: 90%).',
      severity: 'warn'
    })
  })

  it('detects embedded images on text pages and emits EMBEDDED_IMAGES_MAY_CONTAIN_TEXT warning', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const result = await pdfConverter.convert(
      converterInput(await buildEmbeddedImagePdf()),
      createConvertContext()
    )

    expect(result.markdown).toContain('This is selectable text')
    expect(result.warnings).toContainEqual({
      code: 'EMBEDDED_IMAGES_MAY_CONTAIN_TEXT',
      message: 'This PDF contains embedded images that may contain text.',
      severity: 'info'
    })
    expect(result.stats.ocrPages).toBeUndefined()
  })

  it('routes all pages to OCR without embedded images warning when forceOcr is true', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: 'FORCED OCR RECOGNIZED TEXT FROM EMBEDDED IMAGE',
      confidence: 95
    })

    const baseCtx = createConvertContext()
    const ctx = {
      ...baseCtx,
      options: { ...baseCtx.options, forceOcr: true, pdfPageMarkers: false }
    }

    const result = await pdfConverter.convert(
      converterInput(await buildEmbeddedImagePdf()),
      ctx
    )

    expect(result.markdown).toContain(
      'FORCED OCR RECOGNIZED TEXT FROM EMBEDDED IMAGE'
    )
    expect(result.stats.ocrPages).toBe(1)
    expect(
      result.warnings.some((w) => w.code === 'EMBEDDED_IMAGES_MAY_CONTAIN_TEXT')
    ).toBe(false)
  })

  it('throws NoTextFoundError when OCR produces only whitespace', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockResolvedValueOnce({
      text: '   \n  ',
      confidence: 10
    })

    await expect(
      pdfConverter.convert(
        converterInput(await buildImagePdf()),
        createConvertContext()
      )
    ).rejects.toBeInstanceOf(NoTextFoundError)
  })

  it('propagates CancelledError and cleans up when aborted during OCR', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    const controller = new AbortController()
    mockRecognize.mockImplementationOnce(
      async (_canvas: unknown, options?: { signal?: AbortSignal }) => {
        if (!options?.signal) {
          return { text: 'COMPLETED WITHOUT SIGNAL', confidence: 90 }
        }
        controller.abort()
        throw new CancelledError()
      }
    )

    const ctx = {
      ...createConvertContext(),
      signal: controller.signal
    }

    await expect(
      pdfConverter.convert(converterInput(await buildImagePdf()), ctx)
    ).rejects.toBeInstanceOf(CancelledError)
    expect(mockTerminate).toHaveBeenCalled()
  })

  it('throws CancelledError when the signal is already aborted', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const ctx = createConvertContext()
    const controller = new AbortController()
    controller.abort()
    const abortedCtx = { ...ctx, signal: controller.signal }

    await expect(
      pdfConverter.convert(converterInput(await buildGoldenPdf()), abortedCtx)
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('rejects items without a str and reports progress per page', async () => {
    const fakePdfjs: PdfjsLike = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: () =>
            Promise.resolve({
              getTextContent: () =>
                Promise.resolve({
                  items: [
                    {
                      str: 'Hello',
                      transform: [1, 0, 0, 1, 72, 700],
                      height: 12,
                      width: 40
                    },
                    { type: 'beginMarkedContent' },
                    {
                      str: '',
                      transform: [1, 0, 0, 1, 0, 0],
                      height: 0,
                      width: 0
                    }
                  ]
                }),
              getOperatorList: () =>
                Promise.resolve({
                  fnArray: [1, 2, 3]
                }),
              cleanup: () => undefined
            })
        }),
        destroy: () => Promise.resolve()
      })
    }

    const progress: { phase: string; current: number; total: number }[] = []
    const pages = await extractPageItems(fakePdfjs, new Uint8Array([1, 2]), {
      onProgress: (p) => progress.push(p)
    })

    expect(pages).toHaveLength(2)
    // items without a `str` (marked-content) are skipped; empty strings survive
    // extraction and are dropped later by the layout rules
    expect(pages[0]).toEqual([
      { str: 'Hello', x: 72, y: 700, height: 12, width: 40 },
      { str: '', x: 0, y: 0, height: 0, width: 0 }
    ])
    expect(progress).toEqual([
      { phase: 'pdf', current: 1, total: 2 },
      { phase: 'pdf', current: 2, total: 2 }
    ])
  })

  it('throws OcrFailedError with an actionable message when extraction encounters a missing browser feature (never NoTextFoundError)', async () => {
    vi.mocked(getPdfjs).mockResolvedValueOnce({
      getDocument: () => ({
        promise: Promise.reject(
          new TypeError('Map.prototype.getOrInsertComputed is not a function')
        ),
        destroy: () => Promise.resolve()
      })
    } as unknown as Awaited<ReturnType<typeof getPdfjs>>)

    const error = await pdfConverter
      .convert(converterInput(await buildGoldenPdf()), createConvertContext())
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(OcrFailedError)
    expect(error).not.toBeInstanceOf(NoTextFoundError)
    expect(errorMessage(error)).toContain('missing a feature')
    expect(errorMessage(error)).toContain('Map.prototype.getOrInsertComputed')
    expect(errorMessage(error)).toContain('update your browser')
  })

  it('throws OcrFailedError with an actionable message when page OCR encounters a missing browser feature (never NoTextFoundError)', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)
    mockRecognize.mockRejectedValueOnce(
      new TypeError('WebAssembly.instantiateStreaming is not a function')
    )

    const error = await pdfConverter
      .convert(converterInput(await buildImagePdf()), createConvertContext())
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(OcrFailedError)
    expect(error).not.toBeInstanceOf(NoTextFoundError)
    expect(errorMessage(error)).toContain('missing a feature')
    expect(errorMessage(error)).toContain('WebAssembly.instantiateStreaming')
    expect(errorMessage(error)).toContain('update your browser')
  })
})

describe('pdf header/footer removal, large PDFs and page markers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecognize.mockReset()
    mockTerminate.mockReset().mockResolvedValue(undefined)
    mockRenderPdfPageToCanvas.mockReset().mockResolvedValue({
      canvas: {} as HTMLCanvasElement,
      width: 100,
      height: 100
    })
    mockReleaseCanvas.mockReset()
  })

  it('strips repeated headers and footers and emits the removal warning', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)

    for (let index = 1; index <= 4; index += 1) {
      const page = doc.addPage([612, 792])
      page.drawText('ACME Corp Confidential', { x: 72, y: 780, size: 9, font })
      page.drawText(`Page ${index}`, { x: 72, y: 20, size: 9, font })
      page.drawText(`Body line one on page ${index}.`, {
        x: 72,
        y: 700,
        size: 12,
        font
      })
      page.drawText(`Body line two on page ${index}.`, {
        x: 72,
        y: 682,
        size: 12,
        font
      })
    }

    const result = await pdfConverter.convert(
      converterInput(await doc.save()),
      createConvertContext()
    )

    expect(result.markdown).not.toContain('ACME Corp Confidential')
    expect(result.markdown).not.toContain('Page 1')
    expect(result.markdown).toContain('Body line one on page 1.')
    expect(result.markdown).toContain('Body line two on page 4.')
    expect(result.warnings).toContainEqual({
      code: 'PDF_BANDS_REMOVED',
      message: 'Repeated headers, footers and page numbers were removed.',
      severity: 'info'
    })
    expect(result.stats.pages).toBe(4)
  })

  it('converts a 320-page PDF with the large-PDF warning under 60 seconds', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)

    for (let index = 1; index <= 320; index += 1) {
      const page = doc.addPage([612, 792])
      page.drawText(`Page ${index} body content here.`, {
        x: 72,
        y: 700,
        size: 12,
        font
      })
    }

    const started = Date.now()
    const result = await pdfConverter.convert(
      converterInput(await doc.save()),
      createConvertContext()
    )
    const elapsedMs = Date.now() - started

    expect(elapsedMs).toBeLessThan(60_000)
    expect(result.stats.pages).toBe(320)
    expect(result.markdown).toContain('Page 1 body content here.')
    expect(result.markdown).toContain('Page 320 body content here.')
    expect(result.warnings).toContainEqual({
      code: 'PDF_LARGE',
      message: 'Large PDF (320 pages). Conversion can take a while.',
      severity: 'warn'
    })
  }, 90_000)

  it('converts a 20-page document in under 5 seconds', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)

    for (let index = 1; index <= 20; index += 1) {
      const page = doc.addPage([612, 792])
      page.drawText(
        `Page ${index} body content for performance budget testing.`,
        {
          x: 72,
          y: 700,
          size: 12,
          font
        }
      )
    }

    const started = performance.now()
    const result = await pdfConverter.convert(
      converterInput(await doc.save()),
      createConvertContext()
    )
    const elapsedMs = performance.now() - started

    expect(elapsedMs).toBeLessThan(5000)
    expect(result.stats.pages).toBe(20)
  })

  it('emits page marker blocks when pdfPageMarkers is on', async () => {
    vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs)

    const ctx = {
      ...createConvertContext(),
      options: { ocrLanguage: 'eng', forceOcr: false, pdfPageMarkers: true }
    }

    const result = await pdfConverter.convert(
      converterInput(await buildGoldenPdf()),
      ctx
    )

    expect(result.markdown).toContain('--- Page 1 ---')
    expect(result.markdown).toContain('--- Page 2 ---')
  })
})
