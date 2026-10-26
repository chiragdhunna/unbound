import { parseHtmlToMarkdown } from './html'
import { UrlFetchError } from '../core/errors'
import { type ConvertResult } from '../core/types'

export interface FetchUrlOptions {
  signal?: AbortSignal
  timeoutMs?: number
  proxyUrl?: string
  onProgress?: (percent: number) => void
}

export function buildFetchTargetUrl(rawUrl: string, proxyUrl?: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UrlFetchError(
      `Invalid URL (${rawUrl}). Please enter a valid web address starting with http:// or https://.`
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlFetchError(
      `Unsupported protocol (${parsed.protocol}). Only http:// and https:// URLs are supported.`
    )
  }

  const activeProxy =
    proxyUrl ??
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FETCH_PROXY_URL
      ? (import.meta.env.VITE_FETCH_PROXY_URL as string)
      : undefined)

  if (activeProxy) {
    const separator = activeProxy.includes('?') ? '&' : '?'
    return `${activeProxy}${separator}url=${encodeURIComponent(parsed.href)}`
  }

  return parsed.href
}

export function injectBaseTag(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl}">`
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, `$&${baseTag}`)
  }
  return `${baseTag}${html}`
}

export async function fetchUrlToMarkdown(
  url: string,
  options?: FetchUrlOptions
): Promise<ConvertResult> {
  const targetUrl = buildFetchTargetUrl(url, options?.proxyUrl)
  const timeoutMs = options?.timeoutMs ?? 15000

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => {
    timeoutController.abort()
  }, timeoutMs)

  let combinedSignal: AbortSignal
  if (options?.signal) {
    if (typeof AbortSignal.any === 'function') {
      combinedSignal = AbortSignal.any([options.signal, timeoutController.signal])
    } else {
      const merged = new AbortController()
      const forwardAbort = () => merged.abort()
      options.signal.addEventListener('abort', forwardAbort)
      timeoutController.signal.addEventListener('abort', forwardAbort)
      combinedSignal = merged.signal
    }
  } else {
    combinedSignal = timeoutController.signal
  }

  options?.onProgress?.(10)

  let response: Response
  try {
    response = await fetch(targetUrl, { signal: combinedSignal })
  } catch {
    clearTimeout(timeoutId)

    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    if (timeoutController.signal.aborted) {
      throw new UrlFetchError(
        `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. The server did not respond in time.`
      )
    }

    throw new UrlFetchError(
      'Unable to fetch URL directly due to browser cross-origin restrictions (CORS). To convert this page, save it as an HTML file (.html) or copy-paste its content directly.'
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new UrlFetchError(
      `Failed to fetch URL: HTTP ${response.status} ${response.statusText}. Check the URL and try again.`
    )
  }

  options?.onProgress?.(30)

  const rawHtml = await response.text()
  const htmlWithBase = injectBaseTag(rawHtml, url)

  const { markdown, warnings } = parseHtmlToMarkdown(htmlWithBase, {
    baseUrl: url,
    signal: options?.signal,
    onProgress: (p) => {
      options?.onProgress?.(30 + Math.round((p / 100) * 70))
    }
  })

  return {
    markdown,
    warnings,
    stats: {}
  }
}
