import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureZipFixture(): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, 'm9-e2e-archive.zip')

  const zip = new JSZip()
  zip.file('data.json', JSON.stringify({ name: 'unbound archive', version: 1 }))
  zip.file('docs/guide.md', '# User Guide\n\nWelcome to archive conversion.')
  zip.file('notes.txt', 'Simple text note inside zip.')

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fs.writeFile(zipPath, buffer)
  return zipPath
}

test('uploads a generated zip archive and renders file tree and file boundaries in order with zero external requests', async ({
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

  const filePath = await ensureZipFixture()
  await page.goto('/')

  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('## Files', { timeout: 30_000 })
  await expect(output).toContainText('# File: data.json')
  await expect(output).toContainText('# File: docs/guide.md')
  await expect(output).toContainText('# File: notes.txt')
  await expect(output).toContainText('"name": "unbound archive"')
  await expect(output).toContainText('Welcome to archive conversion.')
  await expect(output).toContainText('Simple text note inside zip.')

  const text = await output.inputValue()
  const treeIdx = text.indexOf('## Files')
  const dataIdx = text.indexOf('# File: data.json')
  const docsIdx = text.indexOf('# File: docs/guide.md')
  const notesIdx = text.indexOf('# File: notes.txt')

  expect(treeIdx).toBeGreaterThanOrEqual(0)
  expect(dataIdx).toBeGreaterThan(treeIdx)
  expect(docsIdx).toBeGreaterThan(dataIdx)
  expect(notesIdx).toBeGreaterThan(docsIdx)

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
