import { test, expect, type Page } from '@playwright/test'

const textFile = (name: string, content: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(content)
})

async function installClipboard(page: Page) {
  await page.evaluate(() => {
    const writes: string[] = []
    Object.defineProperty(window, '__unboundWrites', {
      value: writes,
      writable: false
    })
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (value: string) => {
          writes.push(value)
          return Promise.resolve()
        }
      },
      configurable: true
    })
  })
}

test.describe('Quick paste mode & clipboard fallback (E2 / R061)', () => {
  test('quick-paste auto-copies on conversion and handles clipboard fallback', async ({
    page,
    context
  }) => {
    // Grant clipboard permissions where supported (Chromium), catch in WebKit
    await context
      .grantPermissions(['clipboard-read', 'clipboard-write'])
      .catch(() => {})

    await page.goto('/')
    await installClipboard(page)
    await page.waitForSelector('h1')

    // 1. Enable Quick paste setting
    const quickPasteToggle = page.getByLabel('Quick paste', { exact: true })
    await quickPasteToggle.check()
    await expect(quickPasteToggle).toBeChecked()

    // 2. Upload file in Quick paste mode
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(textFile('instant.txt', 'Instant paste text payload.'))

    // 3. Verify auto-copy toast appears
    await expect(page.locator('.toast')).toBeVisible()
    await expect(page.locator('.toast')).toContainText(
      /Quick paste copied|Quick paste ready — tap Copy/
    )

    // 4. Verify converted output is present
    const output = page.getByRole('textbox', { name: 'Converted output' })
    await expect(output).toHaveValue('Instant paste text payload.\n')

    // 5. Test clipboard failure fallback
    await page.evaluate(() => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText = () =>
          Promise.reject(new Error('Simulated clipboard rejection'))
      }
      document.execCommand = () => false
    })

    // Upload another file
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(textFile('fallback.txt', 'Fallback text payload.'))

    // Fallback toast must be shown
    await expect(page.locator('.toast').last()).toBeVisible()
    await expect(page.locator('.toast').last()).toContainText(
      'Quick paste ready — tap Copy'
    )
  })
})
