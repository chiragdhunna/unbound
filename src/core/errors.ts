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
