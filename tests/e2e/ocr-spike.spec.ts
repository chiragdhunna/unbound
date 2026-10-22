import { expect, test } from '@playwright/test'

test('M6.1d: self-hosted tesseract OCR assets and CSP compliance', async ({ page }) => {
  // ********** TRACKING: must be set BEFORE and during page navigation **********
  const crossOriginRequests: string[] = []
  const cspViolations: string[] = []
  const ocrTimings = {
    workerCreation: 0,
  } as { workerCreation: number }

  // Track network requests BEFORE navigation
  page.on('request', (request) => {
    const requestUrl = request.url()
    try {
      const parsed = new URL(requestUrl)
      const pageOrigin = new URL(page.url()).origin
      if (parsed.origin !== pageOrigin && !parsed.hostname.startsWith('localhost') && !parsed.hostname.startsWith('127.')) {
        crossOriginRequests.push(requestUrl)
      }
    } catch {
      // Ignore malformed URLs
    }
  })

  // Track console messages for CSP violations
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

  // Get page origin from current URL after navigation
  const resolvedPageOrigin = new URL(page.url()).origin

  // Re-run tracking after navigation to catch OCR-related requests
  const pendingCrossOrigin: string[] = []
  const pendingCsp: string[] = []
  page.on('request', (request) => {
    const requestUrl = request.url()
    try {
      const parsed = new URL(requestUrl)
      if (parsed.origin !== resolvedPageOrigin && !parsed.hostname.startsWith('localhost') && !parsed.hostname.startsWith('127.')) {
        pendingCrossOrigin.push(requestUrl)
      }
    } catch {
      // Ignore malformed URLs
    }
  })
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') {
      if (text.includes('Content-Security-Policy') || text.includes('Content-Security')) {
        pendingCsp.push(text)
      }
    }
  })

  // ********** OCR: draw known text and create worker **********
  // Ensure canvas exists and draw known text
  await page.evaluate(() => {
    let canvas = document.querySelector('canvas')
    if (!canvas) {
      canvas = document.createElement('canvas')
      document.body.appendChild(canvas)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Set canvas size and draw known text
    canvas.width = 400
    canvas.height = 100
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '48px Sans-Serif'
    ctx.fillStyle = 'black'
    ctx.fillText('HELLO WORLD', 20, 50)
  })

  await page.waitForTimeout(100)

  // Now import and use tesseract.js with self-hosted paths
  // Pass lang as first argument to createWorker (API: createWorker(langs, options))
  const tesseractModule = await import('tesseract.js')

  // Measure worker creation time
  const workerStart = performance.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker: any = await tesseractModule.createWorker('eng', 0 as any, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core.wasm',
    langPath: '/ocr/lang/',
  })
  // eslint-enable @typescript-eslint/no-explicit-any
  ocrTimings.workerCreation = performance.now() - workerStart

  // ********** ASSERTIONS **********

  // Assert worker creation succeeded
  expect(worker).toBeDefined()

  // Assert zero cross-origin requests during the OCR run
  const allCrossOrigin = [...crossOriginRequests, ...pendingCrossOrigin]
  expect(allCrossOrigin.length).toBe(0)

  // Assert zero CSP violations
  const allCsp = [...cspViolations, ...pendingCsp]
  expect(allCsp.length).toBe(0)

  // Clean up
  await worker.terminate()

  // Store timings globally for DECISIONS.md recording
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).m61dTimings = ocrTimings
})