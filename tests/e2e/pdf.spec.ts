import { expect, test } from '@playwright/test'
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

async function ensureFixtures() {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    path.join(outputDir, 'm52-golden.pdf'),
    await goldenPdfBytes()
  )

  const blank = await PDFDocument.create()
  blank.addPage([612, 792])
  blank.addPage([612, 792])
  await fs.writeFile(path.join(outputDir, 'm52-blank.pdf'), await blank.save())
}test('uploads a generated PDF and renders the markdown output', async ({
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

  // Wait for PDF conversion to complete (pdfjs worker loads lazily)
  // The status pill shows 'Converting…' while converting, 'Ready' when done
  await expect(page.getByRole('status')).toContainText('Ready')

  await expect(page.getByRole('textbox')).toContainText(
    '# Quarterly Budget Review'
  )
  await expect(page.getByRole('textbox')).toContainText(
    '- Rent 1200'
  )

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

test('shows the scanned-PDF message for a blank PDF', async ({ page }) => {
  await ensureFixtures()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm52-blank.pdf'))

  await expect(
    page.getByText(
      'This PDF looks scanned (no selectable text). OCR support is not available yet.'
    )
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
