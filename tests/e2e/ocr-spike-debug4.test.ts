import { test, expect } from '@playwright/test'

test('debug tesseract import with nav', async ({ page }) => {
  // Navigate like the main test
  await page.goto('/', { waitUntil: 'networkidle' })
  
  // Exact same import pattern
  let tesseract
  try {
    tesseract = await import('tesseract.js')
    console.log('tesseract imported successfully with nav')
  } catch (e) {
    console.log('dynamic import failed:', e.message)
    tesseract = (window).tesseract
    console.log('global tesseract:', !!tesseract)
  }
  if (!tesseract) {
    console.log('no tesseract available')
  }
})