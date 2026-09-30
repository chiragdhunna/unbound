import { expect, test, type Page } from '@playwright/test'

const textFile = (name: string, content: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(content) })

async function installClipboard(page: Page) {
  await page.evaluate(() => {
    const writes: string[] = []
    Object.defineProperty(window, '__unboundWrites', { value: writes, writable: false })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (value: string) => { writes.push(value); return Promise.resolve() } }, configurable: true })
  })
}

test('M2 happy path converts and copies in two user actions', async ({ page }) => {
  await page.goto('/')
  await installClipboard(page)
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('happy.txt', 'Hello from M2.'))
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toHaveValue('Hello from M2.\n')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Copied to clipboard' })).toBeVisible()
})

test('M2 supports separate and combined batch output', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles([
    textFile('first.txt', 'First'),
    textFile('second.txt', 'Second')
  ])
  await expect(page.getByText('first.txt', { exact: true })).toBeVisible()
  await expect(page.getByText('second.txt', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Combined', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('# File: first.txt')
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('# File: second.txt')
})

test('M2 isolates a failed file from a successful batch and supports retry/remove', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles([
    textFile('broken.bin', '\u0000'),
    textFile('good.txt', 'Good file')
  ])
  await expect(page.getByText(/Unsupported format/)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('Good file')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await expect(page.getByText('broken.bin', { exact: true })).toHaveCount(0)
})

test('M2 exposes chunk labels, preamble, per-chunk copy, and sequential copy', async ({ page }) => {
  await page.goto('/')
  await installClipboard(page)
  const content = Array.from({ length: 20 }, (_, index) => `Paragraph ${index} has enough content to create a chunk boundary.`).join('\n\n')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('large.txt', content))
  await page.getByLabel('Chunk limit', { exact: true }).fill('40')
  await expect(page.getByText(/Part 1 of/).first()).toBeVisible()
  await page.getByLabel('Chunk preamble', { exact: true }).check()
  await expect(page.getByText(/Wait for all parts/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Copy next', exact: true }).click()
  await page.getByRole('button', { name: 'Copy', exact: true }).last().click()
  await expect(page.getByRole('status', { name: 'Chunk copied' })).toBeVisible()
})

test('M2 toggles Markdown and Plain without another conversion', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('format.md', '# Heading\n\n**bold**'))
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('# Heading')
  await page.getByRole('button', { name: 'Plain', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toHaveValue('Heading\n\nbold')
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('# Heading')
})

test('M2 downloads exact content with the mode-specific filename', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('download.txt', 'Download me'))
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('download.md')
  const stream = await download.createReadStream()
  let content = ''
  for await (const chunk of stream ?? []) content += chunk.toString()
  expect(content).toBe('Download me\n')
})

test('M2 persists settings but never persists file content', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('private.txt', 'PRIVATE_CONTENT_SENTINEL'))
  await page.getByRole('button', { name: 'Plain', exact: true }).click()
  await page.getByLabel('Chunk limit', { exact: true }).fill('321')
  const stored = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), indexed: Boolean(window.indexedDB) }))
  expect(stored.local).toContain('321')
  expect(stored.local).not.toContain('PRIVATE_CONTENT_SENTINEL')
  expect(stored.session).not.toContain('PRIVATE_CONTENT_SENTINEL')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Plain', exact: true })).toHaveClass(/active/)
  await expect(page.getByLabel('Chunk limit', { exact: true })).toHaveValue('321')
})

test('M2 caps a million-character preview while copy keeps the full output', async ({ page }) => {
  await page.goto('/')
  await installClipboard(page)
  const content = 'x'.repeat(1_100_000)
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('huge.txt', content))
  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toHaveValue(/Showing first 200,000/, { timeout: 15000 })
  await expect(page.getByText(/Preview capped at 200,000/)).toBeVisible()
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const copiedLength = await page.evaluate(() => (window as unknown as { __unboundWrites: string[] }).__unboundWrites[0]?.length)
  expect(copiedLength).toBeGreaterThan(1_000_000)
})

test('M2 supports keyboard upload, edit mode, announced toasts, and dynamic privacy text', async ({ page }) => {
  await page.goto('/')
  await installClipboard(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose files or drag and drop' }).press('Enter')
  await (await chooser).setFiles(textFile('keyboard.txt', 'Keyboard content'))
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('Keyboard content')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Converted output' }).fill('Edited content')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Copied to clipboard' })).toBeVisible()
  await page.getByLabel('Quick paste', { exact: true }).check()
  await expect(page.getByText(/OCR downloads and proxy settings are opt-in/)).toBeVisible()
})

test('M2 has CSP and conversion makes no external requests or CSP violations', async ({ page }) => {
  const external: string[] = []
  const cspErrors: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1') && !request.url().startsWith('http://localhost')) external.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error' && /CSP|Content Security Policy/.test(message.text())) cspErrors.push(message.text())
  })
  const response = await page.goto('/')
  expect(await response?.text()).toContain("Content-Security-Policy")
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(textFile('private.txt', 'No network'))
  await expect(page.getByRole('textbox', { name: 'Converted output' })).toContainText('No network')
  expect(external).toEqual([])
  expect(cspErrors).toEqual([])
})
