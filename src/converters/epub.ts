import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  PasswordRequiredError,
  TooLargeError
} from '../core/errors'
import { normalizeMarkdown } from '../core/markdown'
import { createTurndown } from './html'
import {
  type Converter,
  type ConverterInput,
  type ConvertContext,
  type ConvertResult,
  type Warning
} from '../core/types'

const MAX_PART_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024 // 200 MB
const MAX_CHAPTERS = 2000

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false
})

function normalizeZipPath(baseDir: string, target: string): string {
  const cleanTarget = target.split('#')[0]!.split('?')[0]!
  let combined: string
  if (cleanTarget.startsWith('/')) {
    combined = cleanTarget.slice(1)
  } else {
    combined = (baseDir ? baseDir.replace(/\/+$/, '') + '/' : '') + cleanTarget
  }
  const parts = combined.split('/')
  const resolved: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') {
      resolved.pop()
    } else {
      resolved.push(p)
    }
  }
  return resolved.join('/')
}

async function checkDrm(zip: JSZip): Promise<void> {
  if (zip.file('META-INF/rights.xml')) {
    throw new PasswordRequiredError(
      "This EPUB is DRM-protected and can't be converted."
    )
  }
  const encFile = zip.file('META-INF/encryption.xml')
  if (!encFile) return

  const xmlText = await encFile.async('text')
  const fontObfuscationAlgos = [
    'http://www.idpf.org/2008/embedding',
    'http://ns.adobe.com/pdf/enc/digital/book/2004',
    'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'
  ]
  const isFontOnly = fontObfuscationAlgos.some((algo) => xmlText.includes(algo))

  if (
    /Algorithm=["'][^"']*(aes|des|rsa|fairplay|lcp)[^"']*["']/i.test(xmlText) ||
    /CipherReference[^>]*URI=["'][^"']*\.(xhtml|html|xml|opf)["']/i.test(xmlText)
  ) {
    throw new PasswordRequiredError(
      "This EPUB is DRM-protected and can't be converted."
    )
  }

  if (!isFontOnly && xmlText.includes('EncryptedData')) {
    throw new PasswordRequiredError(
      "This EPUB is DRM-protected and can't be converted."
    )
  }
}

export const epubConverter: Converter = {
  kind: 'epub',
  async convert(input: ConverterInput, ctx: ConvertContext): Promise<ConvertResult> {
    if (ctx.signal?.aborted) {
      throw new CancelledError()
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(input.bytes)
    } catch {
      throw new CorruptFileError(
        'This file is not a valid EPUB archive or is corrupted.'
      )
    }

    await checkDrm(zip)

    let totalDeclared = 0
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      const uncompressedSize = (
        file as unknown as { _data?: { uncompressedSize?: number } }
      )._data?.uncompressedSize
      if (typeof uncompressedSize === 'number') {
        if (uncompressedSize > MAX_PART_SIZE) {
          throw new TooLargeError(
            `EPUB entry ${file.name} exceeds maximum uncompressed size limit of 20MB.`
          )
        }
        totalDeclared += uncompressedSize
        if (totalDeclared > MAX_TOTAL_SIZE) {
          throw new TooLargeError(
            'EPUB total uncompressed size exceeds maximum limit of 200MB.'
          )
        }
      }
    }

    let totalReadBytes = 0
    async function readZipText(file: JSZip.JSZipObject): Promise<string> {
      const text = await file.async('text')
      const byteLen = new TextEncoder().encode(text).length
      if (byteLen > MAX_PART_SIZE) {
        throw new TooLargeError(
          `EPUB entry ${file.name} exceeds maximum size limit of 20MB.`
        )
      }
      totalReadBytes += byteLen
      if (totalReadBytes > MAX_TOTAL_SIZE) {
        throw new TooLargeError(
          'EPUB total uncompressed size exceeds maximum limit of 200MB.'
        )
      }
      return text
    }

    const containerFile = zip.file('META-INF/container.xml')
    if (!containerFile) {
      throw new CorruptFileError('META-INF/container.xml not found in EPUB archive.')
    }
    const containerText = await readZipText(containerFile)
    let containerParsed: Record<string, unknown>
    try {
      containerParsed = xmlParser.parse(containerText) as Record<string, unknown>
    } catch {
      throw new CorruptFileError('Invalid XML in META-INF/container.xml.')
    }

    let opfPath = ''
    const containerNode = containerParsed.container as Record<string, unknown> | undefined
    const rootfilesNode = containerNode?.rootfiles as Record<string, unknown> | undefined
    const rootfileList = Array.isArray(rootfilesNode?.rootfile)
      ? rootfilesNode!.rootfile
      : rootfilesNode?.rootfile
        ? [rootfilesNode.rootfile]
        : []

    for (const rf of rootfileList as Array<Record<string, unknown>>) {
      const fullPath = rf['@_full-path'] as string | undefined
      if (fullPath) {
        opfPath = fullPath
        break
      }
    }

    if (!opfPath) {
      throw new CorruptFileError('No rootfile found in EPUB container.')
    }

    const opfFile = zip.file(opfPath) || zip.file(decodeURIComponent(opfPath))
    if (!opfFile) {
      throw new CorruptFileError(`OPF file '${opfPath}' not found in EPUB archive.`)
    }
    const opfText = await readZipText(opfFile)
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''

    let opfParsed: Record<string, unknown>
    try {
      opfParsed = xmlParser.parse(opfText) as Record<string, unknown>
    } catch {
      throw new CorruptFileError(`Invalid XML in OPF file '${opfPath}'.`)
    }

    const packageNode = (opfParsed.package || opfParsed['opf:package']) as
      | Record<string, unknown>
      | undefined
    if (!packageNode) {
      throw new CorruptFileError('Invalid OPF package structure in EPUB.')
    }

    const metadata = (packageNode.metadata || packageNode['opf:metadata']) as
      | Record<string, unknown>
      | undefined
    let title = ''
    let author = ''

    if (metadata) {
      const dcTitle = metadata['dc:title']
      if (typeof dcTitle === 'string') {
        title = dcTitle.trim()
      } else if (Array.isArray(dcTitle) && dcTitle.length > 0) {
        const first = dcTitle[0]
        title = String(typeof first === 'object' && first ? (first['#text'] || Object.values(first)[0]) : first).trim()
      } else if (dcTitle && typeof dcTitle === 'object') {
        title = String((dcTitle as Record<string, unknown>)['#text'] || '').trim()
      }

      const dcCreator = metadata['dc:creator']
      if (typeof dcCreator === 'string') {
        author = dcCreator.trim()
      } else if (Array.isArray(dcCreator) && dcCreator.length > 0) {
        const first = dcCreator[0]
        author = String(typeof first === 'object' && first ? (first['#text'] || Object.values(first)[0]) : first).trim()
      } else if (dcCreator && typeof dcCreator === 'object') {
        author = String((dcCreator as Record<string, unknown>)['#text'] || '').trim()
      }
    }

    const manifestNode = (packageNode.manifest || packageNode['opf:manifest']) as
      | Record<string, unknown>
      | undefined
    const manifestItems = new Map<string, { href: string; mediaType: string; properties?: string }>()

    if (manifestNode) {
      const rawItems = Array.isArray(manifestNode.item)
        ? manifestNode.item
        : manifestNode.item
          ? [manifestNode.item]
          : []

      for (const item of rawItems as Array<Record<string, unknown>>) {
        const id = item['@_id'] as string | undefined
        const href = item['@_href'] as string | undefined
        const mediaType = (item['@_media-type'] as string | undefined) || ''
        const properties = item['@_properties'] as string | undefined
        if (id && href) {
          const resolved = normalizeZipPath(opfDir, decodeURIComponent(href))
          manifestItems.set(id, { href: resolved, mediaType, properties })
        }
      }
    }

    const spineNode = (packageNode.spine || packageNode['opf:spine']) as
      | Record<string, unknown>
      | undefined
    const spineIdrefs: Array<{ idref: string; linear: boolean }> = []

    if (spineNode) {
      const rawItemrefs = Array.isArray(spineNode.itemref)
        ? spineNode.itemref
        : spineNode.itemref
          ? [spineNode.itemref]
          : []

      for (const ir of rawItemrefs as Array<Record<string, unknown>>) {
        const idref = ir['@_idref'] as string | undefined
        const linear = ir['@_linear'] !== 'no'
        if (idref) {
          spineIdrefs.push({ idref, linear })
        }
      }
    }

    const spineFiles: Array<{ path: string; linear: boolean }> = []
    for (const item of spineIdrefs) {
      const manifestItem = manifestItems.get(item.idref)
      if (manifestItem) {
        const isHtml =
          manifestItem.mediaType === 'application/xhtml+xml' ||
          manifestItem.mediaType === 'text/html' ||
          manifestItem.href.endsWith('.xhtml') ||
          manifestItem.href.endsWith('.html') ||
          manifestItem.href.endsWith('.htm')

        if (isHtml) {
          spineFiles.push({ path: manifestItem.href, linear: item.linear })
        }
      }
    }

    if (spineFiles.length === 0) {
      throw new NoTextFoundError('No text found in this EPUB.')
    }

    const chaptersToProcess = spineFiles.slice(0, MAX_CHAPTERS)
    const chapterSections: string[] = []
    let totalImagesOmitted = 0
    let totalChars = 0
    const turndown = createTurndown()

    for (let i = 0; i < chaptersToProcess.length; i++) {
      if (ctx.signal?.aborted) {
        throw new CancelledError()
      }

      ctx.onProgress({
        phase: 'epub',
        current: i + 1,
        total: chaptersToProcess.length
      })

      const { path: chapterPath, linear } = chaptersToProcess[i]!
      const chapterFile = zip.file(chapterPath) || zip.file(decodeURIComponent(chapterPath))
      if (!chapterFile) continue

      const xhtmlText = await readZipText(chapterFile)
      const doc = new DOMParser().parseFromString(xhtmlText, 'text/html')

      doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove())

      const imgs = doc.querySelectorAll('img, svg, image')
      totalImagesOmitted += imgs.length
      imgs.forEach((img) => img.remove())

      doc.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || ''
        if (/^\s*javascript:/i.test(href)) {
          a.removeAttribute('href')
        }
      })

      const body = doc.body
      if (!body) continue

      let chapterTitle = ''
      const firstHeading = body.querySelector('h1, h2, h3')
      if (firstHeading && firstHeading.textContent?.trim()) {
        chapterTitle = firstHeading.textContent.trim()
      } else if (doc.title && doc.title.trim() && doc.title.trim() !== title) {
        chapterTitle = doc.title.trim()
      }

      let md = turndown.turndown(body.innerHTML).trim()
      if (!md && !linear) {
        continue
      }

      if (chapterTitle) {
        const escaped = chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        md = md.replace(new RegExp(`^#+\\s+${escaped}\\s*\\n*`, 'i'), '').trim()
      } else {
        chapterTitle = `Chapter ${i + 1}`
      }

      md = md.replace(/^(#{1,5})\s+/gm, '#$1 ')

      if (md) {
        totalChars += md.length
      }

      const chapterBlock = md ? `## ${chapterTitle}\n\n${md}` : `## ${chapterTitle}`
      chapterSections.push(chapterBlock)
    }

    if (totalChars === 0 && !title) {
      throw new NoTextFoundError('No text found in this EPUB.')
    }

    let finalMarkdown = ''
    if (title) {
      finalMarkdown += `# ${title}\n\n`
    }
    if (author) {
      finalMarkdown += `*By ${author}*\n\n`
    }
    finalMarkdown += chapterSections.join('\n\n')

    const warnings: Warning[] = []
    if (totalImagesOmitted > 0) {
      warnings.push({
        code: 'EPUB_IMAGES_OMITTED',
        message: `${totalImagesOmitted} images were omitted; text inside images is not captured.`,
        severity: 'info'
      })
    }

    return {
      markdown: normalizeMarkdown(finalMarkdown),
      warnings,
      stats: {
        pages: chaptersToProcess.length
      }
    }
  }
}
