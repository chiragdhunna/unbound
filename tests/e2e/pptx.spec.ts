import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import pptxgen from 'pptxgenjs'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensurePptxFixture(): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const pptxPath = path.join(outputDir, 'm7-e2e-presentation.pptx')

  const pptx = new pptxgen()

  const slide1 = pptx.addSlide()
  slide1.addText('First Presentation Slide', {
    x: 1,
    y: 1,
    fontSize: 24,
    bold: true
  })
  slide1.addText('Content for first slide in presentation order.', {
    x: 1,
    y: 2,
    fontSize: 14
  })
  slide1.addNotes('Notes on slide one for speaker.')

  const slide2 = pptx.addSlide()
  slide2.addText('Second Presentation Slide', {
    x: 1,
    y: 1,
    fontSize: 24,
    bold: true
  })
  slide2.addText('Content for second slide.', {
    x: 1,
    y: 2,
    fontSize: 14
  })
  slide2.addNotes('Notes on slide two for speaker.')

  const buffer = await pptx.write({ outputType: 'nodebuffer' })
  await fs.writeFile(pptxPath, buffer as Buffer)
  return pptxPath
}

test('uploads a generated pptx and renders markdown output with correct order, notes, and zero external requests', async ({
  page,
  baseURL
}) => {
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
    const source = new URL(message.location().url || pageOrigin).pathname
    if (
      message.type() === 'error' ||
      message.text().includes('Content-Security-Policy')
    ) {
      consoleErrors.push(`${message.text()} @ ${source}`)
    }
  })

  const filePath = await ensurePptxFixture()
  await page.goto('/')

  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('First Presentation Slide', {
    timeout: 30_000
  })
  await expect(output).toContainText('Second Presentation Slide', {
    timeout: 30_000
  })
  await expect(output).toContainText('Notes on slide one for speaker.')
  await expect(output).toContainText('Notes on slide two for speaker.')

  const text = await output.inputValue()
  const firstIndex = text.indexOf('First Presentation Slide')
  const secondIndex = text.indexOf('Second Presentation Slide')

  expect(firstIndex).toBeGreaterThanOrEqual(0)
  expect(secondIndex).toBeGreaterThan(firstIndex)

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
