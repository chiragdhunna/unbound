import { test, expect } from '@playwright/test'

test('debug tesseract import with listeners', async ({ page }) => {
  // Attach tracking listeners BEFORE page.goto - like the main test
  const crossOriginRequests: string[] = []
  const cspViolations: string[] = []

  page.on('request', (request) => {
    const requestUrl = request.url()
    try {
      new URL(requestUrl)
      crossOriginRequests.push(requestUrl)
    } catch {
      // Ignore malformed URLs
    }
  })

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') {
      if (text.includes('Content-Security-Policy') || text.includes('Content-Security')) {
        cspViolations.push(text)
      }
    }
  })

  // Navigate page - this sets up the CSP context
  await page.goto('/', { waitUntil: 'networkidle' })

  // Exact same import pattern
  let tesseract
  try {
    tesseract = await import('tesseract.js')
    console.log('tesseract imported successfully with listeners')
  } catch (e) {
    console.log('dynamic import failed:', e.message)
    tesseract = (window).tesseract
    console.log('global tesseract:', !!tesseract)
  }
  if (!tesseract) {
    console.log('no tesseract available')
  }
})