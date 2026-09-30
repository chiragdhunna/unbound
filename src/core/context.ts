import { type ConvertContext } from './types'

export function createConvertContext(): ConvertContext {
  return {
    signal: new AbortController().signal,
    onProgress: () => undefined,
    requestPassword: async () => null,
    options: {
      ocrLanguage: 'eng',
      forceOcr: false
    }
  }
}
