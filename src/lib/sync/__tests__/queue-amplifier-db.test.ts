import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Phase 1b — db-layer behaviors backing the "queue amplifier" fixes:
//   • Fix B (Finding #6) — addSyncError per-signature dedup (occurrences++,
//     one row instead of a new random-id row per retry).
//   • Fix C — getPendingSyncItems backoff gate (nextRetryAt) +
//     recoverTransientFailedItems auto-recovery (transient re-pended, permanent
//     parked).
//   • Fix A support — addSyncItemPreservingRetry carries over a failed item's
//     retriedCount.
// These run against REAL fake-indexeddb so they exercise the actual store +
// transaction logic.

vi.mock('@/lib/sync/sync-bridge', () => ({ notifySync: vi.fn() }));

import {
  addSyncError,
  getAllSyncErrors,
  getSyncErrorsCount,
  addSyncItem,
  addSyncItemPreservingRetry,
  getPendingSyncItems,
  recoverTransientFailedItems,
  getSyncMeta,
  setSyncMeta,
  clearAllData,
} from '../../db';
import { isTransientSyncError } from '../sync-error-utils';
import type { SyncError, SyncQueueItem } from '@/types';

function makeError(over: Partial<SyncError> = {}): SyncError {
  return {
    id: over.id ?? 'sig-1',
    entityType: 'devices',
    entityId: '11111111-2222-3333-4444-555555555555',
    action: 'update',
    table: 'devices',
    errorCode: '42501',
    errorMessage: 'rls rejected',
    hint: null,
    details: null,
    payload: null,
    retryCount: 0,
    userId: 'user-1',
    appVersion: 'test',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function makeQueueItem(over: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: over.id ?? 'devices-aaaa',
    action: 'update',
    entityType: 'devices',
    entityId: 'aaaa',
    payload: { id: 'aaaa', name: 'x' },
    userId: 'user-1',
    status: 'pending',
    createdAt: new Date().toISOString(),
    retriedCount: 0,
    ...over,
  };
}

beforeEach(async () => {
  await clearAllData();
});

describe('addSyncError — per-signature dedup (Finding #6)', () => {
  it('two identical failures produce ONE row with occurrences=2', async () => {
    const sig = 'devices-aaaa-42501';
    const first = await addSyncError(makeError({ id: sig }));
    const second = await addSyncError(makeError({ id: sig }));

    expect(first).toBe(true);   // first occurrence → new signature
    expect(second).toBe(false); // duplicate → bumped, not new

    const all = await getAllSyncErrors();
    expect(all).toHaveLength(1);
    expect(all[0].occurrences).toBe(2);
    expect(await getSyncErrorsCount()).toBe(1);
  });

  it('preserves firstSeenAt/createdAt on the dedup but advances lastSeenAt', async () => {
    const sig = 'devices-aaaa-42501';
    await addSyncError(makeError({ id: sig, createdAt: '2026-01-01T00:00:00.000Z' }));
    await addSyncError(makeError({ id: sig, createdAt: '2026-02-02T00:00:00.000Z' }));

    const [row] = await getAllSyncErrors();
    expect(row.firstSeenAt).toBe('2026-01-01T00:00:00.000Z');
    expect(row.createdAt).toBe('2026-01-01T00:00:00.000Z'); // anchored to first
    expect(row.lastSeenAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('distinct signatures (different errorCode) produce two rows', async () => {
    await addSyncError(makeError({ id: 'devices-aaaa-42501', errorCode: '42501' }));
    await addSyncError(makeError({ id: 'devices-aaaa-23503', errorCode: '23503' }));

    expect(await getSyncErrorsCount()).toBe(2);
  });

  it('does NOT churn the 100-row cap on a recurring failure (evicts nothing)', async () => {
    // Seed 99 distinct genuine errors.
    for (let i = 0; i < 99; i++) {
      await addSyncError(makeError({
        id: `devices-row${i}-42703`,
        entityId: `row${i}`,
        errorCode: '42703',
        createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      }));
    }
    expect(await getSyncErrorsCount()).toBe(99);

    // One recurring failure firing 50 times must NOT evict the 99 distinct rows.
    for (let i = 0; i < 50; i++) {
      await addSyncError(makeError({ id: 'devices-poison-42501', errorCode: '42501' }));
    }

    expect(await getSyncErrorsCount()).toBe(100); // 99 distinct + 1 deduped poison
    const poison = (await getAllSyncErrors()).find((e) => e.id === 'devices-poison-42501');
    expect(poison?.occurrences).toBe(50);
  });
});

describe('getPendingSyncItems — exponential backoff gate (Fix C)', () => {
  it('skips a just-failed item until nextRetryAt passes', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await addSyncItem(makeQueueItem({ id: 'devices-future', status: 'pending', nextRetryAt: future }));
    await addSyncItem(makeQueueItem({ id: 'devices-now', status: 'pending' })); // no gate

    const eligible = await getPendingSyncItems(20);
    const ids = eligible.map((i) => i.id);
    expect(ids).toContain('devices-now');
    expect(ids).not.toContain('devices-future');
  });

  it('includes the item once nextRetryAt is in the past', async () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    await addSyncItem(makeQueueItem({ id: 'devices-past', status: 'pending', nextRetryAt: past }));

    const eligible = await getPendingSyncItems(20);
    expect(eligible.map((i) => i.id)).toContain('devices-past');
  });
});

describe('recoverTransientFailedItems — auto-recovery (Fix C)', () => {
  it('re-pends a transient failed item but leaves a permanent (42501) one parked', async () => {
    await addSyncItem(makeQueueItem({
      id: 'devices-transient', status: 'failed', retriedCount: 5,
      lastErrorCode: undefined, lastError: 'Failed to fetch',
    }));
    await addSyncItem(makeQueueItem({
      id: 'devices-permanent', status: 'failed', retriedCount: 5,
      lastErrorCode: '42501', lastError: 'rls rejected',
    }));

    const recovered = await recoverTransientFailedItems(isTransientSyncError);
    expect(recovered).toBe(1);

    // Transient item is now pending again (retry counter reset, gate cleared).
    const eligible = await getPendingSyncItems(20);
    const ids = eligible.map((i) => i.id);
    expect(ids).toContain('devices-transient');
    const reArmed = eligible.find((i) => i.id === 'devices-transient');
    expect(reArmed?.retriedCount).toBe(0);
    expect(reArmed?.nextRetryAt).toBeUndefined();

    // Permanent item stays parked (not eligible).
    expect(ids).not.toContain('devices-permanent');
  });
});

describe('addSyncItemPreservingRetry — keep poison bookkeeping (Fix A)', () => {
  it('carries over an existing failed item retriedCount/status instead of resetting', async () => {
    await addSyncItem(makeQueueItem({
      id: 'devices-aaaa', status: 'failed', retriedCount: 5, lastError: 'boom', lastErrorCode: '42501',
    }));

    // fullSync-style re-enqueue with a fresh retriedCount:0 item.
    await addSyncItemPreservingRetry(makeQueueItem({
      id: 'devices-aaaa', status: 'pending', retriedCount: 0,
      payload: { id: 'aaaa', name: 'updated' },
    }));

    const eligible = await getPendingSyncItems(20);
    // Still failed → NOT eligible (not reset to a clean pending/0).
    expect(eligible.map((i) => i.id)).not.toContain('devices-aaaa');
  });

  it('inserts a brand-new item as-is (fresh retriedCount: 0, pending)', async () => {
    await addSyncItemPreservingRetry(makeQueueItem({ id: 'devices-bbbb', entityId: 'bbbb' }));
    const eligible = await getPendingSyncItems(20);
    const row = eligible.find((i) => i.id === 'devices-bbbb');
    expect(row?.retriedCount).toBe(0);
    expect(row?.status).toBe('pending');
  });
});

describe('syncMeta keyval', () => {
  it('round-trips a value and clears with clearAllData', async () => {
    expect(await getSyncMeta('lastFullPush:devices')).toBeNull();
    await setSyncMeta('lastFullPush:devices', '2026-03-01T00:00:00.000Z');
    expect(await getSyncMeta('lastFullPush:devices')).toBe('2026-03-01T00:00:00.000Z');
    await clearAllData();
    expect(await getSyncMeta('lastFullPush:devices')).toBeNull();
  });
});
