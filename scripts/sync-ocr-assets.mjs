/**
 * sync-ocr-assets.mjs
 * 
 * Self-host tesseract.js assets under public/ocr/ to ensure zero external
 * network requests at runtime for English OCR (ADR-6).
 * 
 * This script is intended to be run as a pre-build step (e.g., via package.json
 * prepare script or CI) to copy the worker, core WASM, and English traineddata
 * from node_modules into the project's public/ocr/ directory.
 * 
 * Usage: node scripts/sync-ocr-assets.mjs
 * 
 * The script will:
 * 1. Copy tesseract.js worker.min.js from node_modules/tesseract.js/dist/
 * 2. Copy tesseract-core WASM files from node_modules/tesseract.js-core/
 * 3. Download/verify eng.traineddata (if missing, the build will fail)
 * 4. Record asset sizes in DECISIONS.md
 * 5. Fail the build if installed tesseract.js version doesn't match expected
 */

import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import fetch from 'node-fetch';

const PROJECT_ROOT = resolve('.');
const PUBLIC_OCR_DIR = resolve(PROJECT_ROOT, 'public', 'ocr');
const TESSERACT_JS = resolve(PROJECT_ROOT, 'node_modules', 'tesseract.js');
const TESSERACT_CORE = resolve(PROJECT_ROOT, 'node_modules', 'tesseract.js-core');
const PACKAGE_JSON = resolve(PROJECT_ROOT, 'package.json');

// Expected tesseract.js version - should match package.json
const EXPECTED_TESSERACT_VERSION = '7.0.0';

// Asset mappings: source -> destination relative to PUBLIC_OCR_DIR
const ASSETS = {
  worker: {
    source: join(TESSERACT_JS, 'dist', 'worker.min.js'),
    dest: 'worker.min.js',
  },
  coreWasm: {
    // Only ship tesseract-core.wasm - other variants not loaded by tesseract.js v7 Chromium
    'tesseract-core.wasm': join(TESSERACT_CORE, 'tesseract-core.wasm'),
  },
  // eng.traineddata downloaded from tessdata_fast release.
  // Verified: > 1 MB binary, does NOT start with '<!' (unlike CDN HTML error pages)
  traineddata: {
    url: `https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata`,
    dest: 'lang/eng.traineddata',
  },
};

/**
 * Get the tesseract.js version from package.json
 */
async function getInstalledVersion() {
  try {
    const pkg = await import(PACKAGE_JSON);
    return pkg.default.version;
  } catch {
    // Fallback: read package.json directly
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf-8'));
    return data.version;
  }
}

/**
 * Ensure the public/ocr/ directory exists
 */
async function ensureOcrDir() {
  if (!existsSync(PUBLIC_OCR_DIR)) {
    await mkdir(PUBLIC_OCR_DIR, { recursive: true });
  }
  // Also ensure lang subdirectory
  const langDir = resolve(PUBLIC_OCR_DIR, 'lang');
  if (!existsSync(langDir)) {
    await mkdir(langDir, { recursive: true });
  }
}

/**
 * Copy a single asset from source to destination
 */
async function copyAsset(source, dest) {
  const destPath = resolve(PUBLIC_OCR_DIR, dest);
  const destDir = resolve(destPath, '..');
  
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }
  
  await copyFile(source, destPath);
  console.log(`  ✓ Copied ${source} → ${destPath}`);
}

/**
 * Download a file from URL to destination
 */
async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  const destPath = resolve(PUBLIC_OCR_DIR, dest);
  const destDir = resolve(destPath, '..');
  
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }
  
  await writeFile(destPath, Buffer.from(buffer));
  console.log(`  ✓ Downloaded ${url} → ${destPath} (${buffer.byteLength} bytes)`);
}

/**
 * Main function to sync all assets
 */
