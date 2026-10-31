import JSZip from 'jszip'
import {
  CancelledError,
  CorruptFileError,
  NoTextFoundError,
  PasswordRequiredError,
  TooLargeError,
  errorMessage
} from '../core/errors'
import { isJunkPath } from '../core/junk'
import { normalizeMarkdown } from '../core/markdown'
import { detectFileKind } from '../core/detect'
import { loadConverter } from '../core/registry'
import {
  type Converter,
  type ConverterInput,
  type ConvertContext,
  type ConvertResult,
  type Warning
} from '../core/types'

export const ZIP_MAX_ENTRIES = 500
export const ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024 // 200 MB
export const ZIP_MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
export const ZIP_MAX_OUTPUT_CHARS = 2 * 1024 * 1024 // 2M chars
export const ZIP_MAX_NESTING_DEPTH = 3

export function sanitizeZipEntryPath(rawPath: string): string {
  const parts = rawPath.replace(/\\/g, '/').split('/')
  const safeParts: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      safeParts.pop()
    } else {
      safeParts.push(part)
    }
  }
  return safeParts.join('/')
}

export function isZipEncrypted(bytes: ArrayBuffer): boolean {
  const view = new DataView(bytes)
  const len = bytes.byteLength
  for (let i = 0; i <= len - 30; i++) {
    if (view.getUint32(i, true) === 0x04034b50) {
      const flag = view.getUint16(i + 6, true)
      if ((flag & 1) !== 0) return true
    } else if (i <= len - 46 && view.getUint32(i, true) === 0x02014b50) {
      const flag = view.getUint16(i + 8, true)
      if ((flag & 1) !== 0) return true
    }
  }
  return false
}

export function buildAsciiFileTree(
  rootName: string,
  paths: string[],
  skippedCount = 0
): string {
  interface TreeNode {
    name: string
    isDir: boolean
    children: Map<string, TreeNode>
  }
  const root: TreeNode = { name: rootName, isDir: true, children: new Map() }

  for (const p of paths) {
    const parts = p.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isLast = i === parts.length - 1
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isDir: !isLast,
          children: new Map()
        })
      }
      current = current.children.get(part)!
    }
  }

  const lines: string[] = [rootName.endsWith('/') ? rootName : `${rootName}/`]

  function render(node: TreeNode, indent: string) {
    const sorted = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    for (const child of sorted) {
      if (child.isDir) {
        lines.push(`${indent}${child.name}/`)
        render(child, indent + '  ')
      } else {
        lines.push(`${indent}${child.name}`)
      }
    }
  }

  render(root, '  ')
  if (skippedCount > 0) {
    lines.push(`(${skippedCount} skipped: junk or unsupported)`)
  }

  return lines.join('\n')
}

interface RawZipEntry {
  displayPath: string
  file: JSZip.JSZipObject
  depth: number
}

async function collectZipEntries(
  zipBytes: ArrayBuffer,
  basePath: string,
  depth: number,
  collected: RawZipEntry[],
  stats: { totalDeclared: number; skippedCount: number }
): Promise<void> {
  if (isZipEncrypted(zipBytes)) {
    throw new PasswordRequiredError(
      'This ZIP is password-protected. Extract it with a password and drop the files instead.'
    )
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(zipBytes)
  } catch {
    throw new CorruptFileError(
      'This file is not a valid ZIP archive or is corrupted.'
    )
  }

  for (const [rawName, file] of Object.entries(zip.files)) {
    if (file.dir) continue
    const sanitized = sanitizeZipEntryPath(rawName)
    if (!sanitized) continue

    const displayPath = basePath ? `${basePath}/${sanitized}` : sanitized

    if (isJunkPath(sanitized) || isJunkPath(displayPath)) {
      stats.skippedCount++
      continue
    }

    const uncompressed = (
      file as unknown as { _data?: { uncompressedSize?: number } }
    )._data?.uncompressedSize

    if (typeof uncompressed === 'number') {
      if (uncompressed > ZIP_MAX_FILE_BYTES) {
        throw new TooLargeError(
          `ZIP entry ${displayPath} exceeds maximum uncompressed size limit of 50MB.`
        )
      }
      stats.totalDeclared += uncompressed
      if (stats.totalDeclared > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new TooLargeError(
          'ZIP total uncompressed size exceeds maximum limit of 200MB.'
        )
      }
    }

    // Recurse into nested .zip files if depth allows
    if (sanitized.toLowerCase().endsWith('.zip')) {
      if (depth < ZIP_MAX_NESTING_DEPTH) {
        const nestedBytes = await file.async('arraybuffer')
        await collectZipEntries(
          nestedBytes,
          displayPath,
          depth + 1,
          collected,
          stats
        )
      } else {
        stats.skippedCount++
      }
    } else {
      collected.push({ displayPath, file, depth })
    }
  }
}

