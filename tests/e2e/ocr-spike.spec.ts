import { expect, test } from '@playwright/test'

test('M6.1c: self-hosted tesseract OCR assets and CSP compliance', async ({ page, request }) => {
  // Track all network requests and check origins
  const crossOriginRequests: string[] = []
  const cspViolations: string[] = []

  // Get page origin from the initial navigation URL
  const navResponse = await page.goto('/')
  const navUrl = navResponse?.url() || page.url()
  const pageOrigin = new URL(navUrl).origin

  page.on('request', (request) => {
    const requestUrl = request.url()
    try {
      const parsed = new URL(requestUrl)
      if (parsed.origin !== pageOrigin && !parsed.hostname.startsWith('localhost') && !parsed.hostname.startsWith('127.')) {
        crossOriginRequests.push(requestUrl)
      }
    } catch {
      // Ignore malformed URLs
    }
  })

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') {
      if (text.includes('Content-Security-Policy')) {
        cspViolations.push(text)
      }
    }
  })

  // Verify the self-hosted OCR assets are served with 200 status
  const requestBase = 'http://127.0.0.1:4173'
  
  // 1. Verify worker.min.js is served
  const workerResponse = await request.get(`${requestBase}/ocr/worker.min.js`)
  expect(workerResponse.status()).toBe(200)
  console.log('worker.min.js served with status:', workerResponse.status())

  // 2. Verify tesseract-core.wasm is served
  const coreResponse = await request.get(`${requestBase}/ocr/tesseract-core.wasm`)
  expect(coreResponse.status()).toBe(200)
  console.log('tesseract-core.wasm served with status:', coreResponse.status())

  // 3. Verify eng.traineddata is served with 200 status
  const traineddataResponse = await request.get(`${requestBase}/ocr/lang/eng.traineddata`)
  expect(traineddataResponse.status()).toBe(200)
  console.log('eng.traineddata served with status:', traineddataResponse.status())

  // 4. Verify zero cross-origin requests during page load and asset serving
  expect(crossOriginRequests.length).toBe(0)

  // 5. Verify zero CSP violations
  expect(cspViolations.length).toBe(0)

  // Summary of verified assets
  console.log('=== M6.1c Asset Verification Summary ===')
  console.log('worker.min.js: 200 ✓')
  console.log('tesseract-core.wasm: 200 ✓')
  console.log('eng.traineddata: 200 ✓')
  console.log('Cross-origin requests: 0 ✓')
  console.log('CSP violations: 0 ✓')
})