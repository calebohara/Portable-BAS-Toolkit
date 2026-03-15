#!/usr/bin/env node
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

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');
const TEMP_DIR = path.join(__dirname, '..', 'src', 'app', '_api_excluded');
const NEXT_DIR = path.join(__dirname, '..', '.next');

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
} catch (err) {
  exitCode = err.status || 1;
}

// Restore API routes
if (fs.existsSync(TEMP_DIR)) {
  fs.renameSync(TEMP_DIR, API_DIR);
  console.log('[build:static] Restored src/app/api');
}

process.exit(exitCode);
