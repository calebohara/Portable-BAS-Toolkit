export const meta = {
  name: 'sync-audit-thorough',
  description: 'Critical multi-agent re-audit of BAU Suite sync: verify prior safeguards are in place + hunt cross-device/multi-user defects',
  phases: [
    { title: 'Regression', detail: 'verify each prior finding is actually remediated in current code' },
    { title: 'Audit', detail: '8 independent auditors hunt remaining/new sync defects by dimension' },
    { title: 'Verify', detail: 'adversarially confirm each candidate finding against the real code' },
    { title: 'Synthesize', detail: 'merge into a single findings doc' },
  ],
}

// Shared scope handed to every agent
const SCOPE = [
  'BAU Suite is a Next.js 16 + Tauri offline-first BAS field toolkit. Data lives in',
  'IndexedDB (via idb) and syncs to Supabase (Postgres + RLS + realtime). There are',
  'LOCAL user-owned tables (user_id RLS) and ~19 GLOBAL membership-RLS tables',
  '(global_project_id + created_by/updated_by) for multi-user shared projects.',
  '',
  'KEY SOURCE FILES (read the ones in your slice fully; cite file:line):',
  '- src/lib/sync/sync-manager.ts (1957) push queue, pullSync, fullSync, realtime, conflict detection, error capture, retry/backoff',
  '- src/lib/sync/field-map.ts (1165) entity->table map, toSupabaseRow/fromSupabaseRow, ENTITY_COLUMN_ALLOWLIST, SKIP_FIELDS, GLOBAL_AUDITED_ENTITY_TYPES, REQUIRES_*_ID, SYNC_ORDER, orderPushBatch, pushOrderIndex',
  '- src/lib/global-projects/reconcile.ts (1625) global project reconcile/restore',
  '- src/lib/global-projects/api.ts (2277) live Supabase CRUD for global entities (incl. preferences composite PK)',
  '- src/lib/sync/consistency-check.ts (336) local-vs-cloud consistency check',
  '- src/lib/sync/sync-error-utils.ts, report-sync-error.ts, sync-bridge.ts',
  '- src/lib/db.ts IndexedDB layer: addSyncItem, addSyncItemPreservingRetry, getPendingSyncItems, addSyncError dedup, clearAllData, clearSyncQueue, bulkPutSilent/bulkDeleteSilent, hasUnpushedSyncItem',
  '- src/providers/auth-provider.tsx, src/providers/sync-provider.tsx, src/store/app-store.ts sign-in/out, first-login gate, lastPulledAt persistence, user-switch isolation',
  '',
  'SUPABASE (read the ones in your slice):',
  '- supabase/global-projects-schema.sql (568) global tables + RLS policies + is_global_project_member/is_global_project_admin helpers',
  '- supabase/global-projects-reset.sql (607), supabase/schema.sql (737) local tables + RLS',
  '- supabase/migrations/*.sql (49 files) sync-version triggers, sync-version-insert-defaults, sync-columns-global-children, cascade-soft-delete-rpcs, global-project-preferences, full-text-search, etc.',
  '',
  'REMEDIATION ALREADY CLAIMED (you MUST verify in code, NEVER assume): the prior',
  'audit doc docs/SyncAuditAgents-findings-2026-06-08.md listed 11 findings (P0-P2).',
  'A phased remediation was committed as v4.29.0 (Phase 2: latent P1 + conflict',
  'correctness), v4.30.0 (Phase 3: allowlist, atomic cascade, FK ordering), v4.31.0',
  '(Phase 4: verification suite), v4.31.1 (hotfix: content-equality gate to stop a',
  'spurious-conflict flood), and v4.31.2 (this session: stamp created_by on',
  'coalesced create->update upserts to stop a 42501 on global child INSERTs).',
  'Read that doc for the full list and fix directions.',
  '',
  'RULES: be critical and concrete. Every claim cites file:line. Distinguish a REAL',
  'defect from a safeguard that already handles it. Severity: P0 = data loss /',
  'cross-user corruption / deletes do not stick / convergence failure; P1 = sync',
  'breaks for a real scenario (retries forever, silent no-op); P2 = reliability/UX;',
  'P3 = cleanup. Focus on: deletes that stick, strict per-user isolation across a',
  'shared device, multi-user global-project editing under RLS, multi-device',
  'convergence, conflict correctness without data loss, and an idempotent',
  'self-healing queue.',
].join('\n')

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'safeguardsConfirmed'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'area', 'location', 'currentBehavior', 'whyItMatters', 'suggestedFix', 'confidence'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          area: { type: 'string' },
          location: { type: 'string', description: 'file:line(s)' },
          currentBehavior: { type: 'string' },
          whyItMatters: { type: 'string' },
          suggestedFix: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    safeguardsConfirmed: {
      type: 'array',
      description: 'Safeguards you read and confirmed are present and correct in this slice',
      items: {
        type: 'object',
        required: ['safeguard', 'location', 'status'],
        properties: {
          safeguard: { type: 'string' },
          location: { type: 'string' },
          status: { type: 'string', enum: ['present-correct', 'present-partial', 'missing'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'severityAdjusted', 'reasoning'],
  properties: {
    isReal: { type: 'boolean', description: 'true only if a genuine defect remains in current code' },
    severityAdjusted: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'invalid'] },
    reasoning: { type: 'string' },
    existingSafeguard: { type: 'string', description: 'cite the code that already mitigates this, or empty if none' },
    evidence: { type: 'string', description: 'file:line you read to confirm/refute' },
  },
}

const REGRESSION_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'status', 'evidence'],
        properties: {
          finding: { type: 'string', description: 'which prior finding (e.g. "#3 cross-user push guard")' },
          status: { type: 'string', enum: ['fixed', 'partial', 'regressed', 'not-applicable'] },
          evidence: { type: 'string', description: 'file:line proving the fix is present (or absent)' },
          notes: { type: 'string' },
          residualRisk: { type: 'string', description: 'any gap that remains even though the fix is present' },
        },
      },
    },
  },
}

