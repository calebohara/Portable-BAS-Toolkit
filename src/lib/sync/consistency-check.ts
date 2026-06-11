/**
 * Database consistency check — LOCAL IndexedDB vs CLOUD (Supabase), per entity.
 *
 * ─── READ-ONLY GUARANTEE ──────────────────────────────────────────────────────
 * This module NEVER writes, updates, deletes, or upserts any data — local or
 * cloud. It issues only SELECT/count queries against Supabase and read-only
 * `getAllFromStore` / `getAllFromIndex` calls against IndexedDB. The user-initiated
 * FIX (pull cloud → local) lives elsewhere (SyncManager.pullSync via the provider).
 *
 * ─── CONSERVATIVE CLASSIFICATION ──────────────────────────────────────────────
 * We bias HARD toward NOT crying wolf. A row is flagged 'behind' only when the
 * cloud unambiguously has more/newer data AND the device has nothing pending to
 * push that would explain the gap. Clock skew is absorbed by a margin. Anything
 * ambiguous resolves to 'in-sync' so we never nag a user whose data is actually
 * fine. A single failing table degrades to 'error' for that row only — it never
 * fails the whole check.
 */

import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getAllFromStore } from '@/lib/db';
import { entityTypeToTable } from './field-map';
import type { SyncEntityType, SyncQueueItem } from '@/types';

export type ConsistencyStatus = 'in-sync' | 'behind' | 'ahead' | 'diverged' | 'error';

export interface EntityConsistency {
  entityType: string; // a SyncEntityType local store name, e.g. 'projects'
  label: string; // human label, e.g. 'Projects', 'Field Notes'
  localCount: number;
  remoteCount: number;
  localMaxUpdated: string | null; // ISO
  remoteMaxUpdated: string | null; // ISO
  pendingLocal: number; // pending push-queue items for this entity (local legitimately ahead)
  status: ConsistencyStatus;
}

export interface ConsistencyReport {
  checkedAt: string; // ISO timestamp
  supported: boolean; // false when Supabase not configured / not authenticated
  entities: EntityConsistency[];
  behindEntities: number; // count of entities with status 'behind' or 'diverged'
  remoteAheadTotal: number; // sum of max(0, remoteCount - localCount) across entities
  inSync: boolean; // true when behindEntities === 0
}

/**
 * A single entity to consistency-check.
 *  - entityType: the IndexedDB local store name (also a SyncEntityType)
 *  - table:      the Supabase table name (verified against schema.sql / migrations)
 *  - label:      human-readable label for the UI
 *  - hasSoftDelete: whether the Supabase table carries a `deleted_at` column.
 *    When true we filter `.is('deleted_at', null)` so the remote count reflects
 *    LIVE rows only (matching the hard-deleted local stores, which never retain
 *    tombstones).
 *
 * SCOPE (v1): only user-owned synced entities that have BOTH `user_id` and
 * `updated_at` in Supabase. RLS scopes every query to the signed-in user, so we
 * never hand-filter user_id.
 *
 * INTENTIONALLY EXCLUDED:
 *  - activityLog            → append-only audit log; counts churn constantly and
 *                             is never user-corrected, so a count drift here is
 *                             noise, not a problem worth flagging.
 *  - bugReports, reviews    → app-feedback artifacts, not project data; low value
 *                             for a "your project data is out of date" prompt.
 *  - globalActivityLog      → append-only, same churn reasoning as activityLog.
 *  - globalProjectPreferences → per-user UI state on a composite PK; trivial and
 *                             self-healing, not worth a "behind" prompt.
 *  - field_panels,
 *    notepad_documents,
 *    user_settings          → no corresponding local synced store in
 *                             entityTypeToTable, so there is nothing local to
 *                             compare against.
 *
 * GLOBAL TABLES (v2 — audit s3 cross-cutting finding): previously ALL global_*
 * tables were excluded, which meant the one read-only safety net opted out of
 * exactly the multi-user path the audits flagged as lossy. They are now
 * INCLUDED: the local global-store mirror holds every member-visible row (the
 * pull + realtime paths hydrate it), and the remote query under membership RLS
 * returns exactly the same member-visible scope — so count/maxUpdated parity is
 * well-defined per device, same as the user-owned tables. A local mirror that
 * retains rows from projects the user has LEFT shows as 'ahead' (informational,
 * never flagged 'behind') — which deliberately surfaces the known revoke-
 * retention gap (GLOBAL-1) instead of hiding it.
 */
