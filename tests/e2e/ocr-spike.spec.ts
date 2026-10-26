import { expect, test } from '@playwright/test'

interface OcrWorker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>
  terminate(): Promise<unknown>
}

interface TesseractGlobal {
  createWorker(
    lang: string,
    oem: number,
    options: Record<string, unknown>
  ): Promise<OcrWorker>
}

interface OcrRun {
  text: string
  secondText: string
  createMs: number
  firstMs: number
  secondMs: number
}

test('self-hosted OCR recognizes text in the page with zero external requests', async ({
  page,
  baseURL
}) => {
  const pageOrigin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin
  const crossOrigin: string[] = []
  const requested: string[] = []
  const consoleErrors: string[] = []

  // All listeners are attached before navigation and stay attached through OCR.
  page.on('request', (request) => {
    const url = new URL(request.url())
    requested.push(url.pathname)
    if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== pageOrigin) {
      crossOrigin.push(request.url())
    }
  })
  page.on('console', (message) => {
    const source = new URL(message.location().url || pageOrigin).pathname
    if (message.type() === 'error') {
      consoleErrors.push(`${message.text()} @ ${source}`)
    }
  })
  await page.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (event) => {
      ;(window as unknown as { __csp: string[] }).__csp.push(
        `${event.violatedDirective} ${event.blockedURI}`
      )
    })
  })

  await page.goto('/')
  await page.addScriptTag({ url: '/ocr/tesseract.js' })

  const run = await page.evaluate(async (): Promise<OcrRun> => {
    const tesseract = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'
    context.font = '72px sans-serif'
    context.fillText('HELLO WORLD', 24, 100)

    const started = performance.now()
    const worker = await tesseract.createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: false,
      workerBlobURL: false
    })
    const created = performance.now()
    const first = await worker.recognize(canvas)
    const firstDone = performance.now()
    const second = await worker.recognize(canvas)
    const secondDone = performance.now()
    await worker.terminate()

    return {
      text: first.data.text,
      secondText: second.data.text,
      createMs: created - started,
      firstMs: firstDone - created,
      secondMs: secondDone - firstDone
    }
  })

  const cspViolations = await page.evaluate(
    () => (window as unknown as { __csp: string[] }).__csp
  )

  test.info().annotations.push({
    type: 'ocr-timings-ms',
    description: `create=${Math.round(run.createMs)} first=${Math.round(
      run.firstMs
    )} second=${Math.round(run.secondMs)}`
  })

  // The text really came out of the image.
  expect(run.text.toUpperCase()).toContain('HELLO')
  expect(run.text.toUpperCase()).toContain('WORLD')
  expect(run.secondText.toUpperCase()).toContain('HELLO')

  // The self-hosted files were what the worker actually used.
  expect(requested).toContain('/ocr/worker.min.js')
  expect(requested).toContain('/ocr/lang/eng.traineddata')
  expect(requested.some((path) => /^\/ocr\/core\/tesseract-core-.*\.wasm\.js$/.test(path))).toBe(
    true
  )

  // Nothing left the origin, and the CSP was never violated.
  expect(crossOrigin, crossOrigin.join('\n')).toEqual([])
  expect(cspViolations, cspViolations.join('\n')).toEqual([])
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])

  // Generous ceilings; real numbers are recorded in DECISIONS.md.
  expect(run.createMs).toBeLessThan(30_000)
  expect(run.firstMs).toBeLessThan(30_000)
  expect(run.secondMs).toBeLessThan(30_000)
})
