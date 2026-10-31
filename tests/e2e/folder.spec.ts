import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const testFolder = path.resolve(
  tmpdir(),
  'unbound-fixtures',
  'test-folder-upload'
)

async function setupFolderFixture() {
  await fs.rm(testFolder, { recursive: true, force: true })
  await fs.mkdir(path.join(testFolder, 'subA'), { recursive: true })
  await fs.mkdir(path.join(testFolder, 'subB'), { recursive: true })

  const fileA = path.join(testFolder, 'subA', 'doc.txt')
  const fileB = path.join(testFolder, 'subB', 'doc.txt')
  const junk = path.join(testFolder, '.DS_Store')
  const rootNote = path.join(testFolder, 'guide.md')

  await fs.writeFile(fileA, 'Alpha content from subfolder A')
  await fs.writeFile(fileB, 'Beta content from subfolder B')
  await fs.writeFile(junk, 'macos junk')
  await fs.writeFile(
    rootNote,
    '# Guide in root folder\n\nWelcome to unbound folder test.'
  )

  return { testFolder, fileA, fileB, junk, rootNote }
}

test('uploads a folder skipping junk, distinguishing duplicate basenames, and combining output', async ({
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

  const { testFolder } = await setupFolderFixture()
  await page.goto('/')

  // Playwright setInputFiles on webkitdirectory requires passing a path to a directory
  await page
    .getByLabel('Choose folder', { exact: true })
    .setInputFiles(testFolder)

  // Junk should not be in the job list
  await expect(page.getByRole('button', { name: /\.DS_Store/ })).toHaveCount(0)

  // Both duplicate basenames should appear labeled with their subfolder paths
  await expect(
    page.getByRole('button', { name: /subA\/doc\.txt/ })
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByRole('button', { name: /subB\/doc\.txt/ })
  ).toBeVisible({ timeout: 15_000 })

  // Toggle Combined mode to test requirement: "respect the existing Separate/Combined toggle"
  await page.getByRole('button', { name: 'Combined', exact: true }).click()

  const output = page.getByRole('textbox', { name: 'Converted output' })
  await expect(output).toContainText('subA/doc.txt', { timeout: 15_000 })
  await expect(output).toContainText('subB/doc.txt', { timeout: 15_000 })
  await expect(output).toContainText('Alpha content from subfolder A')
  await expect(output).toContainText('Beta content from subfolder B')
  await expect(output).toContainText('Welcome to unbound folder test.')

  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})
