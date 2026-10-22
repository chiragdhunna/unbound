import { type Converter, type Warning } from '../core/types'

/** Language code for English OCR */
export const ENG_LANG = 'eng'

/** Options for tesseract.js worker creation */
export interface OcrOptions {
  /** Language code (default: 'eng') */
  lang?: string
  /** Whether to include page markers */
  pageMarkers?: boolean
  /** Whether to add chunk preamble */
  chunkPreamble?: boolean
}

/** Result from OCR recognition */
export interface OcrResult {
  /** Recognized text */
  text: string
  /** Confidence score (if available) */
  confidence?: number
  /** Number of pages processed */
  pageCount?: number
}

/** OCR converter using self-hosted tesseract.js assets */
export const ocrConverter: Converter = {
  kind: 'ocr',
  async convert(input, ctx) {
    // tesseract.js will be initialized via page.evaluate with self-hosted paths
    // This converter is a placeholder - actual OCR runs in the browser
    throw new Error('OCR conversion runs in browser via page.evaluate')
  }
}

/** Initialize tesseract.js worker with self-hosted paths
 *  This should be called from the page context via page.evaluate
 *  @param lang Language code (e.g., 'eng')
 * @param options Additional options
 * @returns Promise resolving to the tesseract worker
 */
export async function createTesseractWorker(lang = ENG_LANG, options: OcrOptions = {}): Promise<any> {
  // tesseract will be imported dynamically in the page context
  // with self-hosted workerPath, corePath, and langPath
  // This is a TypeScript declaration - actual implementation in page.evaluate
  throw new Error('use page.evaluate with tesseract createWorker')
}