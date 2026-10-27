import { test, expect } from '@playwright/test'

const textFile = (name: string, content: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(content)
})

test.describe('Mobile viewports & responsive hardening (E4)', () => {
  const viewports = [
    { name: 'small-android (360x640)', width: 360, height: 640 },
    { name: 'iphone-14 (390x844)', width: 390, height: 844 }
  ]

  for (const vp of viewports) {
    test(`no horizontal overflow at ${vp.name} in empty state`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      await page.waitForSelector('h1')

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const innerWidth = await page.evaluate(() => window.innerWidth)
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
    })

    test(`no horizontal overflow at ${vp.name} in converted state`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/')
      await page.waitForSelector('h1')

      await page
        .getByLabel('Choose file', { exact: true })
        .setInputFiles(textFile('doc.txt', 'Mobile responsive converted content.\n'.repeat(20)))
      await page.getByRole('textbox', { name: 'Converted output' }).waitFor()

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const innerWidth = await page.evaluate(() => window.innerWidth)
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
    })
  }

  test('all interactive buttons and options touch targets are at least 44x44px on mobile (360x640)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    await page.waitForSelector('h1')

    // Check main action buttons
    const buttons = await page.locator('button:visible').all()
    expect(buttons.length).toBeGreaterThan(0)
    for (const btn of buttons) {
      const box = await btn.boundingBox()
      if (box && box.width > 0 && box.height > 0) {
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
    }

    // Check options labels / checkboxes
    const labels = await page.locator('.toggle-row label:visible').all()
    for (const label of labels) {
      const box = await label.boundingBox()
      if (box && box.width > 0 && box.height > 0) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('sticky Copy button has safe bottom padding on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    await page.waitForSelector('h1')

    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(textFile('long.txt', 'Line of text.\n'.repeat(60)))
    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()

    const copyBtn = page.getByRole('article', { name: 'Conversion output' }).getByRole('button', { name: 'Copy', exact: true })
    await expect(copyBtn).toBeVisible()

    const styles = await copyBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return {
        position: computed.position,
        bottom: computed.bottom
      }
    })

    expect(styles.position).toBe('sticky')
    expect(parseFloat(styles.bottom)).toBeGreaterThanOrEqual(16) // at least 1rem (16px) bottom offset
  })

  test('touch drag hint contains "Tap to choose" for touch / mobile users', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    await page.waitForSelector('h1')

    const dropzoneTitle = page.locator('.dropzone-title')
    await expect(dropzoneTitle).toBeVisible()
    await expect(dropzoneTitle).toContainText('Tap to choose')
  })
})
