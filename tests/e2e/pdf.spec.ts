import { chromium, expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function goldenPdfBytes(): Promise<Uint8Array> {
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

let fixturesPromise: Promise<void> | null = null

async function ensureFixtures() {
  if (fixturesPromise) return fixturesPromise
  fixturesPromise = (async () => {
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(
      path.join(outputDir, 'm52-golden.pdf'),
      await goldenPdfBytes()
    )

    const blank = await PDFDocument.create()
    blank.addPage([612, 792])
    blank.addPage([612, 792])
    await fs.writeFile(path.join(outputDir, 'm52-blank.pdf'), await blank.save())

    const scannedPath = path.join(outputDir, 'm64-scanned.pdf')
    const mixedPath = path.join(outputDir, 'm64-mixed.pdf')
    const embeddedPath = path.join(outputDir, 'm65-embedded.pdf')

    try {
      await fs.access(scannedPath)
      await fs.access(mixedPath)
      await fs.access(embeddedPath)
      return
    } catch {
      // Create them below
    }

    const browser = await chromium.launch()
    const page = await browser.newPage()
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 160
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      ctx.font = 'bold 56px sans-serif'
      ctx.fillText('SCANNED INVOICE', 20, 100)
      return canvas.toDataURL('image/png')
    })
    await browser.close()

    const pngBytes = Buffer.from(
      dataUrl.replace(/^data:image\/png;base64,/, ''),
      'base64'
    )

    const scannedDoc = await PDFDocument.create()
    const img1 = await scannedDoc.embedPng(pngBytes)
    const scannedPage = scannedDoc.addPage([640, 160])
    scannedPage.drawImage(img1, { x: 0, y: 0, width: 640, height: 160 })
    await fs.writeFile(scannedPath, await scannedDoc.save())

    const mixedDoc = await PDFDocument.create()
    const font = await mixedDoc.embedFont(StandardFonts.Helvetica)
    const p1 = mixedDoc.addPage([612, 792])
    p1.drawText('Mixed document selectable text on page one.', {
      x: 72,
      y: 700,
      size: 16,
      font
    })
    const img2 = await mixedDoc.embedPng(pngBytes)
    const p2 = mixedDoc.addPage([640, 160])
    p2.drawImage(img2, { x: 0, y: 0, width: 640, height: 160 })
    await fs.writeFile(mixedPath, await mixedDoc.save())

    const embeddedDoc = await PDFDocument.create()
    const embFont = await embeddedDoc.embedFont(StandardFonts.Helvetica)
    const pEmb = embeddedDoc.addPage([640, 200])
    pEmb.drawText('Selectable text above embedded image fixture.', {
      x: 30,
      y: 170,
      size: 14,
      font: embFont
    })
    const img3 = await embeddedDoc.embedPng(pngBytes)
    // 600 x 140 image on 640 x 200 page: area = 84,000 / 128,000 = 65.6% (>= 30%)
    pEmb.drawImage(img3, { x: 20, y: 15, width: 600, height: 140 })
    await fs.writeFile(embeddedPath, await embeddedDoc.save())
  })()
  return fixturesPromise
}

test('uploads a generated PDF and renders the markdown output', async ({
  page
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      message.text().includes('Content-Security-Policy')
    ) {
      consoleErrors.push(`${message.type()}: ${message.text()}`)
    }
  })

  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm52-golden.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText(
    '# Quarterly Budget Review',
    { timeout: 30_000 }
  )
  await expect(output).toContainText('- Rent 1200')

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

test('shows no-text-found message for a blank PDF with no images', async ({
  page
}) => {
  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm52-blank.pdf'))

  await expect(page.getByText('No text found in this PDF.')).toBeVisible()
  await expect(
    page.getByText('Try a file with selectable text or enable OCR.')
  ).toBeVisible()
})

test('adds page markers when the PDF page-markers setting is on', async ({
  page
}) => {
  await ensureFixtures()
  await page.goto('/')
  await page.getByLabel('Add page markers (PDF)').check()
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm52-golden.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText('--- Page 1 ---')
  await expect(output).toContainText('--- Page 2 ---')
})

test('omits page markers when the PDF page-markers setting is off', async ({
  page
}) => {
  await ensureFixtures()
  await page.goto('/')
  await expect(page.getByLabel('Add page markers (PDF)')).not.toBeChecked()
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm52-golden.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText('# Quarterly Budget Review')
  await expect(output).not.toContainText('--- Page 1 ---')
  await expect(output).not.toContainText('--- Page 2 ---')
})

test('converts a scanned PDF using self-hosted OCR with zero external requests', async ({
  page,
  baseURL
}) => {
  const pageOrigin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin
  const crossOrigin: string[] = []
  const requested: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    requested.push(url.pathname)
    if (
      url.protocol !== 'blob:' &&
      url.protocol !== 'data:' &&
      url.origin !== pageOrigin
    ) {
      crossOrigin.push(request.url())
    }
  })
  page.on('console', (message) => {
    const source = new URL(message.location().url || pageOrigin).pathname
    if (message.type() === 'error') {
      consoleErrors.push(`${message.text()} @ ${source}`)
    }
  })

  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm64-scanned.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText('INVOICE', { timeout: 30_000 })

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  expect(requested).toContain('/ocr/worker.min.js')
  expect(requested).toContain('/ocr/lang/eng.traineddata')
})

