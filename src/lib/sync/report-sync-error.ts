/**
 * report-sync-error.ts
 * Converts a captured SyncError into a BugReport draft and saves it via
 * the existing saveBugReport pipeline.
 *
 * Owned by: Reporting Integration Engineer (SyncErrorAgents)
 */

import { APP_VERSION } from '@/lib/version';
import { saveBugReport } from '@/lib/db';
import { useAppStore } from '@/store/app-store';
import { classifyError } from '@/lib/sync/sync-error-utils';
import type { SyncError } from '@/types';
import type { BugReport, BugReportSeverity } from '@/types';

// ─── Severity mapping ────────────────────────────────────────

const HIGH_SEVERITY_CATEGORIES = new Set([
  'rls-rejected',
  'missing-table',
  'missing-column',
  'fk-violation',
  'unique-violation',
]);

function getSeverity(error: SyncError): BugReportSeverity {
  const category = classifyError({
    code: error.errorCode,
    message: error.errorMessage,
    hint: error.hint,
    details: error.details,
  });
  return HIGH_SEVERITY_CATEGORIES.has(category) ? 'high' : 'medium';
}

// ─── Device detection (mirrors useDeviceClass hook logic) ────

function detectDeviceClass(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasMobileUA = /android|iphone|ipad|ipod|mobile|phone/i.test(ua);
  return hasCoarsePointer && hasMobileUA ? 'mobile' : 'desktop';
}

function detectDesktopOS(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (/win(dows|64|32|nt)/i.test(ua)) return 'windows';
  if (/mac\s?os|macintosh/i.test(ua)) return 'macos';
  if (/linux/i.test(ua) && !/android|mobile/i.test(ua)) return 'linux';
  return 'unknown';
}

// ─── Description builder ─────────────────────────────────────

function buildDescription(error: SyncError): string {
  const payloadStr = error.payload
    ? JSON.stringify(error.payload, null, 2)
    : '(no payload — pull-side failure)';

  return [
    '## Error',
    `Message: ${error.errorMessage}`,
    '',
    '## Postgres response',
    `Code: ${error.errorCode ?? '(none)'}`,
    `Hint: ${error.hint ?? '(none)'}`,
    `Details: ${error.details ?? '(none)'}`,
    '',
    '## Entity context',
    `Entity type: ${error.entityType}`,
    `Entity ID: ${error.entityId}`,
    `Table: ${error.table}`,
    `Action: ${error.action}`,
    '',
    '### Sanitized payload',
    '```json',
    payloadStr,
    '```',
    '',
    '## Retry history',
    `Retry count at capture: ${error.retryCount}`,
    `User ID: ${error.userId}`,
    `Error captured at: ${error.createdAt}`,
    '',
    '## App context',
    `App version (at capture): ${error.appVersion}`,
    `Current page: ${typeof window !== 'undefined' ? window.location.pathname : '(server)'}`,
  ].join('\n');
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Convert a SyncError into a BugReport, save it via saveBugReport, and
 * return the saved report so the caller can toast a confirmation.
 */
export async function reportSyncErrorAsBug(error: SyncError): Promise<BugReport> {
  const now = new Date().toISOString();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  // Read sync status from store without subscribing (safe outside React)
  const { syncStatus, pendingSyncCount } = useAppStore.getState();
  const syncStatusStr = `${syncStatus} (${pendingSyncCount} pending)`;

  const category = classifyError({
    code: error.errorCode,
    message: error.errorMessage,
    hint: error.hint,
    details: error.details,
  });

  const report: BugReport = {
    id: crypto.randomUUID(),
    title: `[sync] ${category} on ${error.entityType}`,
    description: buildDescription(error),
    stepsToReproduce: 'Surfaced automatically from Sync Error Inspector. User did not type these steps.',
    severity: getSeverity(error),
    status: 'open',
    appVersion: APP_VERSION,
    deviceClass: detectDeviceClass(),
    desktopOS: detectDesktopOS(),
    currentPage: pathname,
    syncStatus: syncStatusStr,
    createdAt: now,
    updatedAt: now,
  };

  await saveBugReport(report);
  return report;
}
