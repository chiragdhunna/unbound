import { expect, test } from '@playwright/test'

test('renders application shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'unbound_' })).toBeVisible()
})
