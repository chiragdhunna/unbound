/**
 * Copies the self-hosted OCR runtime from node_modules into public/ocr/ so the
 * app never needs a CDN (ADR-6) and the files always match the installed
 * tesseract.js version. English data is vendored in the repo and only validated.
 *
 * public/ocr/worker.min.js            <- tesseract.js/dist/worker.min.js
 * public/ocr/tesseract.js             <- tesseract.js/dist/tesseract.min.js
 * public/ocr/core/*.wasm.js           <- tesseract.js-core (LSTM variants; the
 *                                        worker picks one by CPU features)
 * public/ocr/lang/eng.traineddata     <- vendored; validated only
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve('.')
const out = join(root, 'public', 'ocr')
const jsPkg = join(root, 'node_modules', 'tesseract.js')
const corePkg = join(root, 'node_modules', 'tesseract.js-core')
const EXPECTED_VERSION = '7.0.0'
const MIN_TRAINEDDATA_BYTES = 1_000_000
const CORE_VARIANTS = ['lstm', 'simd-lstm', 'relaxedsimd-lstm']

function fail(message) {
  console.error(`sync-ocr-assets: ${message}`)
  process.exit(1)
}

function copy(from, to) {
  if (!existsSync(from)) fail(`missing source ${from}`)
  mkdirSync(join(to, '..'), { recursive: true })
  copyFileSync(from, to)
}

const installed = JSON.parse(readFileSync(join(jsPkg, 'package.json'), 'utf8')).version
if (installed !== EXPECTED_VERSION) {
  fail(`tesseract.js ${installed} is installed but ${EXPECTED_VERSION} is expected; update the assets deliberately`)
}

copy(join(jsPkg, 'dist', 'worker.min.js'), join(out, 'worker.min.js'))
copy(join(jsPkg, 'dist', 'tesseract.min.js'), join(out, 'tesseract.js'))
for (const variant of CORE_VARIANTS) {
  const file = `tesseract-core-${variant}.wasm.js`
  copy(join(corePkg, file), join(out, 'core', file))
}

const trained = join(out, 'lang', 'eng.traineddata')
if (!existsSync(trained)) fail('public/ocr/lang/eng.traineddata is missing; vendor the tessdata_fast English file')
const head = readFileSync(trained).subarray(0, 16).toString('latin1').trimStart()
if (head.startsWith('<')) fail('eng.traineddata looks like an HTML error page')
if (statSync(trained).size < MIN_TRAINEDDATA_BYTES) fail('eng.traineddata is smaller than 1 MB')

console.log('sync-ocr-assets: OCR assets are in place under public/ocr/')