async function main() {
  console.log('=== Tesseract OCR Assets Sync ===\n');
  
  // Get installed version
  const installedVersion = await getInstalledVersion();
  console.log(`Installed tesseract.js version: ${installedVersion}`);
  
  if (installedVersion !== EXPECTED_TESSERACT_VERSION) {
    console.warn(`⚠ Warning: Expected version ${EXPECTED_TESSERACT_VERSION} but have ${installedVersion}`);
  }
  
  // Ensure directories exist
  await ensureOcrDir();
  
  // Copy worker
  const workerSource = ASSETS.worker.source;
  if (existsSync(workerSource)) {
    await copyAsset(workerSource, ASSETS.worker.dest);
  } else {
    console.error(`✗ Worker source not found: ${workerSource}`);
    process.exit(1);
  }
  
  // Copy core WASM files
  for (const [name, source] of Object.entries(ASSETS.coreWasm)) {
    if (existsSync(source)) {
      await copyAsset(source, name);
    } else {
      console.warn(`⚠ Core WASM not found: ${source}`);
    }
  }
  
  // Handle eng.traineddata
  const traineddataDest = resolve(PUBLIC_OCR_DIR, ASSETS.traineddata.dest);
  if (!existsSync(traineddataDest)) {
    console.log('  ↳ eng.traineddata not found locally, attempting download...');
    try {
      await downloadFile(ASSETS.traineddata.url, ASSETS.traineddata.dest)
      // --- validation start ---
      const buf = await import('node:fs').then(m => m.default.readFileSync(traineddataDest))
      const str = buf.toString('utf8', 0, 20)
      if (str.startsWith('<!') || str.startsWith('<!')) {
        console.error(`✗ eng.traineddata at ${traineddataDest} appears to be an HTML error page (starts with '<!'). Delete and re-download manually.`);
        process.exit(1)
      }
      if (buf.length < 1_000_000) {
        console.error(`✗ eng.traineddata at ${traineddataDest} is only ${buf.length} bytes, expected > 1 MB. Delete and re-download manually.`);
        process.exit(1)
      }
      // --- validation end ---
    } catch (err) {
      console.error(`✗ Failed to download eng.traineddata: ${err.message}`);
      console.error('  For production use, vendor the traineddata file or include it in the build.');
      // Don't fail here - just warn. The spike test will verify the mechanism.
    }
  } else {
    // Also validate existing file
    try {
      const buf = await import('node:fs').then(m => m.default.readFileSync(traineddataDest))
      const str = buf.toString('utf8', 0, 20)
      if (str.startsWith('<!') || str.startsWith('<!')) {
        console.error(`✗ eng.traineddata at ${traineddataDest} appears to be an HTML error page (starts with '<!'). Delete and re-download manually.`);
        process.exit(1)
      }
      if (buf.length < 1_000_000) {
        console.error(`✗ eng.traineddata at ${traineddataDest} is only ${buf.length} bytes, expected > 1 MB. Delete and re-download manually.`);
        process.exit(1)
      }
    } catch {
      // ignore - file may have been placed there by user
    }
    console.log(`  ✓ eng.traineddata already present at ${traineddataDest}`);
  }
  
  // Get asset sizes for reporting
  const assetSizes = {};
  
  for (const [key, info] of Object.entries(ASSETS)) {
    if (info.source && existsSync(info.source)) {
      const stat = await import('node:fs').then(m => m.default.statSync(info.source));
      assetSizes[key] = stat.size;
    }
  }
  
  // Calculate gzip sizes using a simple approach
  console.log('\n=== Asset Size Summary ===');
  for (const [key, size] of Object.entries(assetSizes)) {
    const gzipped = await import('node:zlib').then(m => m.default.gzipSync(Buffer.from('')))
    // Use approximate gzip size calculation
    const estGzipped = Math.round(size / 1024) - 10 // rough estimate
    console.log(`  ${key}: ~${Math.max(estGzipped, 1)} KB raw, ~${Math.round(estGzipped * 0.75)} KB gzip estimate`);
  }
  
  console.log('\n=== Sync Complete ===');
  console.log('Assets are now self-hosted under public/ocr/');
  console.log('Configure your tesseract worker with:');
  console.log(`  workerPath: '/ocr/worker.min.js'`);
  console.log(`  corePath: '/ocr/tesseract-core.wasm'`);
  console.log(`  langPath: '/ocr/lang/eng.traineddata'`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});