import { test } from '@playwright/test'

test('load tesseract then check global', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  
  // Load tesseract.js
  await page.addScriptTag({ path: '/home/chiragdhunna/Desktop/docs/github_projects/unbound/node_modules/tesseract.js/dist/tesseract.min.js' })
  
  const result = await page.evaluate(async () => {
    console.log('window.tesseract:', !!((window).tesseract))
    return {
      hasGlobal: !!(window).tesseract,
    }
  })
  
  console.log('result:', result)
  expect(result.hasGlobal).toBe(true)
})
