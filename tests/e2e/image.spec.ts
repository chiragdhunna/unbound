import { chromium, expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

let imageFixturePromise: Promise<void> | null = null

async function ensureImageFixture() {
  if (imageFixturePromise) return imageFixturePromise
  imageFixturePromise = (async () => {
    await fs.mkdir(outputDir, { recursive: true })
    const pngPath = path.join(outputDir, 'm6-ocr-test.png')

    try {
      await fs.access(pngPath)
      return
    } catch {
      // Create fixture
    }

    const browser = await chromium.launch()
    const page = await browser.newPage()
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 180
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context missing')
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      ctx.font = 'bold 52px sans-serif'
      ctx.fillText('HELLO 123', 30, 110)
      return canvas.toDataURL('image/png')
    })
    await browser.close()

    const pngBytes = Buffer.from(
      dataUrl.replace(/^data:image\/png;base64,/, ''),
      'base64'
    )
    await fs.writeFile(pngPath, pngBytes)
  })()
  return imageFixturePromise
}

test('uploads a generated image and renders recognized OCR text in the output panel', async ({
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

  await ensureImageFixture()
  await page.goto('/')

  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm6-ocr-test.png'))

  // Wait for OCR conversion to complete
  await expect(page.getByRole('status')).toContainText('Ready', {
    timeout: 30_000
  })

  const output = page.getByRole('textbox')
  await expect(output).toContainText('HELLO')

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
