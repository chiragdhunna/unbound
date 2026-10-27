import { test, expect, Page } from '@playwright/test'

const textFile = (name: string, content: string) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(content)
})

async function installClipboard(page: Page) {
  await page.evaluate(() => {
    const writes: string[] = []
    ;(window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = writes
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

test.describe('Keyboard-only flow & accessibility standards (E3)', () => {
  test('Tab onto DropZone, activates with Enter, reaches output, copies via keyboard, and preserves visible focus', async ({
    page
  }) => {
    await page.goto('/')
    await page.waitForSelector('h1')
    await installClipboard(page)

    // Ensure interactive button is rendered before initiating keyboard sequence
    const chooseBtn = page.getByRole('button', { name: 'Choose files' })
    await expect(chooseBtn).toBeVisible()

    // Initial page focus
    await page.locator('body').focus()

    // 1. Tab into DropZone action (Choose files)
    let chooseFilesFocused = false
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      const activeText = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? ''
      )
      if (activeText === 'Choose files') {
        chooseFilesFocused = true
        break
      }
    }
    expect(chooseFilesFocused).toBe(true)

    // 2. Verify :focus-visible style is present on active element
    const hasFocusVisible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      return el.matches(':focus-visible')
    })
    expect(hasFocusVisible).toBe(true)

    // 3. Activate upload via keyboard Enter on Choose files
    const chooserPromise = page.waitForEvent('filechooser')
    await chooseBtn.press('Enter')
    const chooser = await chooserPromise
    await chooser.setFiles(textFile('keyboard-test.txt', 'Keyboard accessible text.'))

    // 4. Output panel appears
    const output = page.getByRole('textbox', { name: 'Converted output' })
    await output.waitFor()
    await expect(output).toHaveValue('Keyboard accessible text.\n')

    // 5. Navigate via Tab to the Copy button in the output toolbar
    let copyButtonFocused = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const activeText = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? ''
      )
      if (activeText === 'Copy') {
        copyButtonFocused = true
        break
      }
    }
    expect(copyButtonFocused).toBe(true)

    // 6. Activate Copy via Enter
    await page.keyboard.press('Enter')

    // 7. Verify toast notification is announced with role="status" and aria-live="polite"
    const toast = page.locator('.toast')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('role', 'status')
    await expect(toast).toHaveAttribute('aria-live', 'polite')
    await expect(toast).toContainText('Copied to clipboard')

    // 8. Tab to job action buttons and verify reachability
    let removeFocused = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const activeText = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? ''
      )
      if (activeText === 'Remove') {
        removeFocused = true
        break
      }
    }
    expect(removeFocused).toBe(true)
  })

  test('assertive aria-live alert on job error', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('h1')

    // Upload an unsupported format to trigger an error
    const unsupported = {
      name: 'unsupported.xyz',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03])
    }
    await page.getByLabel('Choose file', { exact: true }).setInputFiles(unsupported)

    // Expect job error element with role="alert" and aria-live="assertive"
    const errorAlert = page.locator('.job-error')
    await expect(errorAlert).toBeVisible()
    await expect(errorAlert).toHaveAttribute('role', 'alert')
    await expect(errorAlert).toHaveAttribute('aria-live', 'assertive')
  })

  test('batch progress announcer in status-pill aria-live region', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('h1')

    // Status pill should exist with role="status" and aria-live="polite"
    const statusPill = page.locator('.status-pill')
    await expect(statusPill).toBeVisible()
    await expect(statusPill).toHaveAttribute('role', 'status')
    await expect(statusPill).toHaveAttribute('aria-live', 'polite')
    await expect(statusPill).toHaveText('Ready')
  })
})
