import { describe, expect, it } from 'vitest'
import {
  CancelledError,
  NoTextFoundError,
  OcrFailedError,
  TooLargeError,
  errorMessage
} from '../../../src/core/errors'

describe('error messages', () => {
  it('maps cancellation, no-text, and size errors to next steps', () => {
    expect(errorMessage(new CancelledError())).toContain('cancelled')
    expect(errorMessage(new NoTextFoundError('No text'))).toContain('OCR')
    expect(errorMessage(new TooLargeError('Too large'))).toContain('Reduce')
    expect(
      errorMessage(new OcrFailedError('OCR failed: Worker crashed.'))
    ).toContain(
      'Reload the page and try again; if it keeps failing, the OCR files may not have loaded.'
    )
    expect(errorMessage('unknown')).toContain('Conversion failed')
  })
})
