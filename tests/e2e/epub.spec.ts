import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureEpubFixture(): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const epubPath = path.join(outputDir, 'm9-e2e-book.epub')

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Unbound EPUB Odyssey</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`
  zip.file('OEBPS/content.opf', opfContent)

  const ch1Content = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>First Chapter Title</title></head>
  <body>
    <h1>First Chapter Title</h1>
    <p>Opening paragraph of the first chapter in EPUB test.</p>
  </body>
</html>`
  zip.file('OEBPS/ch1.xhtml', ch1Content)

  const ch2Content = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Second Chapter Title</title></head>
  <body>
    <h1>Second Chapter Title</h1>
    <p>Continuing paragraph in second chapter sequence.</p>
  </body>
</html>`
  zip.file('OEBPS/ch2.xhtml', ch2Content)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fs.writeFile(epubPath, buffer)
  return epubPath
}

test('uploads a generated epub and renders markdown output with chapter order and zero external requests', async ({
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

  const filePath = await ensureEpubFixture()
  await page.goto('/')

  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('Unbound EPUB Odyssey', {
    timeout: 30_000
  })
  await expect(output).toContainText('Test Author', { timeout: 30_000 })
  await expect(output).toContainText('First Chapter Title')
  await expect(output).toContainText('Second Chapter Title')
  await expect(output).toContainText(
    'Opening paragraph of the first chapter in EPUB test.'
  )
  await expect(output).toContainText(
    'Continuing paragraph in second chapter sequence.'
  )

  const text = await output.inputValue()
  const firstIndex = text.indexOf('First Chapter Title')
  const secondIndex = text.indexOf('Second Chapter Title')

  expect(firstIndex).toBeGreaterThanOrEqual(0)
  expect(secondIndex).toBeGreaterThan(firstIndex)

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
