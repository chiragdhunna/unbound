import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import {
  CancelledError,
  CorruptFileError,
  LegacyDocError,
  NoTextFoundError,
  PasswordRequiredError,
  TooLargeError
} from '../core/errors'
import { normalizeMarkdown } from '../core/markdown'
import { buildMarkdownTable, escapeCellValue, padRowsToEqualLength } from '../core/table'
import {
  type Converter,
  type ConvertContext,
  type ConverterInput,
  type ConvertResult,
  type Warning
} from '../core/types'

const MAX_PART_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024 // 200 MB

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false
})

type XmlNode = Record<string, unknown>

function getLocalName(tag: string): string {
  const idx = tag.indexOf(':')
  return idx >= 0 ? tag.slice(idx + 1) : tag
}

function getNodeTag(node: XmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text' && !key.startsWith('?')) {
      return key
    }
  }
  return null
}

function getNodeAttributes(node: XmlNode): Record<string, string> {
  return (node[':@'] as Record<string, string>) || {}
}

function getNodeChildren(node: XmlNode): XmlNode[] {
  for (const [key, val] of Object.entries(node)) {
    if (key !== ':@' && key !== '#text' && !key.startsWith('?')) {
      return Array.isArray(val) ? (val as XmlNode[]) : []
    }
  }
  return []
}

function findDescendantNode(nodes: XmlNode[], expectedLocalName: string): XmlNode | null {
  for (const node of nodes) {
    const tag = getNodeTag(node)
    if (tag && getLocalName(tag) === expectedLocalName) {
      return node
    }
    const children = getNodeChildren(node)
    const found = findDescendantNode(children, expectedLocalName)
    if (found) return found
  }
  return null
}

function findChildNodes(parentNode: XmlNode, expectedLocalName?: string): XmlNode[] {
  const children = getNodeChildren(parentNode)
  if (!expectedLocalName) return children
  return children.filter((child) => {
    const tag = getNodeTag(child)
    return tag && getLocalName(tag) === expectedLocalName
  })
}

