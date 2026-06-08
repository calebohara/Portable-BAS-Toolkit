/**
 * sync-error-utils.ts
 * Utility functions for the SyncError capture layer.
 * Owned by: Capture Engineer (SyncErrorAgents)
 */

// ─── Types ───────────────────────────────────────────────────

export type SyncErrorCategory =
  | 'missing-table'
  | 'rls-rejected'
  | 'missing-column'
  | 'fk-violation'
  | 'unique-violation'
  | 'network'
  | 'unknown';

export interface PostgrestErrorShape {
  code: string | null;
  message: string;
  hint: string | null;
  details: string | null;
}

// ─── sanitizeForLog ──────────────────────────────────────────

const SENSITIVE_KEY_RE = /api[_-]?key|token|secret|password/i;
const SENSITIVE_VALUE_SUBSTRINGS = ['api_key', 'token', 'secret', 'password'];
const BLOB_RE = /^[A-Za-z0-9+/=]+$/;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

function isSensitiveValue(value: string): boolean {
  const lower = value.toLowerCase();
  return SENSITIVE_VALUE_SUBSTRINGS.some((s) => lower.includes(s));
}

/**
 * Deep-sanitize a payload before persisting to IndexedDB.
 * Returns a new object — the original is never mutated.
 */
export function sanitizeForLog(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    const sanitized = payload.map((item) => sanitizeForLog(item));
    if (sanitized.length > 50) {
      const remaining = sanitized.length - 10;
      return [...sanitized.slice(0, 10), `_truncated: ${remaining} more`];
    }
    return sanitized;
  }

  if (payload !== null && typeof payload === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      if (typeof value === 'string') {
        // Check for sensitive substrings in the value itself
        if (isSensitiveValue(value)) {
          result[key] = '[REDACTED]';
          continue;
        }
        // Long base64-ish blob
        if (value.length > 1000 && BLOB_RE.test(value)) {
          result[key] = `[BLOB ${value.length} chars]`;
          continue;
        }
        // Long string truncation
        if (value.length > 5000) {
          result[key] = value.slice(0, 5000) + '… (truncated at 5000)';
          continue;
        }
        result[key] = value;
      } else {
        result[key] = sanitizeForLog(value);
      }
    }
    return result;
  }

  if (typeof payload === 'string') {
    if (isSensitiveValue(payload)) return '[REDACTED]';
    if (payload.length > 1000 && BLOB_RE.test(payload)) return `[BLOB ${payload.length} chars]`;
    if (payload.length > 5000) return payload.slice(0, 5000) + '… (truncated at 5000)';
    return payload;
  }

  return payload;
}

// ─── formatPostgrestError ────────────────────────────────────

/**
 * Normalise the three error shapes that sync-manager.ts encounters into a
 * consistent { code, message, hint, details } structure.
 *
 * Shape 1 — native Error
 * Shape 2 — PostgREST plain object { message, code, details, hint }
 * Shape 3 — anything else → JSON.stringify fallback
 */
export function formatPostgrestError(err: unknown): PostgrestErrorShape {
  if (err instanceof Error) {
    return {
      code: null,
      message: err.message,
      hint: null,
      details: null,
    };
  }

  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      hint: typeof e.hint === 'string' ? e.hint : null,
      details: typeof e.details === 'string' ? e.details : null,
    };
  }

  return {
    code: null,
    message: JSON.stringify(err),
    hint: null,
    details: null,
  };
}

// ─── classifyError ───────────────────────────────────────────

/**
 * Return a short human-readable category string from a raw error value.
 * Used by Agent 2 for icon/colour selection.
 *
 * SQLSTATE mapping:
 *   42P01 → missing-table
 *   42501 → rls-rejected
 *   42703 → missing-column (also PGRST204 schema-cache miss)
 *   23503 → fk-violation
 *   23505 → unique-violation
 *   (no code, message includes 'fetch'/'NetworkError') → network
 *   (anything else) → unknown
 */
export function classifyError(err: unknown): SyncErrorCategory {
  const { code, message } = formatPostgrestError(err);

  if (code) {
    switch (code) {
      case '42P01': return 'missing-table';
      case '42501': return 'rls-rejected';
      case '42703': return 'missing-column';
      case 'PGRST204': return 'missing-column';
      case '23503': return 'fk-violation';
      case '23505': return 'unique-violation';
    }
  }

  // Network heuristic — no SQLSTATE, message looks like a fetch/network failure
  if (!code && (
    message.toLowerCase().includes('fetch') ||
    message.toLowerCase().includes('networkerror') ||
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('network request failed')
  )) {
    return 'network';
  }

  // Also check for "relation does not exist" pattern used in sync-manager.ts
  if (code === '42P01' || (message.includes('relation') && message.includes('does not exist'))) {
    return 'missing-table';
  }

  return 'unknown';
}

// ─── isTransientSyncError ────────────────────────────────────

/**
 * SQLSTATE / PostgREST codes that are DETERMINISTICALLY PERMANENT — retrying
 * can never make the write succeed, so the auto-recovery sweep must leave these
 * parked at `failed` (Phase 1b).
 *
 *   42501    → RLS rejection (not your row / no policy)
 *   23503    → FK violation (parent missing)
 *   23505    → unique violation (duplicate key)
 *   42703    → missing column
 *   PGRST204 → schema-cache miss (missing column, PostgREST view)
 *   42P01    → missing table
 *   22P02    → invalid text representation (bad uuid/enum) — bad data, not flaky
 */
const PERMANENT_ERROR_CODES = new Set<string>([
  '42501', '23503', '23505', '42703', 'PGRST204', '42P01', '22P02',
]);

/**
 * Classify a failure as TRANSIENT (worth auto-recovering once conditions
 * improve) vs PERMANENT (leave parked). Used by the reconnect / periodic
 * auto-recovery sweep (Phase 1b).
 *
 * Transient = network blip, server 5xx, or auth-token expiry (JWT / PGRST301).
 * Anything in `PERMANENT_ERROR_CODES` is NOT transient. An UNKNOWN failure with
 * no recognised permanent code is treated as transient (conservative: prefer to
 * retry an ambiguous error rather than strand a legitimate write) — except when
 * its message clearly names a permanent condition.
 *
 * Accepts the persisted `errorCode` + `lastError` message off a queue item so
 * the caller (db.recoverTransientFailedItems) doesn't need the raw error object.
 */
export function isTransientSyncError(
  errorCode: string | undefined,
  lastError: string | undefined,
): boolean {
  const code = errorCode ?? '';
  if (PERMANENT_ERROR_CODES.has(code)) return false;

  // Explicitly transient auth-token expiry.
  if (code === 'PGRST301' || code === '401') return true;

  const msg = (lastError ?? '').toLowerCase();

  // Message-level permanent signals (covers cases where no SQLSTATE was captured).
  if (
    msg.includes('row-level security')
    || msg.includes('violates foreign key')
    || msg.includes('duplicate key')
    || (msg.includes('column') && msg.includes('does not exist'))
    || (msg.includes('relation') && msg.includes('does not exist'))
  ) {
    return false;
  }

  // Message-level transient signals.
  if (
    msg.includes('fetch')
    || msg.includes('network')
    || msg.includes('timeout')
    || msg.includes('jwt expired')
    || msg.includes('token')
    || /\b5\d{2}\b/.test(msg) // 5xx
  ) {
    return true;
  }

  // No recognised permanent code/message → treat as transient (retry-safe).
  return true;
}
