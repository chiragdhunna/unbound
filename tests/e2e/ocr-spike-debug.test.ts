import { test, expect } from '@playwright/test'

test('debug tesseract import', async ({ page }) => {
  // Try dynamic import of tesseract.js
  let tesseract
  try {
    tesseract = await import('tesseract.js')
    console.log('tesseract imported successfully')
  } catch (e) {
    console.log('dynamic import failed:', e.message)
    tesseract = (window).tesseract
    console.log('global tesseract:', !!tesseract)
  }
  if (!tesseract) {
    console.log('no tesseract available')
  }
})
