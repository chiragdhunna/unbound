import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = process.cwd()
const dist = path.join(root, 'dist')
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const entryNames = [...html.matchAll(/<script[^>]+src="\/([^"?]+\.js)"/g)].map((match) => match[1])
if (entryNames.length === 0) throw new Error('No JavaScript entry found in dist/index.html.')

const entrySize = entryNames.reduce((total, name) => total + zlib.gzipSync(fs.readFileSync(path.join(dist, name))).length, 0)
const limit = 250 * 1024
if (entrySize > limit) throw new Error(`Initial JavaScript gzip budget exceeded: ${entrySize} bytes > ${limit} bytes.`)

const entryText = entryNames.map((name) => fs.readFileSync(path.join(dist, name), 'utf8')).join('\n')
if (/mammoth|TurndownService|turndown-plugin-gfm/.test(entryText)) throw new Error('DOCX conversion code was bundled into the initial entry.')

console.log(`Initial JavaScript gzip: ${entrySize} bytes / ${limit} bytes`)
console.log(`Lazy JavaScript chunks: ${fs.readdirSync(path.join(dist, 'assets')).filter((name) => name.endsWith('.js')).length - entryNames.length}`)
