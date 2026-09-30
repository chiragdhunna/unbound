import fs from 'node:fs'
import path from 'node:path'

const matrix = fs.readFileSync(path.join(process.cwd(), 'docs/TRACEABILITY.md'), 'utf8')
const rows = matrix.split('\n').filter((line) => /^\| R\d+/.test(line))
if (rows.length === 0) throw new Error('Traceability matrix has no requirement rows.')
if (matrix.includes('TBD')) throw new Error('Traceability matrix still contains TBD.')

for (const row of rows) {
  if (!row.includes('✅')) continue
  const cells = row.split('|').map((cell) => cell.trim())
  const test = cells[4] ?? ''
  const references = [...test.matchAll(/`([^`]+)`::([^;]+?)(?=;|$)/g)]
  if (references.length === 0) throw new Error(`Completed traceability row has no named test: ${row}`)
  for (const [, file] of references) {
    if (!fs.existsSync(path.join(process.cwd(), file))) throw new Error(`Traceability test file does not exist: ${file}`)
  }
}
console.log(`Traceability checked: ${rows.length} rows; completed rows have test files.`)
