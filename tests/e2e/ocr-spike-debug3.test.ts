import { test, expect } from '@playwright/test'

test('debug tesseract import v3', async ({ page }) => {
  // Exact same pattern as the working debug test
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