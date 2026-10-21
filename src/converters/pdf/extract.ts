import { CancelledError } from '../../core/errors'
import { type TextItemLite } from './layout'

type RawItem = {
  str?: string
  transform?: number[]
  height?: number
  width?: number
}

export type PdfPageLike = {
  getTextContent(): Promise<{ items: unknown[] }>
  cleanup(): void
}

export type PdfDocumentLike = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageLike>
}

export type PdfjsLike = {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<PdfDocumentLike>
    destroy(): Promise<void>
  }
}

export type ExtractHooks = {
  signal?: AbortSignal
  onProgress?: (p: { phase: string; current: number; total: number }) => void
}

/**
 * Reads every page of a PDF into per-page text items.
 *
 * pdfjs may transfer (detach) the ArrayBuffer it is handed, so the bytes are
 * always copied: the caller keeps the original intact for a future OCR
 * fallback. pdfjs v6 has no `PDFDocumentProxy.destroy()`; cleanup happens on
 * the loading task.
 */
export async function extractPageItems(
  pdfjs: PdfjsLike,
  bytes: Uint8Array,
  hooks?: ExtractHooks
): Promise<TextItemLite[][]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) })

  try {
    const doc = await task.promise
    const pages: TextItemLite[][] = []

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      if (hooks?.signal?.aborted) throw new CancelledError()

      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      const items: TextItemLite[] = []

      for (const raw of content.items as RawItem[]) {
        if (typeof raw.str !== 'string') continue
        const transform = raw.transform ?? []
        items.push({
          str: raw.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          height: raw.height ?? 0,
          width: raw.width ?? 0
        })
      }

      pages.push(items)
      page.cleanup()
      hooks?.onProgress?.({
        phase: 'pdf',
        current: pageNumber,
        total: doc.numPages
      })
    }

    return pages
  } finally {
    await task.destroy().catch(() => undefined)
  }
}
