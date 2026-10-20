import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const outputDir = path.resolve(tmpdir(), 'unbound-fixtures')

async function ensureFixture() {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    path.join(outputDir, 'm4-data.csv'),
    'name,quote\nAna,"say ""hi"""\n'
  )
}

test('uploads a generated csv and renders the table in the output panel', async ({
  page
}) => {
  await ensureFixture()
  await page.goto('/')
  await page
    .getByLabel('Choose file', { exact: true })
    .setInputFiles(path.join(outputDir, 'm4-data.csv'))

  await expect(page.getByRole('textbox')).toContainText('| name | quote |')
  await expect(page.getByRole('textbox')).toContainText('| Ana | say "hi" |')
})