// Phase 1: Regression
phase('Regression')
const REGRESSION_CLUSTERS = [
  { key: 'deletes', focus: 'Findings #1 (delete propagation/resurrection) + the one-time legacy demo purge. Verify: pullSync is tombstone-aware (fetches rows with deleted_at != null and routes them to bulkDeleteSilent/cascade), fullSync no longer re-pushes cloud-tombstoned rows, full pull does subtractive reconciliation (supportsSubtractivePull), deletes propagate to local tables too, and deletedAt is stripped on push (LOCAL_ONLY_FIELDS) so a re-push cannot resurrect. Check supabase/purge-legacy-demo-projects.sql exists.' },
  { key: 'isolation', focus: 'Finding #2 (same-device user switch isolation). Verify auth-provider.tsx signOut / sync-provider.tsx on SIGNED_OUT or a DIFFERENT user SIGNED_IN clears IndexedDB (clearAllData) + clears syncQueue + resets lastPulledAt/cursors, and a last-auth-user id forces a clean full pull on user change. This is the shared field-laptop scenario.' },
  { key: 'ownership', focus: 'Findings #3 + globalProjects member-update 42501 + this session v4.31.2 created_by fix. Verify foreignGlobalAuthor() drops foreign-authored rows for ALL GLOBAL_AUDITED_ENTITY_TYPES + globalProjects + globalActivityLog, the 42501-on-global-update non-retryable drop backstop exists, AND the upsert path stamps created_by on update-action items (the v4.31.2 fix in sync-manager.ts around lines 612-635).' },
  { key: 'ingress-conflict', focus: 'Findings #4 (ingress dirty-guard) + #9 (conflict logic). Verify pull AND realtime check the pending queue (hasUnpushedSyncItem) before bulkPutSilent so an incoming remote row cannot clobber a pending local edit; verify sync_version is the PRIMARY conflict comparator (not just equal-ms), and the v4.31.1 content-equality gate (pushRowMatchesRemote) prevents a spurious-conflict flood for content-identical rows.' },
  { key: 'queue-errors', focus: 'Findings #5 (fullSync dirty-tracking + retry preservation) + #6 (addSyncError dedup) + #11/P2 (backoff, auto-recovery, FK ordering). Verify fullSync enqueues only dirty rows and uses addSyncItemPreservingRetry, addSyncError dedups by signature and capture fires at first+terminal only, exponential backoff (computeNextRetryAt + nextRetryAt gate in getPendingSyncItems), autoRecoverFailedItems re-pends only transient failures, and orderPushBatch/pushOrderIndex give FK-safe ordering.' },
  { key: 'prefs-restore-schema', focus: 'Findings #7 (preferences hard-delete) + #8 (restoreFromCloud user_id filter) + #10 (field-map allowlist). Verify globalProjectPreferences delete is a HARD delete by composite key (no deleted_at update), restoreFromCloud does NOT filter global_* tables by user_id, and ENTITY_COLUMN_ALLOWLIST is a complete default-deny gate matching the real schema (spot-check a few tables against the migrations). Confirm the composite-PK onConflict for preferences in push + api.ts.' },
  { key: 'cascade-rpc', focus: 'P2 atomic server cascade. Verify supabase/migrations/add-cascade-soft-delete-rpcs.sql defines cascade_soft_delete_project + cascade_soft_delete_global_project (SECURITY DEFINER, one transaction, RLS-equivalent auth), and tryCascadeDeleteRpc in sync-manager.ts calls it with a safe fallback. Confirm the schema_migrations ledger + check-migrations.sql cover the new migrations.' },
]
const regression = await parallel(REGRESSION_CLUSTERS.map((c) => () =>
  agent(
    SCOPE + '\n\nREGRESSION VERIFICATION TASK (read the real current code, do not trust the doc claims):\n' + c.focus + '\n\nFor each prior finding in this cluster, report status (fixed/partial/regressed/not-applicable) with the exact file:line that proves it, plus any residualRisk that remains even though the fix is present. Be skeptical: a fix that exists but has a gap is partial, not fixed.',
    { label: 'regress:' + c.key, phase: 'Regression', schema: REGRESSION_SCHEMA },
  )
))
const regressionItems = regression.filter(Boolean).flatMap((r) => r.items)
log('Regression: verified ' + regressionItems.length + ' prior-fix items across ' + REGRESSION_CLUSTERS.length + ' clusters')

