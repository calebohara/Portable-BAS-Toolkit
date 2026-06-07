#!/usr/bin/env node
/**
 * Deterministic README ↔ code drift check.
 *
 * Compares README.md against the CANONICAL tool list in src/app/landing-content.ts
 * (the same list the marketing site renders) — not the live site, so it's an
 * apples-to-apples, same-commit check. Two signals:
 *
 *   1. TOOL COVERAGE (hard) — every tool in toolGroups must be referenced in the
 *      README. A tool with no reference => drift => non-zero exit.
 *   2. CHANGELOG FRESHNESS (soft) — the newest `### vX.Y.Z` under "## What's New"
 *      should match package.json version. Reported as a warning; does not fail.
 *
 * Nuanced "are the descriptions still accurate?" is left to the weekly AI review.
 * Writes a markdown report to stdout and to $GITHUB_STEP_SUMMARY when set.
 *
 * Exit: 0 = all tools referenced; 1 = one or more tools missing from README.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFile } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const landing = await readFile(join(ROOT, 'src/app/landing-content.ts'), 'utf8');
const readme = await readFile(join(ROOT, 'README.md'), 'utf8');

// ── 1. Extract canonical tool names (the `name: '...'` fields inside toolGroups items) ──
const toolNames = [...landing.matchAll(/\bname:\s*'([^']+)'/g)].map((m) => m[1]);
const tools = [...new Set(toolNames)];

// Normalize text for fuzzy-but-conservative substring matching.
const norm = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const readmeNorm = norm(readme);

// Generic suffix words that don't carry identity — strip to get the core needle.
const GENERIC = new Set(['tool', 'editor', 'viewer', 'calculator', 'visualizer', 'builder', 'hmi', 'tracking']);

const STOP = new Set(['and', 'the', 'for', 'with']);

function needles(name) {
  const full = norm(name);
  const core = full.split(' ').filter((w) => !GENERIC.has(w)).join(' ').trim() || full;
  const set = new Set([full, core]);
  // plural/singular variants of full + core
  for (const n of [full, core]) {
    if (n.endsWith('s')) set.add(n.slice(0, -1));
    else set.add(n + 's');
  }
  // significant individual tokens (handles naming variance like
  // "Device List" -> README "Device Inventory", "Share & Export" -> "Share/export")
  for (const w of core.split(' ')) {
    if (w.length >= 4 && !GENERIC.has(w) && !STOP.has(w)) {
      set.add(w);
      set.add(w.endsWith('s') ? w.slice(0, -1) : w + 's');
    }
  }
  return [...set].filter(Boolean);
}

const missing = tools.filter((t) => !needles(t).some((n) => readmeNorm.includes(n)));

// ── 2. Changelog freshness ── (use the HIGHEST version in "What's New" so range
//    headings like "### v4.12.0 – v4.21.0" are handled correctly)
const whatsNew = (readme.split(/##\s*What's New/i)[1] ?? '').split(/\n##\s/)[0];
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
const allVers = [...whatsNew.matchAll(/v?(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
const changelogVer = allVers.length ? allVers.sort(cmp).at(-1) : null;
const pkgVer = pkg.version;
const changelogStale = changelogVer && cmp(changelogVer, pkgVer) < 0;

// ── Report ──
const lines = [];
lines.push('## README ↔ code sync check');
lines.push('');
lines.push(`Canonical tools (from \`src/app/landing-content.ts\`): **${tools.length}**`);
lines.push('');
if (missing.length === 0) {
  lines.push('✅ **Tool coverage:** every canonical tool is referenced in the README.');
} else {
  lines.push(`❌ **Tool coverage:** ${missing.length} tool(s) in the code are NOT referenced in the README — update README.md:`);
  for (const m of missing) lines.push(`  - \`${m}\``);
}
lines.push('');
if (!changelogVer) {
  lines.push('⚠️ **Changelog:** could not find a `### vX.Y.Z` entry under "## What\'s New".');
} else if (changelogStale) {
  lines.push(`⚠️ **Changelog stale:** README "What's New" tops out at \`v${changelogVer}\` but package.json is \`v${pkgVer}\`. Consider adding a changelog entry (non-blocking).`);
} else {
  lines.push(`✅ **Changelog:** latest entry \`v${changelogVer}\` matches package.json.`);
}
lines.push('');
lines.push('_Tool coverage is a presence check; description accuracy is reviewed by the weekly AI pass._');

const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report + '\n');
}

// Hard-fail only on genuine tool drift (changelog staleness is a warning).
process.exit(missing.length > 0 ? 1 : 0);
