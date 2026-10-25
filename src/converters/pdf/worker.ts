import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfjsModule> | null = null

/**
 * Returns the configured pdfjs-dist module.
 *
 * pdfjs is imported lazily on purpose: it must never enter the initial
 * bundle. The worker is the copy Vite emits from node_modules (self-hosted,
 * same-origin), never a CDN.
 */
export function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })
  }

  return pdfjsPromise
}
