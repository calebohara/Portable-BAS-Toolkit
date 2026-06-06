#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Sync the canonical version from package.json into the two Tauri files that
 * must match it:
 *   - src-tauri/Cargo.toml          (version = "x.y.z" in [package])
 *   - src-tauri/tauri.conf.json     ("version": "x.y.z")
 *
 * package.json is the single source of truth. Bump it (e.g. `npm version
 * minor`), then run `node scripts/sync-version.js` so the desktop build,
 * installer metadata, and updater manifest all report the same number.
 *
 * Pass --check to verify the files are in sync without writing (exits non-zero
 * on drift) — useful in CI / a pre-commit guard.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PKG_JSON = path.join(ROOT_DIR, 'package.json');
const CARGO_TOML = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
const TAURI_CONF = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');

const checkOnly = process.argv.includes('--check');

const version = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8')).version;
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`sync-version: package.json version "${version}" is missing or malformed.`);
  process.exit(1);
}

const drift = [];

// --- Cargo.toml: first `version = "..."` line (the [package] version) ---
const cargoSrc = fs.readFileSync(CARGO_TOML, 'utf8');
const cargoRe = /^(version\s*=\s*")([^"]*)(")/m;
const cargoMatch = cargoSrc.match(cargoRe);
if (!cargoMatch) {
  console.error('sync-version: could not find a `version = "..."` line in Cargo.toml.');
  process.exit(1);
}
if (cargoMatch[2] !== version) {
  drift.push(`Cargo.toml: ${cargoMatch[2]} -> ${version}`);
  if (!checkOnly) {
    fs.writeFileSync(CARGO_TOML, cargoSrc.replace(cargoRe, `$1${version}$3`));
  }
}

// --- tauri.conf.json: top-level "version" key ---
const tauriRaw = fs.readFileSync(TAURI_CONF, 'utf8');
const tauriConf = JSON.parse(tauriRaw);
if (tauriConf.version !== version) {
  drift.push(`tauri.conf.json: ${tauriConf.version} -> ${version}`);
  if (!checkOnly) {
    // Surgical replace of just the "version" value to preserve formatting.
    const tauriRe = /("version"\s*:\s*")([^"]*)(")/;
    fs.writeFileSync(TAURI_CONF, tauriRaw.replace(tauriRe, `$1${version}$3`));
  }
}

if (drift.length === 0) {
  console.log(`sync-version: all files already at ${version}.`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`sync-version: version drift detected (run \`node scripts/sync-version.js\`):`);
  drift.forEach((d) => console.error(`  - ${d}`));
  process.exit(1);
}

console.log(`sync-version: synced to ${version}:`);
drift.forEach((d) => console.log(`  - ${d}`));