function normalizeZipPath(baseDir: string, target: string): string {
  let combined: string
  if (target.startsWith('/')) {
    combined = target.slice(1)
  } else {
    combined = (baseDir ? baseDir.replace(/\/+$/, '') + '/' : '') + target
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

function parseRels(relsXmlText: string): Map<string, { target: string; type: string }> {
  const relsMap = new Map<string, { target: string; type: string }>()
  try {
    const parsed = xmlParser.parse(relsXmlText) as XmlNode[]
    const relsNode = findDescendantNode(parsed, 'Relationships')
    if (relsNode) {
      const relChildren = findChildNodes(relsNode, 'Relationship')
      for (const rel of relChildren) {
        const attrs = getNodeAttributes(rel)
        const id = attrs['@_Id'] || attrs['@_id']
        const target = attrs['@_Target'] || attrs['@_target']
        const type = attrs['@_Type'] || attrs['@_type'] || ''
        const targetMode = attrs['@_TargetMode'] || attrs['@_targetMode']
        if (targetMode === 'External') continue
        if (id && target) {
          relsMap.set(id, { target, type })
        }
      }
    }
  } catch {
    // Ignore corrupt rels
  }
  return relsMap
}

function extractTextFromParagraph(pNode: XmlNode): string {
  let text = ''
  const children = getNodeChildren(pNode)
  for (const child of children) {
    const tag = getNodeTag(child)
    if (!tag) continue
    const local = getLocalName(tag)
    if (local === 'r' || local === 'fld') {
      const rChildren = getNodeChildren(child)
      for (const rChild of rChildren) {
        const rTag = getNodeTag(rChild)
        if (rTag && getLocalName(rTag) === 't') {
          const tChildren = getNodeChildren(rChild)
          for (const item of tChildren) {
            if (item && item['#text'] !== undefined) {
              text += String(item['#text'])
            }
          }
        }
      }
    } else if (local === 'br') {
      text += '\n'
    }
  }
  return text
}

function parseParagraphsFromTxBody(txBodyNode: XmlNode): string[] {
  const paras: string[] = []
  const pNodes = findChildNodes(txBodyNode, 'p')
  for (const p of pNodes) {
    const rawText = extractTextFromParagraph(p)
    if (!rawText.trim()) continue

    const pPr = findDescendantNode(getNodeChildren(p), 'pPr')
    let lvl = 0
    let hasBuNone = false
    let hasBuAutoNum = false
    let hasBuChar = false

    if (pPr) {
      const attrs = getNodeAttributes(pPr)
      lvl = parseInt(attrs['@_lvl'] || '0', 10)
      if (isNaN(lvl) || lvl < 0) lvl = 0
      const pPrChildren = getNodeChildren(pPr)
      hasBuNone = Boolean(findDescendantNode(pPrChildren, 'buNone'))
      hasBuAutoNum = Boolean(findDescendantNode(pPrChildren, 'buAutoNum'))
      hasBuChar = Boolean(
        findDescendantNode(pPrChildren, 'buChar') ||
          findDescendantNode(pPrChildren, 'buBlip')
      )
    }

    const indent = '  '.repeat(lvl)
    let formatted: string

    if (hasBuNone) {
      formatted = rawText.trim()
    } else if (hasBuAutoNum) {
      formatted = `${indent}1. ${rawText.trim()}`
    } else if (hasBuChar) {
      formatted = `${indent}- ${rawText.trim()}`
    } else if (lvl > 0) {
      formatted = `${indent}- ${rawText.trim()}`
    } else {
      formatted = rawText.trim()
    }

    paras.push(formatted)
  }
  return paras
}

function parseTableFromGraphicFrame(gfNode: XmlNode): string | null {
  const tbl = findDescendantNode(getNodeChildren(gfNode), 'tbl')
  if (!tbl) return null

  const trNodes = findChildNodes(tbl, 'tr')
  const rows: string[][] = []

  for (const tr of trNodes) {
    const tcNodes = findChildNodes(tr, 'tc')
    const rowCells: string[] = []
    for (const tc of tcNodes) {
      const txBody = findDescendantNode(getNodeChildren(tc), 'txBody')
      if (!txBody) {
        rowCells.push('')
        continue
      }
      const pNodes = findChildNodes(txBody, 'p')
      const pTexts = pNodes.map(extractTextFromParagraph).filter((t) => t.length > 0)
      const cellText = pTexts.join('\n')
      rowCells.push(escapeCellValue(cellText))
    }
    rows.push(rowCells)
  }

  if (rows.length === 0 || rows.every((r) => r.every((c) => c === ''))) {
    return null
  }

  const padded = padRowsToEqualLength(rows)
  return buildMarkdownTable(padded)
}

function hasOle2Signature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
}

interface ShapeExtractionResult {
  titleText: string | null
  bodyItems: string[]
  imageCount: number
  chartCount: number
}

function extractShapes(shapeNodes: XmlNode[]): ShapeExtractionResult {
  let titleText: string | null = null
  const bodyItems: string[] = []
  let imageCount = 0
  let chartCount = 0

  let titleShapeNode: XmlNode | null = null
  for (const node of shapeNodes) {
    const tag = getNodeTag(node)
    if (tag && getLocalName(tag) === 'sp') {
      const nvSpPr = findDescendantNode(getNodeChildren(node), 'nvSpPr')
      const ph = nvSpPr ? findDescendantNode(getNodeChildren(nvSpPr), 'ph') : null
      if (ph) {
        const phType = getNodeAttributes(ph)['@_type']
        if (phType === 'title' || phType === 'ctrTitle') {
          const txBody = findDescendantNode(getNodeChildren(node), 'txBody')
          if (txBody) {
            const paras = findChildNodes(txBody, 'p')
            const fullTitle = paras.map(extractTextFromParagraph).join(' ').trim()
            if (fullTitle) {
              titleText = fullTitle
              titleShapeNode = node
              break
            }
          }
        }
      }
    }
  }

  function traverseNode(node: XmlNode) {
    const tag = getNodeTag(node)
    if (!tag) return
    const local = getLocalName(tag)

    if (local === 'grpSp') {
      const children = getNodeChildren(node)
      for (const child of children) {
        traverseNode(child)
      }
    } else if (local === 'sp') {
      if (node === titleShapeNode) return

      const nvSpPr = findDescendantNode(getNodeChildren(node), 'nvSpPr')
      const ph = nvSpPr ? findDescendantNode(getNodeChildren(nvSpPr), 'ph') : null
      if (ph) {
        const phType = getNodeAttributes(ph)['@_type']
        if (phType && ['sldNum', 'dt', 'ftr', 'sldImg'].includes(phType)) {
          return
        }
      }

      const txBody = findDescendantNode(getNodeChildren(node), 'txBody')
      if (txBody) {
        const paras = parseParagraphsFromTxBody(txBody)
        bodyItems.push(...paras)
      }
    } else if (local === 'graphicFrame') {
      const tableMd = parseTableFromGraphicFrame(node)
      if (tableMd) {
        bodyItems.push(tableMd)
      } else {
        chartCount++
      }
    } else if (local === 'pic') {
      imageCount++
    } else if (local === 'AlternateContent') {
      chartCount++
    } else if (local === 'oleObj') {
      chartCount++
    }
  }

  for (const node of shapeNodes) {
    traverseNode(node)
  }

  return { titleText, bodyItems, imageCount, chartCount }
}

function joinBodyItems(items: string[]): string {
  let result = ''
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (i === 0) {
      result = item
      continue
    }
    const prev = items[i - 1]!
    const isPrevList = /^\s*(-|\d+\.)\s/.test(prev)
    const isCurrList = /^\s*(-|\d+\.)\s/.test(item)
    if (isPrevList && isCurrList) {
      result += '\n' + item
    } else {
      result += '\n\n' + item
    }
  }
  return result
}