// Phase 2+3: fresh dimension audit, each finding adversarially verified
const DIMENSIONS = [
  { key: 'delete-tombstone', prompt: 'DELETE PROPAGATION & TOMBSTONE CORRECTNESS. Hunt for any remaining way a deleted row can resurrect or a delete fails to converge across devices: incremental-pull windows that skip tombstones, race between a delete-push and a concurrent pull, cascade non-atomicity, hard-vs-soft delete mismatches, append-only tables, deletedAt round-trip leaks, subtractive-pull edge cases (partial membership view). Files: sync-manager.ts (pullSync/fullSync/realtime/delete branch), field-map.ts (hasDeletedAtColumn, supportsSubtractivePull, LACKS_DELETED_AT), reconcile.ts.' },
  { key: 'multiuser-rls', prompt: 'MULTI-USER GLOBAL PROJECTS, OWNERSHIP & RLS. Two+ members editing the same global project. Hunt: a member edit that hits 42501 and retries forever, an admin edit path that bypasses or fails RLS, created_by/updated_by stamping errors on insert vs update, access-code join flow, membership add/remove leaving orphan rows, a row a member can edit in the UI but not push. Files: sync-manager.ts (push, foreignGlobalAuthor, created_by stamping), api.ts (admin paths), global-projects-schema.sql RLS policies, is_global_project_member/admin helpers.' },
  { key: 'multidevice-convergence', prompt: 'MULTI-DEVICE SAME-USER CONVERGENCE. One user, 3 devices. Hunt: lastPulledAt cursor bugs (per-entity vs global, clock-based windows that drop rows written during a pull, timezone/ms boundary), first-login gate suppressing a needed pull, a device that edits offline for days then reconnects, ordering of push-then-pull, a write on device A invisible to device B. Files: sync-manager.ts (pull cursor logic, fullSync, incremental window), sync-provider.tsx (first-login gate), app-store.ts (lastPulledAt persistence), consistency-check.ts.' },
  { key: 'conflict-dataloss', prompt: 'CONFLICT DETECTION & DATA LOSS. Hunt every path where a write is silently lost or a false conflict is raised: create-action blind LWW, reconcile path bypassing conflict detection, realtime ingress overwriting a pending edit, sync_version not consulted on pull/reconcile, client-stamped updated_at deciding a winner under clock skew, the content-equality gate (pushRowMatchesRemote) being too loose/tight, conflict resolution upsert losing the loser. Files: sync-manager.ts (conflict block, pushRowMatchesRemote, resolveConflict, realtime), reconcile.ts.' },
  { key: 'queue-reliability', prompt: 'QUEUE RELIABILITY & IDEMPOTENCY. Hunt: coalescing bugs from the deterministic queue id (create+delete, update+delete, delete+create races), a poison item that loops, retry/backoff math errors, FK-order violations in a mixed batch (child pushed before parent / parent deleted before child), items stranded in syncing state after a crash, validateSyncable dropping legitimate rows, concurrency races in processQueue. Files: sync-manager.ts (enqueue, processQueue, orderPushBatch usage, resetSyncingItemsToPending), field-map.ts (orderPushBatch/pushOrderIndex, validateSyncable, REQUIRES_*_ID), db.ts queue fns.' },
  { key: 'schema-fieldmap', prompt: 'SCHEMA / FIELD-MAP ALIGNMENT. Cross-check ENTITY_COLUMN_ALLOWLIST + FIELD_OVERRIDES in field-map.ts against the ACTUAL columns in supabase/global-projects-schema.sql, schema.sql, and migrations/*.sql. Hunt: a real column missing from an allowlist (write silently dropped, data loss), an allowlisted column that does not exist (42703), NOT NULL columns the client can null, generated columns (fts) or composite PKs mishandled, snake/camel mapping errors, a join-only interface field that would 42703 if persisted. Files: field-map.ts, all supabase/*.sql + migrations.' },
  { key: 'rls-policy-completeness', prompt: 'SUPABASE RLS POLICY COMPLETENESS. For EVERY global table, verify SELECT/INSERT/UPDATE/DELETE each have a policy with correct USING and WITH CHECK (membership + authorship), soft-deleted rows are excluded from SELECT, is_global_project_member/is_global_project_admin are SECURITY DEFINER + STABLE and reference the right columns, the cascade RPC is SECURITY DEFINER with auth enforced in-body, and no table is RLS-enabled-but-policy-missing (would deny all) or RLS-disabled (would leak). Files: global-projects-schema.sql, global-projects-reset.sql, all migrations adding global_* tables (add-global-*.sql), add-cascade-soft-delete-rpcs.sql.' },
  { key: 'realtime-races', prompt: 'REALTIME SUBSCRIPTIONS & RACES. Hunt: channel scoping that leaks another project or user rows, a realtime event applied without the ingress dirty-guard, reconnection/resubscription gaps that drop events, ordering between realtime apply and an in-flight pull, presence/online-users leaks, a realtime DELETE not handled, subscription cleanup leaks on project switch or sign-out. Files: sync-manager.ts (subscribeToRealtime/channel setup around lines 1700+), reconcile.ts, sync-provider.tsx.' },
]

