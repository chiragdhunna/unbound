import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureHtmlFixture(): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const htmlPath = path.join(outputDir, 'm8-e2e-article.html')
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>E2E HTML Converted Article</title>
      </head>
      <body>
        <nav><a href="#home">Home</a></nav>
        <article>
          <h1>E2E HTML Converted Article</h1>
          <p class="byline">By Unbound Test Suite</p>
          <p>This is an end-to-end integration test verifying client-side HTML to Markdown conversion.</p>
          <p>It includes a paragraph with <strong>strongly emphasized text</strong> and <em>italicized text</em>.</p>
          <table>
            <thead>
              <tr><th>Format</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>HTML</td><td>Supported</td></tr>
            </tbody>
          </table>
        </article>
        <footer>Unused footer content</footer>
      </body>
    </html>
  `
  await fs.writeFile(htmlPath, htmlContent, 'utf-8')
  return htmlPath
}

test('uploads an HTML file and renders markdown output with zero external requests and zero console errors', async ({
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

  const filePath = await ensureHtmlFixture()
  await page.goto('/')

  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('E2E HTML Converted Article', { timeout: 30_000 })
  await expect(output).toContainText('This is an end-to-end integration test', { timeout: 30_000 })

  const text = await output.inputValue()
  expect(text).toContain('**strongly emphasized text**')
  expect(text).toContain('_italicized text_')
  expect(text).toContain('| Format | Status |')
  expect(text).toContain('| HTML | Supported |')
  expect(text).not.toContain('Unused footer content')

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

test('asserts no Fetch URL control exists and dropping an HTML file works with zero cross-origin requests and zero CSP violations', async ({
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

  await page.goto('/')

  // 1. Assert no "Fetch URL" controls exist anywhere in the page
  const fetchUrlButton = page.getByRole('button', { name: /fetch url/i })
  await expect(fetchUrlButton).toHaveCount(0)

  const urlInput = page.locator('input[type="url"], input#url-fetch-input')
  await expect(urlInput).toHaveCount(0)

  // 2. Drop / upload an HTML file
  const filePath = await ensureHtmlFixture()
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(filePath)

  // 3. Verify conversion output
  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('E2E HTML Converted Article', { timeout: 30_000 })
  await expect(output).toContainText('This is an end-to-end integration test', { timeout: 30_000 })

  // 4. Assert zero cross-origin requests and zero CSP violations
  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

