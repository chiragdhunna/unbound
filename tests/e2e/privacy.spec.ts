import { test, expect, type Page, type Request } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs'

interface NetworkAudit {
  requests: string[]
  consoleErrors: string[]
  cspWarnings: string[]
  cleanup: () => void
}

function auditPrivacy(page: Page): NetworkAudit {
  const requests: string[] = []
  const consoleErrors: string[] = []
  const cspWarnings: string[] = []

  const handleRequest = (req: Request) => {
    requests.push(req.url())
  }
  page.on('request', handleRequest)

  const handleConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
    if (/Content Security Policy|insecure|blocked/i.test(msg.text())) {
      cspWarnings.push(msg.text())
    }
  }
  page.on('console', handleConsole)

  return {
    requests,
    consoleErrors,
    cspWarnings,
    cleanup: () => {
      page.off('request', handleRequest)
      page.off('console', handleConsole)
    }
  }
}

async function verifyPrivacyAssertions(page: Page, audit: NetworkAudit, pageOrigin: string) {
  // Assert 1: ZERO external requests
  for (const reqUrl of audit.requests) {
    if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) {
      continue
    }
    const parsed = new URL(reqUrl)
    expect(parsed.origin).toBe(pageOrigin)
  }

  // Assert 2: ZERO console errors
  expect(audit.consoleErrors).toEqual([])

  // Assert 3: ZERO CSP warnings
  expect(audit.cspWarnings).toEqual([])

  // Assert 4: localStorage contains ONLY unbound-settings-v1 without user content
  const storageKeys = await page.evaluate(() => Object.keys(localStorage))
  for (const key of storageKeys) {
    expect(key).toBe('unbound-settings-v1')
  }

  const settingsRaw = await page.evaluate(() => localStorage.getItem('unbound-settings-v1'))
  if (settingsRaw) {
    const parsed = JSON.parse(settingsRaw)
    expect(parsed).not.toHaveProperty('content')
    expect(parsed).not.toHaveProperty('text')
    expect(parsed).not.toHaveProperty('token')
    expect(parsed).not.toHaveProperty('session')
  }

  audit.cleanup()
}

test.describe('Privacy invariants across all converter families (E6)', () => {
  test('privacy: plain text converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Plain text content line.\n')
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: docx converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: 'Docx Privacy Heading', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun('Docx content text.')] })
          ]
        }
      ]
    })
    const docxBuf = await Packer.toBuffer(doc)

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: xlsx converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]])
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsxBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: pptx converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const pptx = new pptxgen()
    const slide = pptx.addSlide()
    slide.addText('PPTX Privacy Title', { x: 1, y: 1, fontSize: 24 })
    const pptxBuf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: pptxBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: html converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const htmlBuf = Buffer.from('<!DOCTYPE html><html><body><h1>HTML Privacy</h1><p>Local body text.</p></body></html>')

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.html',
      mimeType: 'text/html',
      buffer: htmlBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: epub converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const epubZip = new JSZip()
    epubZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    epubZip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    )
    epubZip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB</dc:title></metadata>
  <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`
    )
    epubZip.file(
      'OEBPS/ch1.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>EPUB</title></head>
  <body><h1>EPUB</h1><p>Chapter body.</p></body>
</html>`
    )
    const epubBuf = (await epubZip.generateAsync({ type: 'nodebuffer' })) as Buffer

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.epub',
      mimeType: 'application/epub+zip',
      buffer: epubBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: zip converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const zip = new JSZip()
    zip.file('file1.txt', 'Inside zip file 1.')
    const zipBuf = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.zip',
      mimeType: 'application/zip',
      buffer: zipBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: pdf converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const pdfPage = pdfDoc.addPage([612, 792])
    pdfPage.drawText('PDF Privacy Content', { x: 50, y: 700, size: 20, font })
    const pdfBytes = await pdfDoc.save()

    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes)
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: image ocr converter makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    await page.goto('/')
    await page.waitForSelector('h1')

    // Create an image with readable text
    const base64Data = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 120
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas context missing')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 36px monospace'
      ctx.fillText('OCR PRIVACY', 20, 70)
      return canvas.toDataURL('image/png').split(',')[1] ?? ''
    })
    const imageBuf = Buffer.from(base64Data, 'base64')

    const audit = auditPrivacy(page)
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-test.png',
      mimeType: 'image/png',
      buffer: imageBuf
    })

    await page.getByRole('textbox', { name: 'Converted output' }).waitFor({ timeout: 15000 })
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })

  test('privacy: corrupt / error file makes zero external requests and zero CSP violations', async ({
    page
  }) => {
    const audit = auditPrivacy(page)
    await page.goto('/')
    await page.waitForSelector('h1')
    const pageOrigin = await page.evaluate(() => window.location.origin)

    await page.getByLabel('Choose file', { exact: true }).setInputFiles({
      name: 'privacy-broken.xyz',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0xff])
    })

    await page.locator('.job-error').waitFor()
    await verifyPrivacyAssertions(page, audit, pageOrigin)
  })
})
