#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Build script for Tauri static export.
 *
 * API routes (src/app/api) are server-only and incompatible with
 * Next.js `output: "export"`. This script temporarily moves them
 * out of the way during the build, then restores them afterward.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const API_DIR = path.join(ROOT_DIR, 'src', 'app', 'api');
const TEMP_DIR = path.join(ROOT_DIR, 'src', 'app', '_api_excluded');
const NEXT_DIR = path.join(ROOT_DIR, '.next');
const OUT_SW = path.join(ROOT_DIR, 'out', 'sw.js');
const PKG_JSON = path.join(ROOT_DIR, 'package.json');

/**
 * Stamp the service-worker CACHE_VERSION with the app version from package.json
 * so each release ships a fresh cache namespace (no manual `v6 → v7` bumps).
 * Operates on the exported copy in out/ — the source public/sw.js is untouched.
 */
function stampServiceWorkerVersion() {
  if (!fs.existsSync(OUT_SW)) {
    console.warn('[build:static] out/sw.js not found — skipping cache-version stamp');
    return;
  }
  const { version } = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
  const sw = fs.readFileSync(OUT_SW, 'utf8');
  const stamped = sw.replace(/bau-suite-v[0-9][0-9A-Za-z.\-]*/, `bau-suite-v${version}`);
  if (stamped === sw) {
    console.warn('[build:static] CACHE_VERSION pattern not found in out/sw.js — stamp skipped');
    return;
  }
  fs.writeFileSync(OUT_SW, stamped);
  console.log(`[build:static] Stamped sw.js CACHE_VERSION → bau-suite-v${version}`);
}

// Clear cached .next build artifacts so stale type validators
// referencing API routes don't cause TypeScript errors.
if (fs.existsSync(NEXT_DIR)) {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log('[build:static] Cleared .next cache');
}

// Move API routes out
if (fs.existsSync(API_DIR)) {
  fs.renameSync(API_DIR, TEMP_DIR);
  console.log('[build:static] Temporarily excluded src/app/api');
}

let exitCode = 0;
try {
  execSync('npx cross-env TAURI_BUILD=1 next build', {
    stdio: 'inherit',
    env: { ...process.env, TAURI_BUILD: '1' },
  });
  // Post-build: stamp the SW cache version from package.json.
  stampServiceWorkerVersion();
} catch (err) {
  exitCode = err.status || 1;
} finally {
  if (fs.existsSync(TEMP_DIR)) {
    fs.renameSync(TEMP_DIR, API_DIR);
    console.log('[build:static] Restored src/app/api');
  }
}

process.exit(exitCode);
