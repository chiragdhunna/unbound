import { test } from '@playwright/test'

test('minimal page evaluate', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  
  const result = await page.evaluate(async () => {
    let tesseract
    try {
      tesseract = await import('tesseract.js')
    } catch (e) {
      tesseract = (window).tesseract
    }
    if (!tesseract) {
      return null
    }
    return { hasTesseract: true }
  })
  
  console.log('result:', result)
  expect(result).toBeDefined()
})