export const zipConverter: Converter = {
  kind: 'zip',
  async convert(
    input: ConverterInput,
    ctx: ConvertContext
  ): Promise<ConvertResult> {
    if (ctx.signal?.aborted) {
      throw new CancelledError()
    }

    const collectedEntries: RawZipEntry[] = []
    const statsTracker = { totalDeclared: 0, skippedCount: 0 }

    await collectZipEntries(input.bytes, '', 1, collectedEntries, statsTracker)

    if (collectedEntries.length === 0) {
      throw new NoTextFoundError(
        'No convertible text files found in this ZIP archive.'
      )
    }

    // Sort depth-first, alphabetical, stable
    collectedEntries.sort((a, b) =>
      a.displayPath.localeCompare(b.displayPath, undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    )

    const warnings: Warning[] = []
    const validPathsForTree: string[] = []
    const convertedBlocks: string[] = []
    let totalUncompressedRead = 0
    let totalOutputChars = 0
    let failedEntriesCount = 0
    let limitReached = false

    const maxEntriesToProcess = Math.min(
      collectedEntries.length,
      ZIP_MAX_ENTRIES
    )
    if (collectedEntries.length > ZIP_MAX_ENTRIES) {
      limitReached = true
    }

    for (let i = 0; i < maxEntriesToProcess; i++) {
      if (ctx.signal?.aborted) {
        throw new CancelledError()
      }

      ctx.onProgress({
        phase: 'zip',
        current: i + 1,
        total: maxEntriesToProcess
      })

      // Cooperative yield
      await new Promise((resolve) => setTimeout(resolve, 0))

      const entry = collectedEntries[i]!
      const entryName = entry.displayPath.split('/').pop() || entry.displayPath
      const entryBytes = await entry.file.async('arraybuffer')

      if (entryBytes.byteLength > ZIP_MAX_FILE_BYTES) {
        warnings.push({
          code: 'ZIP_LIMIT_REACHED',
          message: `Entry ${entry.displayPath} exceeds per-file size limit of 50MB and was skipped.`,
          severity: 'warn'
        })
        statsTracker.skippedCount++
        continue
      }

      totalUncompressedRead += entryBytes.byteLength
      if (totalUncompressedRead > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
        warnings.push({
          code: 'ZIP_LIMIT_REACHED',
          message: `Reached total uncompressed size limit of 200MB; remaining ${collectedEntries.length - i} files were skipped.`,
          severity: 'warn'
        })
        limitReached = true
        break
      }

      const detectedKind = detectFileKind({
        name: entryName,
        mime: '',
        bytes: entryBytes
      })

      if (detectedKind === 'unknown') {
        statsTracker.skippedCount++
        continue
      }

      validPathsForTree.push(entry.displayPath)

      try {
        const converter = await loadConverter(detectedKind)
        const fileResult = await converter.convert(
          {
            name: entryName,
            mime: '',
            bytes: entryBytes
          },
          ctx
        )

        const trimmedMd = fileResult.markdown.trim()
        const block = `# File: ${entry.displayPath}\n\n${trimmedMd}`
        totalOutputChars += block.length

        if (totalOutputChars > ZIP_MAX_OUTPUT_CHARS) {
          warnings.push({
            code: 'ZIP_LIMIT_REACHED',
            message: `Reached output character limit of ${ZIP_MAX_OUTPUT_CHARS}; remaining files were skipped.`,
            severity: 'warn'
          })
          limitReached = true
          convertedBlocks.push(block)
          break
        }

        convertedBlocks.push(block)
      } catch (err) {
        failedEntriesCount++
        const reason = errorMessage(err)
        const block = `# File: ${entry.displayPath}\n\n> ⚠ ${entry.displayPath}: ${reason}`
        convertedBlocks.push(block)
      }
    }

    if (collectedEntries.length > ZIP_MAX_ENTRIES) {
      const skippedFromEntryLimit = collectedEntries.length - ZIP_MAX_ENTRIES
      warnings.push({
        code: 'ZIP_LIMIT_REACHED',
        message: `Reached maximum limit of ${ZIP_MAX_ENTRIES} entries; ${skippedFromEntryLimit} files were skipped.`,
        severity: 'warn'
      })
    }

    if (convertedBlocks.length === 0) {
      throw new NoTextFoundError(
        'No convertible text files found in this ZIP archive.'
      )
    }

    if (failedEntriesCount > 0) {
      warnings.push({
        code: 'ZIP_ENTRIES_FAILED',
        message: `${failedEntriesCount} file(s) failed conversion inside the archive.`,
        severity: 'warn'
      })
    }

    const rootName = input.name || 'archive.zip'
    const treeText = buildAsciiFileTree(
      rootName,
      validPathsForTree,
      statsTracker.skippedCount
    )
    const treeSection = `## Files\n\n\`\`\`\n${treeText}\n\`\`\``

    const finalMarkdown = `${treeSection}\n\n${convertedBlocks.join('\n\n')}`

    return {
      markdown: normalizeMarkdown(finalMarkdown),
      warnings,
      stats: {
        files: convertedBlocks.length,
        truncated: limitReached
      }
    }
  }
}