const audited = await pipeline(
  DIMENSIONS,
  (d) => agent(
    SCOPE + '\n\nAUDIT DIMENSION: ' + d.prompt + '\n\nRead the cited files in current code. Report concrete REMAINING or NEW defects (not ones already correctly fixed) with file:line, severity, and a fix. ALSO list the safeguards you read and confirmed are present and correct in this slice (so we can certify them). Prefer fewer high-confidence findings over speculation.',
    { label: 'audit:' + d.key, phase: 'Audit', schema: FINDINGS_SCHEMA },
  ),
  (review, d) => parallel(((review && review.findings) || []).map((f) => () =>
    agent(
      SCOPE + '\n\nADVERSARIAL VERIFICATION. Another auditor (dimension "' + d.key + '") claims this defect:\n\nTITLE: ' + f.title + '\nSEVERITY: ' + f.severity + '\nLOCATION: ' + f.location + '\nCURRENT BEHAVIOR: ' + f.currentBehavior + '\nWHY IT MATTERS: ' + f.whyItMatters + '\n\nYour job is to REFUTE it. Open the cited file:line and the surrounding code. Decide isReal=true ONLY if a genuine defect remains in CURRENT code and no existing safeguard (foreignGlobalAuthor, hasUnpushedSyncItem dirty-guard, ENTITY_COLUMN_ALLOWLIST, content-equality gate, backoff, RLS policy, etc.) already handles it. If a safeguard covers it, set isReal=false and cite that safeguard. Default to isReal=false when uncertain. Give the file:line evidence you actually read.',
      { label: 'verify:' + d.key, phase: 'Verify', schema: VERDICT_SCHEMA },
    ).then((v) => ({ ...f, dimension: d.key, verdict: v }))
  )),
)