export const pptxConverter: Converter = {
  kind: 'pptx',
  async convert(input: ConverterInput, ctx: ConvertContext): Promise<ConvertResult> {
    const bytes = new Uint8Array(input.bytes)
    if (hasOle2Signature(bytes)) {
      if (input.name.toLowerCase().endsWith('.ppt')) {
        throw new LegacyDocError(
          'Legacy .ppt files are not supported. Save as .pptx and try again.'
        )
      } else {
        throw new PasswordRequiredError(
          'This PowerPoint is password-protected. Save a copy without a password and try again.'
        )
      }
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(bytes)
    } catch {
      throw new CorruptFileError(
        'This file is not a valid PPTX archive or is corrupted.'
      )
    }

    let totalDeclared = 0
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue
      const uncompressedSize = (
        file as unknown as { _data?: { uncompressedSize?: number } }
      )._data?.uncompressedSize
      if (typeof uncompressedSize === 'number') {
        if (uncompressedSize > MAX_PART_SIZE) {
          throw new TooLargeError(
            `PPTX entry ${file.name} exceeds maximum uncompressed size limit of 20MB.`
          )
        }
        totalDeclared += uncompressedSize
        if (totalDeclared > MAX_TOTAL_SIZE) {
          throw new TooLargeError(
            'PPTX total uncompressed size exceeds maximum limit of 200MB.'
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
          `PPTX entry ${file.name} exceeds maximum size limit of 20MB.`
        )
      }
      totalReadBytes += byteLen
      if (totalReadBytes > MAX_TOTAL_SIZE) {
        throw new TooLargeError(
          'PPTX total uncompressed size exceeds maximum limit of 200MB.'
        )
      }
      return text
    }

    const presFile = zip.file('ppt/presentation.xml')
    if (!presFile) {
      throw new CorruptFileError('ppt/presentation.xml not found in PPTX archive.')
    }
    const presXmlText = await readZipText(presFile)

    let presRelsMap = new Map<string, { target: string; type: string }>()
    const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
    if (presRelsFile) {
      const presRelsXmlText = await readZipText(presRelsFile)
      presRelsMap = parseRels(presRelsXmlText)
    }

    const presParsed = xmlParser.parse(presXmlText) as XmlNode[]
    const sldIdLst = findDescendantNode(presParsed, 'sldIdLst')
    const sldIds = sldIdLst ? findChildNodes(sldIdLst, 'sldId') : []

    const slidePaths: string[] = []
    for (const sldIdNode of sldIds) {
      const attrs = getNodeAttributes(sldIdNode)
      const rId = attrs['@_r:id'] || attrs['@_id']
      if (rId && presRelsMap.has(rId)) {
        const rel = presRelsMap.get(rId)!
        const slidePath = normalizeZipPath('ppt', rel.target)
        slidePaths.push(slidePath)
      }
    }

    let totalImages = 0
    let totalCharts = 0
    const slideSections: string[] = []
    let totalTextChars = 0

    const totalSlides = slidePaths.length

    for (let i = 0; i < totalSlides; i++) {
      if (ctx.signal.aborted) {
        throw new CancelledError()
      }

      ctx.onProgress({
        phase: 'pptx',
        current: i + 1,
        total: totalSlides
      })

      const slidePath = slidePaths[i]!
      const slideFile = zip.file(slidePath)
      if (!slideFile) continue

      const slideXmlText = await readZipText(slideFile)
      const slideParsed = xmlParser.parse(slideXmlText) as XmlNode[]

      const sldRoot = findDescendantNode(slideParsed, 'sld')
      let isHidden = false
      if (sldRoot) {
        const sldAttrs = getNodeAttributes(sldRoot)
        if (sldAttrs['@_show'] === '0') {
          isHidden = true
        }
      }

      const slideNum = i + 1
      const heading = isHidden ? `## Slide ${slideNum} (hidden)` : `## Slide ${slideNum}`

      const spTree = findDescendantNode(slideParsed, 'spTree')
      const shapes = spTree ? getNodeChildren(spTree) : []

      const { titleText, bodyItems, imageCount, chartCount } = extractShapes(shapes)
      totalImages += imageCount
      totalCharts += chartCount

      let notesText = ''
      const slideFileName = slidePath.split('/').pop() || ''
      const slideRelsPath = `ppt/slides/_rels/${slideFileName}.rels`
      const slideRelsFile = zip.file(slideRelsPath)
      if (slideRelsFile) {
        const slideRelsText = await readZipText(slideRelsFile)
        const slideRelsMap = parseRels(slideRelsText)
        for (const [, rel] of slideRelsMap.entries()) {
          if (rel.type.endsWith('/notesSlide') || rel.type.includes('notesSlide')) {
            const notesPath = normalizeZipPath('ppt/slides', rel.target)
            const notesFile = zip.file(notesPath)
            if (notesFile) {
              const notesXmlText = await readZipText(notesFile)
              const notesParsed = xmlParser.parse(notesXmlText) as XmlNode[]
              const notesSpTree = findDescendantNode(notesParsed, 'spTree')
              const noteShapes = notesSpTree ? getNodeChildren(notesSpTree) : []
              const noteParas: string[] = []
              for (const sp of noteShapes) {
                const nvSpPr = findDescendantNode(getNodeChildren(sp), 'nvSpPr')
                const ph = nvSpPr ? findDescendantNode(getNodeChildren(nvSpPr), 'ph') : null
                if (ph) {
                  const phType = getNodeAttributes(ph)['@_type']
                  if (phType && ['sldImg', 'sldNum'].includes(phType)) continue
                }
                const txBody = findDescendantNode(getNodeChildren(sp), 'txBody')
                if (txBody) {
                  noteParas.push(...parseParagraphsFromTxBody(txBody))
                }
              }
              if (noteParas.length > 0) {
                notesText = joinBodyItems(noteParas)
              }
            }
            break
          }
        }
      }

      const slideContent: string[] = [heading]
      if (titleText) {
        slideContent.push(`### ${titleText}`)
        totalTextChars += titleText.length
      }
      if (bodyItems.length > 0) {
        slideContent.push(joinBodyItems(bodyItems))
        totalTextChars += bodyItems.reduce((acc, item) => acc + item.length, 0)
      }
      if (notesText) {
        slideContent.push(`**Notes:**\n\n${notesText}`)
        totalTextChars += notesText.length
      }

      slideSections.push(slideContent.join('\n\n'))
    }

    if (totalTextChars === 0) {
      throw new NoTextFoundError('No text found in this PPTX.')
    }

    const warnings: Warning[] = []
    if (totalImages > 0 || totalCharts > 0) {
      warnings.push({
        code: 'PPTX_NON_TEXT_OMITTED',
        message: `${totalImages} images, ${totalCharts} charts/diagrams were omitted`,
        severity: 'info'
      })
    }

    const rawMarkdown = slideSections.join('\n\n')
    const markdown = normalizeMarkdown(rawMarkdown)

    return {
      markdown,
      warnings,
      stats: {
        slides: totalSlides
      }
    }
  }
}
