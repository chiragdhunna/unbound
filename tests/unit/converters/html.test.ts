import { describe, expect, it, vi } from 'vitest'
import { htmlConverter, parseHtmlToMarkdown } from '../../../src/converters/html'
import { NoTextFoundError } from '../../../src/core/errors'

describe('htmlConverter and parseHtmlToMarkdown', () => {
  it('extracts full article with title, byline, and formatting via Readability', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Readability Test Article</title>
        </head>
        <body>
          <nav><a href="/">Home</a></nav>
          <article>
            <h1>Readability Test Article</h1>
            <p class="byline">By Jane Doe</p>
            <p>This is a comprehensive article designed to test Mozilla Readability extraction inside Unbound.</p>
            <p>It contains multiple paragraphs to ensure Readability scores it high enough to recognize as an article.</p>
            <h2>Subheading Section</h2>
            <p>Here is some additional content in the subsection with <strong>bold</strong> and <em>italic</em> text.</p>
          </article>
          <footer>Footer copyright 2026</footer>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('Readability Test Article')
    expect(markdown).toContain('*By Jane Doe*')
    expect(markdown).toContain('This is a comprehensive article')
    expect(markdown).toContain('## Subheading Section')
    expect(markdown).toContain('**bold**')
    expect(markdown).toContain('_italic_')
    expect(markdown).not.toContain('Footer copyright')
  })

  it('falls back to body when Readability finds no article, stripping boilerplate tags', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Simple Page</title></head>
        <body>
          <script>window.badScript = true;</script>
          <style>.hidden { display: none; }</style>
          <nav>Navigation links</nav>
          <header>Site Header</header>
          <aside>Sidebar ad</aside>
          <p>Direct paragraph content in body without article tags.</p>
          <footer>Site footer</footer>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('# Simple Page')
    expect(markdown).toContain('Direct paragraph content in body without article tags.')
    expect(markdown).not.toContain('badScript')
    expect(markdown).not.toContain('Navigation links')
    expect(markdown).not.toContain('Site Header')
    expect(markdown).not.toContain('Sidebar ad')
    expect(markdown).not.toContain('Site footer')
  })

  it('converts HTML tables to GFM markdown tables', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <table>
            <thead>
              <tr><th>Item</th><th>Quantity</th><th>Price</th></tr>
            </thead>
            <tbody>
              <tr><td>Widget</td><td>5</td><td>$10.00</td></tr>
              <tr><td>Gadget</td><td>2</td><td>$25.00</td></tr>
            </tbody>
          </table>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('| Item | Quantity | Price |')
    expect(markdown).toContain('| Widget | 5 | $10.00 |')
    expect(markdown).toContain('| Gadget | 2 | $25.00 |')
  })

  it('preserves code blocks with language tags from pre/code', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <pre><code class="language-python">def hello():
    print("world")</code></pre>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('```python')
    expect(markdown).toContain('def hello():')
    expect(markdown).toContain('print("world")')
  })

  it('does not duplicate title if markdown already starts with matching heading', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Existing Heading</title></head>
        <body>
          <h1>Existing Heading</h1>
          <p>Some content below the heading.</p>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    const matches = markdown.match(/Existing Heading/g)
    expect(matches?.length).toBe(1)
  })

  it('throws NoTextFoundError when HTML has no body or extractable text', () => {
    const html = '<html><head><title></title></head><body>   </body></html>'
    expect(() => parseHtmlToMarkdown(html)).toThrow(NoTextFoundError)
  })

  it('aborts when signal is aborted', () => {
    const controller = new AbortController()
    controller.abort()
    const html = '<html><body><p>Hello world</p></body></html>'
    expect(() => parseHtmlToMarkdown(html, { signal: controller.signal })).toThrow(
      'The operation was aborted.'
    )
  })

  it('reports progress stages', () => {
    const onProgress = vi.fn()
    const html = '<html><head><title>Progress</title></head><body><p>Progress text</p></body></html>'
    parseHtmlToMarkdown(html, { onProgress })
    expect(onProgress).toHaveBeenCalledWith(30)
    expect(onProgress).toHaveBeenCalledWith(60)
    expect(onProgress).toHaveBeenCalledWith(100)
  })

  it('finds title in h1 when doc.title is missing in fallback mode', () => {
    const html = '<body><h1>Fallback Heading</h1><p>Body text without head title tag.</p></body>'
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('Fallback Heading')
    expect(markdown).toContain('Body text without head title tag.')
  })

  it('throws NoTextFoundError when body only contains whitespace or empty divs', () => {
    const html = '<body><div>   </div><span>   </span></body>'
    expect(() => parseHtmlToMarkdown(html)).toThrow(NoTextFoundError)
  })

  it('converts through converter interface with byte input', async () => {
    const html = '<!DOCTYPE html><html><head><title>Converter Spec</title></head><body><h1>Spec Header</h1><p>Paragraph text.</p></body></html>'
    const bytes = new TextEncoder().encode(html).buffer
    const result = await htmlConverter.convert(
      {
        name: 'test.html',
        mime: 'text/html',
        bytes
      },
      {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        requestPassword: vi.fn(),
        options: {
          ocrLanguage: 'eng',
          pdfPageMarkers: false,
          forceOcr: false
        }
      }
    )
    expect(result.markdown).toContain('Spec Header')
    expect(result.markdown).toContain('Paragraph text.')
  })

  it('strips javascript: links to plain text per PLAN §7.8', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Link Security Test</title></head>
        <body>
          <article>
            <h1>Link Security Test</h1>
            <p>Here is a <a href="javascript:alert('pwned')">malicious link</a> and a <a href="  JAVASCRIPT:void(0)">whitespace upper link</a>.</p>
            <p>Here is a <a href="https://example.com/safe">safe link</a> for comparison.</p>
          </article>
        </body>
      </html>
    `
    const { markdown } = parseHtmlToMarkdown(html)
    expect(markdown).toContain('malicious link')
    expect(markdown).toContain('whitespace upper link')
    expect(markdown).toContain('[safe link](https://example.com/safe)')
    expect(markdown).not.toContain('javascript:')
    expect(markdown).not.toContain('JAVASCRIPT:')
    expect(markdown).not.toContain('[malicious link]')
    expect(markdown).not.toContain('[whitespace upper link]')
  })
})
