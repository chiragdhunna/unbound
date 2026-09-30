import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name)

test('renders application shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'unbound_' })).toBeVisible()
})

test('uploads txt file and shows converted text', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file').setInputFiles(fixture('sample.txt'))

  await expect(page.getByRole('textbox')).toHaveValue('Hello from Unbound.\n')
})

test('uploads json file and renders fenced markdown', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Choose file').setInputFiles(fixture('sample.json'))

  await expect(page.getByRole('textbox')).toContainText('```json')
  await expect(page.getByRole('textbox')).toContainText('"project": "unbound"')
})