interface EntityCheck {
  entityType: SyncEntityType;
  table: string;
  label: string;
  hasSoftDelete: boolean;
}

const ENTITY_CHECKS: readonly EntityCheck[] = [
  { entityType: 'projects', table: 'projects', label: 'Projects', hasSoftDelete: true },
  { entityType: 'files', table: 'project_files', label: 'Files', hasSoftDelete: true },
  { entityType: 'notes', table: 'field_notes', label: 'Field Notes', hasSoftDelete: true },
  { entityType: 'devices', table: 'devices', label: 'Devices', hasSoftDelete: true },
  { entityType: 'ipPlan', table: 'ip_plan', label: 'IP Plan', hasSoftDelete: true },
  { entityType: 'dailyReports', table: 'daily_reports', label: 'Daily Reports', hasSoftDelete: true },
  { entityType: 'networkDiagrams', table: 'network_diagrams', label: 'Network Diagrams', hasSoftDelete: true },
  { entityType: 'commandSnippets', table: 'command_snippets', label: 'Command Snippets', hasSoftDelete: true },
  { entityType: 'pingSessions', table: 'ping_sessions', label: 'Ping Sessions', hasSoftDelete: true },
  { entityType: 'terminalLogs', table: 'terminal_session_logs', label: 'Terminal Logs', hasSoftDelete: true },
  { entityType: 'connectionProfiles', table: 'connection_profiles', label: 'Connection Profiles', hasSoftDelete: true },
  { entityType: 'registerCalculations', table: 'register_calculations', label: 'Register Calculations', hasSoftDelete: true },
  { entityType: 'pidTuningSessions', table: 'pid_tuning_sessions', label: 'PID Tuning Sessions', hasSoftDelete: true },
  { entityType: 'ppclDocuments', table: 'ppcl_documents', label: 'PPCL Documents', hasSoftDelete: true },
  { entityType: 'psychSessions', table: 'psych_sessions', label: 'Psychrometric Sessions', hasSoftDelete: true },
  { entityType: 'trendSessions', table: 'trend_sessions', label: 'Trend Sessions', hasSoftDelete: true },
  { entityType: 'dxrs', table: 'dxrs', label: 'DXRs', hasSoftDelete: true },
];

// Global (membership-RLS) tables — v2. Table names come from the canonical
// entityTypeToTable map so this list can never drift from the sync layer.
// Every table below carries `deleted_at` (verified against the migrations);
// the append-only global_activity_log and composite-PK preferences table are
// intentionally excluded (see the header comment).
const GLOBAL_ENTITY_LABELS: ReadonlyArray<readonly [SyncEntityType, string]> = [
  ['globalProjects', 'Global Projects'],
  ['globalNotes', 'Global Field Notes'],
  ['globalDevices', 'Global Devices'],
  ['globalIpPlan', 'Global IP Plan'],
  ['globalDailyReports', 'Global Daily Reports'],
  ['globalNetworkDiagrams', 'Global Network Diagrams'],
  ['globalProjectFiles', 'Global Files'],
  ['globalPpclDocuments', 'Global PPCL Documents'],
  ['globalTerminalLogs', 'Global Terminal Logs'],
  ['globalPidTuningSessions', 'Global PID Tuning Sessions'],
  ['globalPsychSessions', 'Global Psychrometric Sessions'],
  ['globalRegisterCalculations', 'Global Register Calculations'],
  ['globalPingSessions', 'Global Ping Sessions'],
  ['globalTrendSessions', 'Global Trend Sessions'],
  ['globalConnectionProfiles', 'Global Connection Profiles'],
  ['globalDxrs', 'Global DXRs'],
  ['globalFieldPanels', 'Global Field Panels'],
  ['globalNotepadEntries', 'Global Notepad'],
];

