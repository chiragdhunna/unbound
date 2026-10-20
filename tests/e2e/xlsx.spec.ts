import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureFixture() {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Item', 'Amount'],
    ['Rent', 1200],
    ['Groceries', 250]
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Budget')
  const buffer = XLSX.write(workbook, { type: 'buffer' })
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'm4-budget.xlsx'), buffer)
}

test('uploads a generated xlsx and renders the sheet table in the output panel', async ({
  page
}) => {
  await ensureFixture()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm4-budget.xlsx'))

  await expect(page.getByRole('textbox')).toContainText('## Sheet: Budget')
  await expect(page.getByRole('textbox')).toContainText('| Item | Amount |')
})
