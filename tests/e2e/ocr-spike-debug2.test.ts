import { test, expect } from '@playwright/test'

test('debug tesseract worker creation', async ({ page }) => {
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
    return
  }

  // Try creating worker
  let worker
  try {
    worker = await tesseract.createWorker('eng', {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/tesseract-core.wasm',
      langPath: '/ocr/lang/',
    })
    console.log('worker created successfully')
    
    // Try recognizing
    const result = worker.recognize()
    console.log('recognize called')
    
    worker.terminate()
  } catch (e: any) {
    console.log('worker creation/recognize failed:', e.message)
  }
})