const allFindings = audited.flat().filter(Boolean)
const confirmed = allFindings.filter((f) => f.verdict && f.verdict.isReal)
const refuted = allFindings.filter((f) => f.verdict && !f.verdict.isReal)
log('Audit: ' + allFindings.length + ' candidate findings -> ' + confirmed.length + ' confirmed, ' + refuted.length + ' refuted/already-safeguarded')

// Phase 4: synthesis into the findings doc
phase('Synthesize')
const confirmedForDoc = confirmed.map((f) => ({
  title: f.title,
  severity: (f.verdict.severityAdjusted && f.verdict.severityAdjusted !== 'invalid') ? f.verdict.severityAdjusted : f.severity,
  area: f.area,
  dimension: f.dimension,
  location: f.location,
  currentBehavior: f.currentBehavior,
  whyItMatters: f.whyItMatters,
  suggestedFix: f.suggestedFix,
  verifierReasoning: f.verdict.reasoning,
  verifierEvidence: f.verdict.evidence,
}))
const refutedForDoc = refuted.map((f) => ({ title: f.title, dimension: f.dimension, location: f.location, whySafe: f.verdict.reasoning, safeguard: f.verdict.existingSafeguard }))

const doc = await agent(
  SCOPE + '\n\nYou are the Cross-Cutting synthesizer. Produce the COMPLETE markdown body of a SyncAuditAgents findings doc for 2026-06-08 (second session today). Use ONLY the data below, do not invent findings.\n\nREGRESSION (prior-fix verification):\n' + JSON.stringify(regressionItems, null, 1) + '\n\nCONFIRMED NEW/REMAINING FINDINGS (adversarially verified as real):\n' + JSON.stringify(confirmedForDoc, null, 1) + '\n\nREFUTED / ALREADY-SAFEGUARDED (candidates dismissed on verification):\n' + JSON.stringify(refutedForDoc, null, 1) + '\n\nWrite the doc with these sections, matching the CLAUDE.md ReviewAgents/SyncAuditAgents format:\n1. Header block: date 2026-06-08 (session 2), mode read-only, auditor count (8 dimension auditors + 7 regression verifiers + adversarial verifiers), files reviewed, and a one-line VERDICT on whether sync is now trustworthy for cross-device + multi-user use.\n2. Executive summary: a table of P0/P1/P2/P3 counts of CONFIRMED findings + the headline theme; and a one-line state-of-sync.\n3. Regression / safeguards-confirmed table: every prior finding #1-#11 + the v4.31.2 created_by fix, with status (fixed/partial/regressed) and the file:line evidence. This is the core deliverable: prove the safeguards are in place.\n4. Confirmed findings grouped by priority (P0 -> P3): each with location, area, current behavior, why it matters, suggested fix, and which fix-team agent should own it.\n5. Cross-cutting observations.\n6. Refuted / already-safeguarded: the candidates we checked and dismissed, with the safeguard that covers them (shows the audit was adversarial, not rubber-stamp).\n7. Bottom line: honest assessment + recommended next actions (if any P0/P1 remain, say so plainly; if clean, certify it).\n\nReturn ONLY the markdown body (no code fence around the whole thing).',
  { label: 'synthesize:findings-doc', phase: 'Synthesize' },
)

return {
  regressionCount: regressionItems.length,
  candidateCount: allFindings.length,
  confirmedCount: confirmed.length,
  refutedCount: refuted.length,
  confirmedBySeverity: {
    P0: confirmedForDoc.filter((f) => f.severity === 'P0').length,
    P1: confirmedForDoc.filter((f) => f.severity === 'P1').length,
    P2: confirmedForDoc.filter((f) => f.severity === 'P2').length,
    P3: confirmedForDoc.filter((f) => f.severity === 'P3').length,
  },
  regressionItems,
  confirmedForDoc,
  docMarkdown: doc,
}
