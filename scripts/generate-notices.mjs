#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const lockPath = path.resolve('package-lock.json')
const pkgPath = path.resolve('package.json')
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const rootPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const prodDeps = new Set()
function addDeps(pkgName) {
  const pkg = lock.packages[`node_modules/${pkgName}`]
  if (!pkg) return
  prodDeps.add(pkgName)
  if (pkg.dependencies) {
    for (const dep of Object.keys(pkg.dependencies)) {
      if (!prodDeps.has(dep)) addDeps(dep)
    }
  }
}

for (const dep of Object.keys(rootPkg.dependencies || {})) {
  addDeps(dep)
}

const packagesByLicense = {}
const packageDetails = new Map()

function findLicenseFile(dir) {
  const candidates = [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'LICENSE.markdown',
    'License',
    'license',
    'LICENCE'
  ]
  for (const c of candidates) {
    const f = path.join(dir, c)
    if (fs.existsSync(f)) return f
  }
  return null
}

for (const name of Array.from(prodDeps).sort()) {
  const modDir = path.resolve('node_modules', name)
  const pkgJsonPath = path.join(modDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) continue

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  let lic = pkg.license
  if (!lic && pkg.licenses && pkg.licenses[0]) lic = pkg.licenses[0].type
  if (!lic) lic = 'Unknown'
  if (lic === '(MIT OR GPL-3.0-or-later)' || lic === 'MIT OR GPL-3.0-or-later')
    lic = 'MIT'
  if (lic === 'BSD') lic = 'BSD-2-Clause'

  let repoUrl = ''
  if (typeof pkg.repository === 'string') {
    repoUrl = pkg.repository
  } else if (pkg.repository && pkg.repository.url) {
    repoUrl = pkg.repository.url
  }
  repoUrl = repoUrl
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
  if (name === 'xlsx') {
    repoUrl = 'https://git.sheetjs.com/SheetJS/sheetjs'
  }

  const licFile = findLicenseFile(modDir)
  let licText = ''
  if (licFile) {
    licText = fs.readFileSync(licFile, 'utf8').trim()
  }

  const details = {
    name,
    version: pkg.version,
    license: lic,
    repoUrl,
    licText
  }

  packageDetails.set(name, details)

  if (!packagesByLicense[lic]) {
    packagesByLicense[lic] = []
  }
  packagesByLicense[lic].push(details)
}

const lines = []
lines.push('# Third-Party Notices\n')
lines.push(
  'Unbound incorporates open-source software and font packages licensed under permissive open-source licenses. This document contains attribution notices and license statements for all production dependencies.\n'
)

lines.push('## Summary of Licenses\n')
const sortedLicenses = Object.keys(packagesByLicense).sort()
for (const lic of sortedLicenses) {
  lines.push(`- **${lic}**: ${packagesByLicense[lic].length} package(s)`)
}
lines.push('\n---\n')

// Direct production dependencies that must have dedicated notices with their real license text and copyright lines
const featuredPackages = [
  'fast-xml-parser',
  'jszip',
  'pdfjs-dist',
  'xlsx',
  'tesseract.js',
  'tesseract.js-core',
  'mammoth',
  'marked',
  'turndown',
  '@mozilla/readability',
  'react',
  'react-dom',
  '@fontsource/ibm-plex-mono',
  '@fontsource/jetbrains-mono'
]

lines.push('## Direct Dependencies and Component Notices\n')

for (const pkgName of featuredPackages) {
  const details = packageDetails.get(pkgName)
  if (!details) continue

  lines.push(`### ${details.name}@${details.version} (${details.license})`)
  if (details.repoUrl) {
    lines.push(`Source: [${details.repoUrl}](${details.repoUrl})\n`)
  }
  if (details.licText) {
    lines.push('```')
    lines.push(details.licText)
    lines.push('```\n')
  } else if (details.name === 'xlsx') {
    lines.push('```')
    lines.push('Apache License, Version 2.0\nCopyright (C) SheetJS LLC')
    lines.push('```\n')
  }
}

lines.push('---\n')
lines.push('## Complete Package Directory by License\n')

for (const lic of sortedLicenses) {
  lines.push(`### ${lic} License\n`)
  lines.push('#### Packages\n')
  for (const pkg of packagesByLicense[lic]) {
    if (pkg.repoUrl) {
      lines.push(`- **${pkg.name}@${pkg.version}** ([Source](${pkg.repoUrl}))`)
    } else {
      lines.push(`- **${pkg.name}@${pkg.version}**`)
    }
  }
  lines.push('')
}

const output = lines.join('\n')

// Assert zero forbidden path prefixes
const forbiddenPrefix = ['/', 'home', '/'].join('')
if (output.includes(forbiddenPrefix)) {
  throw new Error('Generated notices contain absolute local path!')
}

fs.writeFileSync(path.resolve('THIRD_PARTY_NOTICES.md'), output, 'utf8')
console.log(
  `Generated THIRD_PARTY_NOTICES.md successfully (${prodDeps.size} packages).`
)
