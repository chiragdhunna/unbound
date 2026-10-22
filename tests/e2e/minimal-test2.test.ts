import { test } from '@playwright/test'

test('check global tesseract', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  
  const result = await page.evaluate(async () => {
    console.log('window.tesseract:', !!((window).tesseract))
    console.log('typeof tesseract:', typeof (window).tesseract)
    return {
      hasGlobal: !!(window).tesseract,
      globalType: typeof (window).tesseract
    }
  })
  
  console.log('result:', result)
  expect(result.hasGlobal).toBe(true)
})
