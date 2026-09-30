import * as mammoth from 'mammoth/mammoth.browser'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { normalizeMarkdown } from '../core/markdown'
import { type Converter } from '../core/types'
import { PasswordRequiredError } from '../core/errors'

function hasOle2Signature(bytes: ArrayBuffer): boolean {
  const view = new Uint8Array(bytes.slice(0, 8))
  return view.length >= 4 && view[0] === 0xd0 && view[1] === 0xcf && view[2] === 0x11 && view[3] === 0xe0
}

function convertHtmlToMarkdown(html: string): string {
  const withMarkdownTables = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_table, body: string) => {
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...(row[1] ?? '').matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) =>
        (cell[1] ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim()
      )
    )
    if (!rows.length) return ''
    const header = rows[0] ?? []
    const separator = header.map(() => '---')
    return `\n\n| ${header.join(' | ')} |\n| ${separator.join(' | ')} |\n${rows.slice(1).map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`
  })
  const service = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
  service.use(gfm)
  return service.turndown(withMarkdownTables).replace(/^(\s*)-\s{2,}/gm, '$1- ')
}

export const docxConverter: Converter = {
  kind: 'docx',
  async convert(input, ctx) {
    if (hasOle2Signature(input.bytes)) {
      throw new PasswordRequiredError(
        'This DOCX is password protected or saved with an Office encryption wrapper. Save it without a password and try again.'
      )
    }

    ctx.onProgress({ phase: 'docx', current: 1, total: 1 })
    const result = await mammoth.convertToHtml({
      arrayBuffer: input.bytes,
      styleMap: ['p[style-name="Title"] => h1:fresh']
    })
    const markdown = normalizeMarkdown(convertHtmlToMarkdown(result.value ?? ''))

    const warnings = [] as { code: string; message: string; severity: 'info' | 'warn' }[]
    const imageCount = (result.value ?? '').match(/<img\b/gi)?.length ?? 0
    if (imageCount > 0) {
      warnings.push({
        code: 'IMAGES_OMITTED',
        message: `${imageCount} image${imageCount === 1 ? '' : 's'} omitted; text inside images is not captured.`,
        severity: 'warn'
      })
    }

    return {
      markdown: markdown || '# Document\n\nNo readable text was found in this DOCX.',
      warnings,
      stats: {}
    }
  }
}
