#!/usr/bin/env node
/**
 * Posts a Discord notification from the daily health check — but only when there's
 * something worth pinging about (a failed check, or open user bug reports). Stays
 * quiet on an all-green/no-bugs day to avoid alert fatigue.
 *
 * No-op (exit 0) if DISCORD_WEBHOOK_URL isn't set, so the workflow never fails on it.
 *
 * Env: TSC_RESULT LINT_RESULT TEST_RESULT BUILD_RESULT CARGO_RESULT ('success'|'failure'|'skipped'),
 *      RUN_URL, DISCORD_WEBHOOK_URL,
 *      SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */
const hook = process.env.DISCORD_WEBHOOK_URL;
if (!hook) {
  console.log('[notify-discord] DISCORD_WEBHOOK_URL not set — skipping.');
  process.exit(0);
}

const checks = [
  ['TypeScript', process.env.TSC_RESULT],
  ['Lint', process.env.LINT_RESULT],
  ['Tests', process.env.TEST_RESULT],
  ['Build', process.env.BUILD_RESULT],
  ['Rust', process.env.CARGO_RESULT],
];
const failed = checks.filter(([, o]) => o === 'failure').map(([n]) => n);

// Fetch open user bug reports (best-effort).
let bugs = [];
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  try {
    const res = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/bug_reports?deleted_at=is.null&status=not.in.(resolved,closed)` +
        `&select=severity,title,description,current_page&order=severity.asc,created_at.desc&limit=20`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (res.ok) bugs = await res.json();
  } catch (e) {
    console.warn('[notify-discord] bug fetch failed:', String(e).slice(0, 120));
  }
}

if (failed.length === 0 && bugs.length === 0) {
  console.log('[notify-discord] all green, no open bugs — staying quiet.');
  process.exit(0);
}

const parts = ['**🩺 BAU Suite — daily health check**'];
if (failed.length) parts.push(`⚠️ **Checks failed:** ${failed.join(', ')}`);
if (bugs.length) {
  parts.push(`📋 **${bugs.length} open user bug report${bugs.length === 1 ? '' : 's'}:**`);
  for (const b of bugs.slice(0, 8)) {
    const title = (b.title || b.description || '(no title)').replace(/\n+/g, ' ').slice(0, 90);
    parts.push(`• [${b.severity || '?'}] ${title}${b.current_page ? ` _(page: ${b.current_page})_` : ''}`);
  }
  if (bugs.length > 8) parts.push(`…and ${bugs.length - 8} more`);
}
if (process.env.RUN_URL) parts.push(`<${process.env.RUN_URL}>`);

const content = parts.join('\n').slice(0, 1900); // Discord 2000-char cap

try {
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, username: 'BAU Suite Health' }),
  });
  console.log(res.ok ? '[notify-discord] posted.' : `[notify-discord] Discord HTTP ${res.status}`);
} catch (e) {
  console.warn('[notify-discord] post failed:', String(e).slice(0, 120));
}
process.exit(0);
