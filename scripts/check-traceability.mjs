import fs from 'node:fs'
import path from 'node:path'

const matrix = fs.readFileSync(path.join(process.cwd(), 'docs/TRACEABILITY.md'), 'utf8')
const outputFiles = (process.env.TRACEABILITY_TEST_OUTPUT ?? '').split(path.delimiter).filter(Boolean)
const testOutput = outputFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const rows = matrix.split('\n').filter((line) => /^\| R\d+/.test(line))
if (rows.length === 0) throw new Error('Traceability matrix has no requirement rows.')
if (matrix.includes('TBD')) throw new Error('Traceability matrix still contains TBD.')

for (const row of rows) {
  if (!row.includes('✅')) continue
  const cells = row.split('|').map((cell) => cell.trim())
  const test = cells[4] ?? ''
  const references = [...test.matchAll(/`([^`]+)`::([^;]+?)(?=;|$)/g)]
  if (references.length === 0) throw new Error(`Completed traceability row has no named test: ${row}`)
  for (const [, file, name] of references) {
    if (!fs.existsSync(path.join(process.cwd(), file))) throw new Error(`Traceability test file does not exist: ${file}`)
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    if (!source.includes(name.trim())) throw new Error(`Traceability test name is not in ${file}: ${name.trim()}`)
    if (testOutput && !testOutput.includes(name.trim())) throw new Error(`Traceability test did not appear in gate output: ${name.trim()}`)
  }
}
console.log(`Traceability checked: ${rows.length} rows; completed rows have test files.`)