test('converts a mixed PDF with text and scanned pages', async ({ page }) => {
  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm64-mixed.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText(
    'Mixed document selectable text on page one.',
    { timeout: 30_000 }
  )
  await expect(output).toContainText('INVOICE')
})

test('warns when a text PDF contains large embedded images and provides Run OCR on this PDF action', async ({
  page
}) => {
  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm65-embedded.pdf'))

  const output = page.getByRole('textbox')
  await expect(output).toContainText(
    'Selectable text above embedded image fixture.',
    { timeout: 30_000 }
  )

  await expect(
    page.getByText('This PDF contains embedded images that may contain text.')
  ).toBeVisible()

  const runOcrButton = page.getByRole('button', {
    name: 'Run OCR on this PDF'
  })
  await expect(runOcrButton).toBeVisible()

  await runOcrButton.click()

  await expect(output).toContainText('INVOICE', { timeout: 30_000 })
})

test('cancels OCR conversion in under 1 second', async ({ page, baseURL }) => {
  const pageOrigin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin
  const crossOrigin: string[] = []
  const consoleErrors: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.protocol !== 'blob:' &&
      url.protocol !== 'data:' &&
      url.origin !== pageOrigin
    ) {
      crossOrigin.push(request.url())
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    ;(window as unknown as { __workers: { url: string; terminated: boolean }[] }).__workers = []
    ;(window as unknown as { __terminatedWorkers: { url: string; terminated: boolean }[] }).__terminatedWorkers = []

    window.Worker = class extends OriginalWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options)
        const urlStr = String(scriptURL)
        const record = { url: urlStr, terminated: false }
        ;(window as unknown as { __workers: { url: string; terminated: boolean }[] }).__workers.push(record)
        const origTerminate = this.terminate.bind(this)
        this.terminate = () => {
          record.terminated = true
          ;(window as unknown as { __terminatedWorkers: { url: string; terminated: boolean }[] }).__terminatedWorkers.push(record)
          return origTerminate()
        }
      }
    }
  })

  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm64-scanned.pdf'))

  const cancelButton = page.getByRole('button', { name: 'Cancel' })
  await expect(cancelButton).toBeVisible()

  // Wait for OCR worker to be spawned so we are cancelling an active OCR conversion
  await page.waitForFunction(() => {
    const workers = (window as unknown as { __workers?: { url: string; terminated: boolean }[] }).__workers?.filter(
      (w) => w.url.includes('worker.min.js') || w.url.includes('ocr')
    )
    return workers && workers.length > 0
  })

  await page.evaluate(() => {
    ;(window as unknown as { __cancelTiming: { clickedAt: number; cancelledAt: number } }).__cancelTiming = {
      clickedAt: 0,
      cancelledAt: 0
    }

    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel'
    )
    if (btn) {
      btn.addEventListener(
        'click',
        () => {
          ;(window as unknown as { __cancelTiming: { clickedAt: number; cancelledAt: number } }).__cancelTiming.clickedAt = performance.now()
        },
        { capture: true }
      )
    }

    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('Conversion cancelled by user.')) {
        const timing = (window as unknown as { __cancelTiming: { clickedAt: number; cancelledAt: number } }).__cancelTiming
        if (!timing.cancelledAt) {
          timing.cancelledAt = performance.now()
        }
        observer.disconnect()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })
  })

  await cancelButton.click()

  await expect(
    page.getByText('Conversion cancelled by user.')
  ).toBeVisible()

  const timing = await page.evaluate(
    () => (window as unknown as { __cancelTiming: { clickedAt: number; cancelledAt: number } }).__cancelTiming
  )
  expect(timing.clickedAt).toBeGreaterThan(0)
  expect(timing.cancelledAt).toBeGreaterThan(timing.clickedAt)
  const elapsedMs = timing.cancelledAt - timing.clickedAt

  expect(elapsedMs).toBeLessThan(1000)

  // Assert OCR worker was terminated
  await page.waitForFunction(() => {
    const workers = (window as unknown as { __workers?: { url: string; terminated: boolean }[] }).__workers?.filter(
      (w) => w.url.includes('worker.min.js') || w.url.includes('ocr')
    )
    return workers && workers.length > 0 && workers.every((w) => w.terminated)
  })

  const ocrWorkers = await page.evaluate(() => {
    return (window as unknown as { __workers?: { url: string; terminated: boolean }[] }).__workers?.filter(
      (w) => w.url.includes('worker.min.js') || w.url.includes('ocr')
    )
  })
  expect(ocrWorkers?.length).toBeGreaterThan(0)
  expect(ocrWorkers?.every((w) => w.terminated)).toBe(true)

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
