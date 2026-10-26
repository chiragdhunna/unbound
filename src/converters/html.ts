import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { normalizeMarkdown } from '../core/markdown'
import { decodeText } from '../core/encoding'
import {
  type Converter,
  type ConverterInput,
  type ConvertContext,
  type ConvertResult,
  type Warning
} from '../core/types'
import { NoTextFoundError } from '../core/errors'

export interface HtmlConvertOptions {
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  })
  service.use(gfm)
  return service
}

export function parseHtmlToMarkdown(
  html: string,
  options?: HtmlConvertOptions
): { markdown: string; warnings: Warning[] } {
  if (options?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const warnings: Warning[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (options?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  options?.onProgress?.(30)

  let title = doc.title?.trim() || ''
  let byline = ''
  let contentHtml = ''
  let usedReadability = false

  // Strip boilerplate and non-content tags before extraction
  const tagsToRemove = [
    'script',
    'style',
    'noscript',
    'nav',
    'header',
    'footer',
    'aside',
    'svg',
    'template',
    'iframe',
    'object',
    'embed'
  ]
  for (const tag of tagsToRemove) {
    doc.querySelectorAll(tag).forEach((el) => el.remove())
  }

  try {
    const clonedDoc = doc.cloneNode(true) as Document
    const reader = new Readability(clonedDoc, { keepClasses: true })
    const article = reader.parse()

    if (article && article.content && article.textContent && article.textContent.trim().length > 0) {
      contentHtml = article.content
      if (article.title && article.title.trim()) {
        title = article.title.trim()
      }
      if (article.byline && article.byline.trim()) {
        byline = article.byline.trim()
      }
      usedReadability = true
    }
  } catch {
    // If Readability fails on abnormal DOM, proceed to fallback
  }

  if (options?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  options?.onProgress?.(60)

  if (!usedReadability) {
    const body = doc.body
    if (!body) {
      throw new NoTextFoundError('No text found in HTML document.')
    }

    if (!title) {
      const h1 = body.querySelector('h1')
      if (h1?.textContent?.trim()) {
        title = h1.textContent.trim()
      }
    }

    contentHtml = body.innerHTML
  }

  if (!contentHtml.trim()) {
    throw new NoTextFoundError('No text found in HTML document.')
  }

  const turndown = createTurndown()
  let md = turndown.turndown(contentHtml).trim()
  md = md.replace(/^(\s*)-\s{2,}/gm, '$1- ')

  if (!md) {
    throw new NoTextFoundError('No text found in HTML document.')
  }

  let finalMarkdown = ''
  if (title) {
    const startsWithHeading = new RegExp(`^#+\\s+${escapeRegex(title)}`, 'i')
    if (!startsWithHeading.test(md)) {
      finalMarkdown += `# ${title}\n\n`
    }
  }

  if (byline) {
    const cleanByline = byline.replace(/^by\s+/i, '')
    finalMarkdown += `*By ${cleanByline}*\n\n`
  }

  finalMarkdown += md

  options?.onProgress?.(100)

  return {
    markdown: normalizeMarkdown(finalMarkdown),
    warnings
  }
}

export const htmlConverter: Converter = {
  kind: 'html',
  async convert(input: ConverterInput, ctx: ConvertContext): Promise<ConvertResult> {
    ctx.onProgress({ phase: 'parsing', current: 0, total: 100, percent: 0 })
    const { text, warnings: decodeWarnings } = decodeText(input.bytes)
    const { markdown, warnings: parseWarnings } = parseHtmlToMarkdown(text, {
      signal: ctx.signal,
      onProgress: (percent) =>
        ctx.onProgress({ phase: 'parsing', current: percent, total: 100, percent })
    })
    ctx.onProgress({ phase: 'complete', current: 100, total: 100, percent: 100 })
    return {
      markdown,
      warnings: [...decodeWarnings, ...parseWarnings],
      stats: {}
    }
  }
}
