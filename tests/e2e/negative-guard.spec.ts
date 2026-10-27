import { test, expect } from '@playwright/test'

const bufferFile = (name: string, mimeType: string, buffer: Buffer) => ({
  name,
  mimeType,
  buffer
})

test.describe('Negative guard: zero uncaught page errors on invalid inputs', () => {
  test('handles corrupted, zero-byte, and unsupported files with zero pageerror events', async ({
    page
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await page.goto('/')
    await page.waitForSelector('h1')

    // 1. Zero-byte text file
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(bufferFile('empty.txt', 'text/plain', Buffer.from('')))
    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    expect(pageErrors).toHaveLength(0)

    // 2. Unsupported binary format
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(
        bufferFile(
          'bad.xyz',
          'application/octet-stream',
          Buffer.from([0x00, 0x01, 0x02, 0x03])
        )
      )
    await page.locator('.job-error').last().waitFor()
    await expect(page.locator('.job-error').last()).toContainText(/Unsupported format/)
    expect(pageErrors).toHaveLength(0)

    // 3. Corrupted PDF
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(
        bufferFile(
          'corrupt.pdf',
          'application/pdf',
          Buffer.from('%PDF-1.4 corrupt junk data not a real pdf')
        )
      )
    await page.locator('.job-error').last().waitFor()
    await expect(page.locator('.job-error').last()).toContainText(/corrupted|could not be read/i)
    expect(pageErrors).toHaveLength(0)

    // 4. Corrupted ZIP
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(
        bufferFile(
          'corrupt.zip',
          'application/zip',
          Buffer.from('PK\x03\x04random-garbage-not-valid-zip')
        )
      )
    await page.locator('.job-error').last().waitFor()
    await expect(page.locator('.job-error').last()).toContainText(/corrupted|Failed to read/i)
    expect(pageErrors).toHaveLength(0)

    // 5. Zero-byte binary file
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(
        bufferFile('empty.bin', 'application/octet-stream', Buffer.from(''))
      )
    await page.locator('.job-error').last().waitFor()
    await expect(page.locator('.job-error').last()).toContainText(/Unsupported format|Choose another copy/i)
    expect(pageErrors).toHaveLength(0)

    // 6. Healthy recovery: valid file converts cleanly after negative attempts
    await page
      .getByLabel('Choose file', { exact: true })
      .setInputFiles(
        bufferFile(
          'healthy.txt',
          'text/plain',
          Buffer.from('Recovery successful.')
        )
      )
    await page.getByRole('textbox', { name: 'Converted output' }).waitFor()
    const output = await page
      .getByRole('textbox', { name: 'Converted output' })
      .inputValue()
    expect(output).toContain('Recovery successful.')

    // Final assertion: zero uncaught page errors
    expect(pageErrors).toEqual([])
  })
})