const GLOBAL_ENTITY_CHECKS: readonly EntityCheck[] = GLOBAL_ENTITY_LABELS.map(
  ([entityType, label]) => ({
    entityType,
    table: entityTypeToTable[entityType],
    label,
    hasSoftDelete: true,
  }),
);

const ALL_ENTITY_CHECKS: readonly EntityCheck[] = [...ENTITY_CHECKS, ...GLOBAL_ENTITY_CHECKS];

// Clock-skew tolerance: only treat remote as "newer" when the remote max-updated
// timestamp leads the local one by more than this margin. Absorbs device/server
// clock drift and the sub-second jitter between an upsert and its updated_at trigger.
const UPDATED_MARGIN_MS = 1000;

/** Safely read a string-or-undefined property from an unknown record. */
function readStr(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' ? v : undefined;
}

/** Parse an ISO timestamp to epoch millis, or null if unparseable/absent. */
function toMillis(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Compute the local row count and the max updatedAt (falling back to createdAt)
 * for a single store. Read-only. Most local stores HARD-delete, so there is no
 * deletion flag to honor here — we deliberately do NOT invent one.
 */
function summarizeLocal(rows: Record<string, unknown>[]): {
  localCount: number;
  localMaxUpdated: string | null;
} {
  let maxMs = -Infinity;
  let maxIso: string | null = null;
  for (const r of rows) {
    const stamp = readStr(r, 'updatedAt') ?? readStr(r, 'createdAt');
    if (!stamp) continue;
    const ms = new Date(stamp).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > maxMs) {
      maxMs = ms;
      maxIso = stamp;
    }
  }
  return { localCount: rows.length, localMaxUpdated: maxIso };
}

/**
 * Count pending/failed push-queue items for an entity. These represent local
 * rows the cloud hasn't received yet, i.e. local is LEGITIMATELY ahead. Read-only.
 * 'completed' and 'syncing' items are excluded — completed are already up at the
 * cloud, and syncing are mid-flight (transient, not a durable backlog signal).
 */
function countPending(queue: SyncQueueItem[], entityType: SyncEntityType): number {
  let n = 0;
  for (const item of queue) {
    if (item.entityType !== entityType) continue;
    if (item.status === 'pending' || item.status === 'failed') n += 1;
  }
  return n;
}

/**
 * Classify one entity's local-vs-remote state conservatively.
 *
 *  - 'behind'   : cloud has rows or newer data this device is missing, and there
 *                 is nothing pending locally to explain the gap.
 *  - 'ahead'    : local has more rows than the cloud knows about, beyond what's
 *                 pending — informational only, never counted as behind.
 *  - 'diverged' : the rare both-directions case — remote is clearly newer AND
 *                 local also carries unsynced-ahead signals.
 *  - 'in-sync'  : everything else (the safe default).
 */
function classify(args: {
  localCount: number;
  remoteCount: number;
  localMaxUpdated: string | null;
  remoteMaxUpdated: string | null;
  pendingLocal: number;
}): ConsistencyStatus {
  const { localCount, remoteCount, localMaxUpdated, remoteMaxUpdated, pendingLocal } = args;

  const localMs = toMillis(localMaxUpdated);
  const remoteMs = toMillis(remoteMaxUpdated);

  // Remote leads local in time by a clear margin (clock-skew tolerant).
  const remoteIsNewer =
    remoteMs !== null && (localMs === null ? remoteMs > 0 : remoteMs - localMs > UPDATED_MARGIN_MS);

  // Cloud has more rows than we do locally, unexplained by anything pending.
  const remoteHasMoreRows = remoteCount > localCount && pendingLocal === 0;

  // Local has rows the cloud doesn't, beyond what's still queued to push.
  const localAhead = localCount > remoteCount + pendingLocal;

  // 'behind' when cloud strictly has more rows (no pending to explain it),
  // OR cloud is clearly newer AND not fewer rows — both with nothing pending.
  const isBehind =
    remoteHasMoreRows ||
    (remoteIsNewer && pendingLocal === 0 && remoteCount >= localCount);

  // 'diverged': keep rare — remote clearly newer AND we also have local-ahead signals.
  if (remoteIsNewer && localAhead) return 'diverged';

  if (isBehind) return 'behind';

  // Local ahead is purely informational (e.g. rows created offline still queued
  // or already pushed but cloud count lags a beat). Never counts as behind.
  if (localAhead) return 'ahead';

  return 'in-sync';
}

