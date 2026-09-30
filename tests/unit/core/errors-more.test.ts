import { describe, expect, it } from 'vitest'
import { CancelledError, NoTextFoundError, TooLargeError, errorMessage } from '../../../src/core/errors'

describe('error messages', () => {
  it('maps cancellation, no-text, and size errors to next steps', () => {
    expect(errorMessage(new CancelledError())).toContain('cancelled')
    expect(errorMessage(new NoTextFoundError('No text'))).toContain('OCR')
    expect(errorMessage(new TooLargeError('Too large'))).toContain('Reduce')
    expect(errorMessage('unknown')).toContain('Conversion failed')
  })
})
