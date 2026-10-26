import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFetchTargetUrl,
  fetchUrlToMarkdown,
  injectBaseTag
} from '../../../src/converters/url'
import { UrlFetchError } from '../../../src/core/errors'

describe('urlConverter and fetchUrlToMarkdown', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('buildFetchTargetUrl', () => {
    it('returns direct URL for valid http/https URLs', () => {
      expect(buildFetchTargetUrl('https://example.com/test')).toBe('https://example.com/test')
      expect(buildFetchTargetUrl('http://example.com/')).toBe('http://example.com/')
    })

    it('throws UrlFetchError on invalid URL syntax', () => {
      expect(() => buildFetchTargetUrl('not a valid url')).toThrow(UrlFetchError)
      expect(() => buildFetchTargetUrl('not a valid url')).toThrow('Invalid URL')
    })

    it('throws UrlFetchError on unsupported protocols', () => {
      expect(() => buildFetchTargetUrl('ftp://files.example.com/test')).toThrow(
        'Unsupported protocol'
      )
      expect(() => buildFetchTargetUrl('javascript:alert(1)')).toThrow('Unsupported protocol')
    })

    it('appends target URL to proxyUrl when provided', () => {
      const proxied = buildFetchTargetUrl('https://example.com/path', 'https://proxy.workers.dev')
      expect(proxied).toBe('https://proxy.workers.dev?url=https%3A%2F%2Fexample.com%2Fpath')
    })

    it('handles proxyUrl containing existing query parameters', () => {
      const proxied = buildFetchTargetUrl(
        'https://example.com/path',
        'https://proxy.workers.dev?key=abc'
      )
      expect(proxied).toBe('https://proxy.workers.dev?key=abc&url=https%3A%2F%2Fexample.com%2Fpath')
    })

    it('uses import.meta.env.VITE_FETCH_PROXY_URL if proxyUrl argument is omitted', () => {
      const originalEnv = import.meta.env.VITE_FETCH_PROXY_URL
      try {
        import.meta.env.VITE_FETCH_PROXY_URL = 'https://default-proxy.test'
        expect(buildFetchTargetUrl('https://example.com/path')).toBe(
          'https://default-proxy.test?url=https%3A%2F%2Fexample.com%2Fpath'
        )
      } finally {
        import.meta.env.VITE_FETCH_PROXY_URL = originalEnv
      }
    })
  })

  describe('injectBaseTag', () => {
    it('injects base tag into head when head is present', () => {
      const html = '<html><head><title>Title</title></head><body><p>Text</p></body></html>'
      const injected = injectBaseTag(html, 'https://example.com/sub/')
      expect(injected).toContain('<head><base href="https://example.com/sub/"><title>Title</title>')
    })

    it('prepends base tag when head is absent', () => {
      const html = '<body><p>Text</p></body>'
      const injected = injectBaseTag(html, 'https://example.com/sub/')
      expect(injected).toBe('<base href="https://example.com/sub/"><body><p>Text</p></body>')
    })
  })

  describe('fetchUrlToMarkdown', () => {
    it('fetches HTML and converts to markdown with relative links resolved', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Remote Article</title></head>
          <body>
            <article>
              <h1>Remote Article</h1>
              <p>Remote paragraph text with <a href="/docs/guide">a relative link</a>.</p>
            </article>
          </body>
        </html>
      `
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => mockHtml
      } as unknown as Response)

      const result = await fetchUrlToMarkdown('https://example.com/posts/item')
      expect(result.markdown).toContain('Remote Article')
      expect(result.markdown).toContain('Remote paragraph text')
      expect(result.markdown).toContain('[a relative link](https://example.com/docs/guide)')
    })

    it('throws UrlFetchError with actionable CORS guidance on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(fetchUrlToMarkdown('https://cors-blocked.example.com')).rejects.toThrow(
        'Unable to fetch URL directly due to browser cross-origin restrictions (CORS)'
      )
    })

    it('throws UrlFetchError on non-200 HTTP responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as unknown as Response)

      await expect(fetchUrlToMarkdown('https://example.com/missing')).rejects.toThrow(
        'Failed to fetch URL: HTTP 404 Not Found'
      )
    })

    it('throws UrlFetchError on timeout', async () => {
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        })
      })

      await expect(
        fetchUrlToMarkdown('https://slow.example.com', { timeoutMs: 20 })
      ).rejects.toThrow('Request timed out after 0 seconds')
    })

    it('aborts when user signal is aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(
        fetchUrlToMarkdown('https://example.com/test', { signal: controller.signal })
      ).rejects.toThrow('The operation was aborted.')
    })

    it('merges signals using fallback when AbortSignal.any is undefined', async () => {
      const originalAny = AbortSignal.any
      try {
        // @ts-expect-error simulating older environment
        delete AbortSignal.any
        const controller = new AbortController()
        globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          })
        })
        const promise = fetchUrlToMarkdown('https://example.com/test', {
          signal: controller.signal
        })
        controller.abort()
        await expect(promise).rejects.toThrow('The operation was aborted.')
      } finally {
        AbortSignal.any = originalAny
      }
    })

    it('reports progress through fetching and parsing phases', async () => {
      const onProgress = vi.fn()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '<html><head><title>P</title></head><body><p>Content</p></body></html>'
      } as unknown as Response)

      await fetchUrlToMarkdown('https://example.com/progress', { onProgress })
      expect(onProgress).toHaveBeenCalledWith(10)
      expect(onProgress).toHaveBeenCalledWith(30)
      expect(onProgress).toHaveBeenCalledWith(100)
    })
  })
})