/**
 * Run the full consistency check across all curated entities.
 *
 * NEVER throws: any failure (unconfigured, unauthenticated, per-table query
 * error) is contained and surfaced as data — unsupported reports or per-row
 * 'error' statuses. Per-entity checks run in parallel, each in its own try/catch.
 */
export async function runConsistencyCheck(): Promise<ConsistencyReport> {
  const checkedAt = new Date().toISOString();

  const unsupported: ConsistencyReport = {
    checkedAt,
    supported: false,
    entities: [],
    behindEntities: 0,
    remoteAheadTotal: 0,
    inSync: true,
  };

  // Guard 1: Supabase env not configured → local-only mode.
  if (!isSupabaseConfigured()) return unsupported;

  const supabase = getSupabaseClient();
  if (!supabase) return unsupported;

  // Guard 2: must be authenticated (RLS-scoped queries are meaningless otherwise).
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return unsupported;
  } catch {
    return unsupported;
  }

  // Read the push queue once, up front (read-only), so every entity can derive
  // its pending count without re-querying IndexedDB.
  let queue: SyncQueueItem[] = [];
  try {
    queue = (await getAllFromStore('syncQueue')) as SyncQueueItem[];
  } catch {
    queue = []; // pending stays 0 — conservative (we may over-flag 'behind' only
    // if the queue was unreadable, which is acceptable and rare).
  }

  const entities = await Promise.all(
    ALL_ENTITY_CHECKS.map(async (check): Promise<EntityConsistency> => {
      const base: EntityConsistency = {
        entityType: check.entityType,
        label: check.label,
        localCount: 0,
        remoteCount: 0,
        localMaxUpdated: null,
        remoteMaxUpdated: null,
        pendingLocal: 0,
        status: 'in-sync',
      };

      try {
        // ── LOCAL (read-only) ──
        const localRows = (await getAllFromStore(check.entityType)) as Record<string, unknown>[];
        const { localCount, localMaxUpdated } = summarizeLocal(localRows);
        const pendingLocal = countPending(queue, check.entityType);

        // ── REMOTE (read-only, single cheap query) ──
        // exact count + the single newest updated_at. RLS scopes to the user.
        let query = supabase
          .from(check.table)
          .select('updated_at', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .limit(1);
        if (check.hasSoftDelete) {
          query = query.is('deleted_at', null);
        }

        const { data, count, error } = await query;
        if (error) {
          return { ...base, localCount, localMaxUpdated, pendingLocal, status: 'error' };
        }

        const remoteCount = count ?? 0;
        const firstRow = Array.isArray(data) && data.length > 0
          ? (data[0] as Record<string, unknown>)
          : null;
        const remoteMaxUpdated = firstRow ? readStr(firstRow, 'updated_at') ?? null : null;

        const status = classify({
          localCount,
          remoteCount,
          localMaxUpdated,
          remoteMaxUpdated,
          pendingLocal,
        });

        return {
          ...base,
          localCount,
          remoteCount,
          localMaxUpdated,
          remoteMaxUpdated,
          pendingLocal,
          status,
        };
      } catch {
        // A single entity failing must not fail the whole check.
        return { ...base, status: 'error' };
      }
    }),
  );

  const behindEntities = entities.reduce(
    (acc, e) => acc + (e.status === 'behind' || e.status === 'diverged' ? 1 : 0),
    0,
  );
  const remoteAheadTotal = entities.reduce(
    (acc, e) => acc + Math.max(0, e.remoteCount - e.localCount),
    0,
  );

  return {
    checkedAt,
    supported: true,
    entities,
    behindEntities,
    remoteAheadTotal,
    inSync: behindEntities === 0,
  };
}
