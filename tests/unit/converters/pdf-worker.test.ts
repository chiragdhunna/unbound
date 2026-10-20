import { describe, expect, it } from 'vitest'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getPdfjs } from '../../../src/converters/pdf/worker'

describe('pdf worker setup', () => {
  it('points GlobalWorkerOptions at the self-hosted worker asset', async () => {
    const pdfjs = await getPdfjs()

    expect(typeof workerUrl).toBe('string')
    expect(workerUrl).toContain('pdf.worker')
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(workerUrl)
    expect(typeof pdfjs.getDocument).toBe('function')
  })

  it('caches the configured module across calls', async () => {
    const first = await getPdfjs()
    const second = await getPdfjs()

    expect(second).toBe(first)
  })
})
