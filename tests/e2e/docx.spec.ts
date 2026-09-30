import { expect, test } from '@playwright/test'
import { Packer, Document, Paragraph, HeadingLevel, TextRun } from 'docx'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

async function ensureFixture() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: 'Heading 1', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun('This is a docx fixture for M3.')] })
        ]
      }
    ]
  })

  const buffer = await Packer.toBuffer(doc)
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, 'm3-docx.docx'), Buffer.from(buffer))
}

test('uploads a generated docx and renders markdown output', async ({ page }) => {
  await ensureFixture()
  await page.goto('/')
  await page.getByLabel('Choose file', { exact: true }).setInputFiles(path.join(outputDir, 'm3-docx.docx'))

  await expect(page.getByRole('textbox')).toContainText('Heading 1')
  await expect(page.getByRole('textbox')).toContainText('This is a docx fixture for M3.')
})
