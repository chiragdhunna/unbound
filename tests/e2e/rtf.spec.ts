import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureRtfFixture(): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const rtfPath = path.join(outputDir, 'm8-e2e-sample.rtf')
  const rtfContent =
    '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\b Unbound RTF Title\\b0\\par\\i Italicized paragraph\\i0 with formatted text.\\par}'
  await fs.writeFile(rtfPath, rtfContent, 'utf-8')
  return rtfPath
}

test('uploads an RTF file and renders markdown output with zero external requests and zero console errors', async ({
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

  const filePath = await ensureRtfFixture()
  await page.goto('/')

  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('Unbound RTF Title', { timeout: 30_000 })
  await expect(output).toContainText('Italicized paragraph', {
    timeout: 30_000
  })

  const text = await output.inputValue()
  expect(text).toContain('**Unbound RTF Title**')
  expect(text).toContain('_Italicized paragraph_')

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
