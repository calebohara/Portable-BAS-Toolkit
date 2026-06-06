#!/usr/bin/env node
/**
 * Regenerates the two machine-managed blocks in docs/ACTIVE-BUGS.md:
 *   1. 🤖 Daily health check  — from the CI step outcomes (env vars)
 *   2. 📥 User-reported bugs   — from the Supabase `bug_reports` table
 *
 * Driven by .github/workflows/daily-health-check.yml. Safe to run locally too
 * (checks default to "skipped", Supabase pull is skipped if secrets are absent).
 *
 * Env (all optional):
 *   TSC_RESULT LINT_RESULT TEST_RESULT BUILD_RESULT CARGO_RESULT  -> 'success'|'failure'|'skipped'
 *   RUN_URL        -> link to the GitHub Actions run
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY -> for the user-bug pull
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'docs', 'ACTIVE-BUGS.md');

const nowIso = new Date().toISOString();
const nowStr = nowIso.slice(0, 16).replace('T', ' ') + ' UTC';

function icon(outcome) {
  if (outcome === 'success') return '✅ pass';
  if (outcome === 'failure') return '❌ FAIL';
  return '➖ skipped';
}

function replaceBlock(md, name, body) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(md)) {
    console.warn(`[update-active-bugs] marker ${name} not found — skipping`);
    return md;
  }
  return md.replace(re, `${start}\n${body}\n${end}`);
}

// ── 1. Daily health check block ──────────────────────────────────────────────
function buildChecksBlock() {
  const checks = [
    ['TypeScript (`tsc --noEmit`)', process.env.TSC_RESULT],
    ['Lint (`eslint`)', process.env.LINT_RESULT],
    ['Unit tests (`vitest run`)', process.env.TEST_RESULT],
    ['Production build (`build:static`)', process.env.BUILD_RESULT],
    ['Rust (`cargo check`/`test`)', process.env.CARGO_RESULT],
  ];
  const anyFail = checks.some(([, o]) => o === 'failure');
  const runUrl = process.env.RUN_URL;
  const lines = [];
  lines.push(`**Last run:** ${nowStr}${runUrl ? ` · [run log](${runUrl})` : ''}`);
  lines.push('');
  lines.push(anyFail
    ? '> ⚠️ **One or more checks FAILED — see the failing job below and open a manual entry if it is a real bug.**'
    : '> ✅ All automated checks passed.');
  lines.push('');
  lines.push('| Check | Result |');
  lines.push('|-------|--------|');
  for (const [label, outcome] of checks) lines.push(`| ${label} | ${icon(outcome)} |`);
  return lines.join('\n');
}

// ── 2. User-reported bugs block (Supabase) ───────────────────────────────────
async function buildUserBugsBlock() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return '_Supabase not configured — add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` repo secrets to enable the user-bug pull._';
  }
  const cols = 'id,created_at,severity,status,title,description,current_page,app_version,user_name';
  const endpoint =
    `${url.replace(/\/$/, '')}/rest/v1/bug_reports` +
    `?deleted_at=is.null&status=neq.resolved&select=${cols}` +
    `&order=severity.asc,created_at.desc&limit=200`;
  let rows;
  try {
    const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return `_Supabase query failed (HTTP ${res.status}). Check the secret + table.\n_`;
    rows = await res.json();
  } catch (e) {
    return `_Supabase query errored: ${String(e).slice(0, 200)}_`;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return `_No open user-reported bugs as of ${nowStr}. 🎉_`;
  }
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  const lines = [];
  lines.push(`**${rows.length}** open report${rows.length === 1 ? '' : 's'} as of ${nowStr}.`);
  lines.push('');
  lines.push('| Opened | Sev | Status | Title | Page | Version | By |');
  lines.push('|--------|-----|--------|-------|------|---------|----|');
  for (const r of rows) {
    const title = esc(r.title) || esc(r.description).slice(0, 80) || '(no title)';
    lines.push(
      `| ${esc(r.created_at).slice(0, 10)} | ${esc(r.severity)} | ${esc(r.status)} | ${title.slice(0, 90)} | ${esc(r.current_page)} | ${esc(r.app_version)} | ${esc(r.user_name)} |`,
    );
  }
  return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
let md = await readFile(FILE, 'utf8');
md = replaceBlock(md, 'AUTOMATED-CHECKS', buildChecksBlock());
md = replaceBlock(md, 'USER-REPORTS', await buildUserBugsBlock());
await writeFile(FILE, md);
console.log('[update-active-bugs] docs/ACTIVE-BUGS.md regenerated.');
