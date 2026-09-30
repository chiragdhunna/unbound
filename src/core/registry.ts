import { UnsupportedFormatError } from './errors'
import { type Converter, type FileKind } from './types'

const registry: Partial<Record<FileKind, () => Promise<{ default?: Converter; converter?: Converter; [k: string]: unknown }>>> = {
  text: () => import('../converters/text').then((module) => ({ converter: module.textConverter })),
  markdown: () => import('../converters/markdown').then((module) => ({ converter: module.markdownConverter })),
  json: () => import('../converters/json').then((module) => ({ converter: module.jsonConverter })),
  xml: () => import('../converters/xml').then((module) => ({ converter: module.xmlConverter })),
  code: () => import('../converters/code').then((module) => ({ converter: module.codeConverter }))
}

export async function loadConverter(kind: FileKind): Promise<Converter> {
  const loader = registry[kind]

  if (!loader) {
    throw new UnsupportedFormatError(`File kind '${kind}' is not supported yet.`)
  }

  const module = await loader()
  const converter = module.converter

  if (!converter) {
    throw new UnsupportedFormatError(`Converter for '${kind}' could not be loaded.`)
  }

  return converter
}
