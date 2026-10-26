export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedFormatError'
  }
}

export class CorruptFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CorruptFileError'
  }
}

export class PasswordRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordRequiredError'
  }
}

export class LegacyDocError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyDocError'
  }
}

export class NoTextFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoTextFoundError'
  }
}

export class TooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TooLargeError'
  }
}

export class CancelledError extends Error {
  constructor(message = 'Conversion cancelled by user.') {
    super(message)
    this.name = 'CancelledError'
  }
}

export class ScannedPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScannedPdfError'
  }
}

export class OcrFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OcrFailedError'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof PasswordRequiredError) {
    if (error.message.includes('Save')) return error.message
    return `${error.message} Save the file without a password and try again.`
  }
  if (error instanceof LegacyDocError) {
    if (error.message.includes('Save as')) return error.message
    return `${error.message} Use a modern .docx format instead.`
  }
  if (error instanceof CorruptFileError)
    return `${error.message} Choose another copy of the file.`
  if (error instanceof ScannedPdfError) return error.message
  if (error instanceof NoTextFoundError)
    return `${error.message} Try a file with selectable text or enable OCR.`
  if (error instanceof TooLargeError)
    return `${error.message} Reduce the file size and try again.`
  if (error instanceof OcrFailedError)
    return `${error.message} Reload the page and try again; if it keeps failing, the OCR files may not have loaded.`
  if (error instanceof CancelledError) return error.message
  if (error instanceof UnsupportedFormatError) return error.message
  if (error instanceof Error) return error.message
  return 'Conversion failed. Check the file and try again.'
}
