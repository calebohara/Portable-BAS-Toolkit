import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('@/lib/sync/sync-bridge', () => ({ notifySync: vi.fn() }));

// deleteFile dynamically imports this to purge roamed objects; capture the call
// without touching Supabase.
const deleteManyFromStorage = vi.fn().mockResolvedValue(0);
vi.mock('@/lib/storage', () => ({ deleteManyFromStorage }));

import {
  saveFile, deleteFile, saveFileBlob, getFileBlob, clearFileCache,
  saveDailyReport, clearAllData,
} from '../db';
import type { ProjectFile, DailyReport } from '@/types';

/**
 * Regression coverage for the blob-lifecycle P0 (BASAgents audit 2026-08-29).
 *
 * `fileBlobs` is treated as a disposable cache by three paths, but for two kinds
 * of content it is the system of record: daily-report attachments (no
 * storagePath field exists at all) and un-roamed file versions (roaming is
 * best-effort and no-ops without Supabase). Clearing or evicting those destroys
 * the user's only copy.
 */

const now = new Date().toISOString();

function makeFile(id: string, versions: Partial<ProjectFile['versions'][number]>[]): ProjectFile {
  return {
    id,
    projectId: 'p1',
    title: `file-${id}`,
    category: 'other',
    tags: [],
    createdAt: now,
    updatedAt: now,
    currentVersionId: 'v1',
    versions: versions.map((v, i) => ({
      id: v.id ?? `v${i + 1}`,
      versionNumber: i + 1,
      uploadedAt: now,
      uploadedBy: 'tech',
      notes: '',
      size: 10,
      status: 'current',
      ...v,
    })),
  } as unknown as ProjectFile;
}

function makeReport(id: string, blobKey: string): DailyReport {
  return {
    id,
    projectId: 'p1',
    reportNumber: 1,
    date: now,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    attachments: [{
      id: 'a1', fileName: 'photo.jpg', fileType: 'image',
      mimeType: 'image/jpeg', size: 10, blobKey,
    }],
  } as unknown as DailyReport;
}

const blob = () => new Blob(['x']);

describe('clearFileCache — only-copy protection', () => {
  beforeEach(async () => {
    await clearAllData();
    deleteManyFromStorage.mockClear();
  });

  it('keeps un-roamed file blobs and clears roamed ones', async () => {
    await saveFile(makeFile('f-roamed', [{ blobKey: 'b-roamed', storagePath: 'projects/p1/x.pdf' }]));
    await saveFile(makeFile('f-local', [{ blobKey: 'b-local' }])); // no storagePath
    await saveFileBlob('b-roamed', blob());
    await saveFileBlob('b-local', blob());

    const { cleared, keptOnlyCopies } = await clearFileCache();

    expect(cleared).toBe(1);
    expect(keptOnlyCopies).toBe(1);
    // The re-downloadable one went...
    expect(await getFileBlob('b-roamed')).toBeUndefined();
    // ...the only copy stayed.
    expect(await getFileBlob('b-local')).toBeDefined();
  });

  it('keeps daily-report attachments (they have no cloud copy at all)', async () => {
    await saveDailyReport(makeReport('r1', 'b-report'));
    await saveFileBlob('b-report', blob());

    const { cleared, keptOnlyCopies } = await clearFileCache();

    expect(cleared).toBe(0);
    expect(keptOnlyCopies).toBe(1);
    expect(await getFileBlob('b-report')).toBeDefined();
  });

  it('clears genuinely orphaned blobs', async () => {
    await saveFileBlob('b-orphan', blob());

    const { cleared, keptOnlyCopies } = await clearFileCache();

    expect(cleared).toBe(1);
    expect(keptOnlyCopies).toBe(0);
    expect(await getFileBlob('b-orphan')).toBeUndefined();
  });
});

describe('deleteFile — roamed Storage objects', () => {
  beforeEach(async () => {
    await clearAllData();
    deleteManyFromStorage.mockClear();
  });

  it('removes the Storage objects for every roamed version', async () => {
    await saveFile(makeFile('f1', [
      { id: 'v1', blobKey: 'b1', storagePath: 'projects/p1/v1.pdf' },
      { id: 'v2', blobKey: 'b2', storagePath: 'projects/p1/v2.pdf' },
    ]));
    await saveFileBlob('b1', blob());
    await saveFileBlob('b2', blob());

    await deleteFile('f1');

    expect(deleteManyFromStorage).toHaveBeenCalledWith([
      'projects/p1/v1.pdf',
      'projects/p1/v2.pdf',
    ]);
    // Local blobs still purged as before.
    expect(await getFileBlob('b1')).toBeUndefined();
  });

  it('does not call Storage when nothing was ever roamed', async () => {
    await saveFile(makeFile('f2', [{ blobKey: 'b3' }]));
    await saveFileBlob('b3', blob());

    await deleteFile('f2');

    expect(deleteManyFromStorage).not.toHaveBeenCalled();
  });

  it('still deletes the local row when Storage cleanup fails', async () => {
    deleteManyFromStorage.mockRejectedValueOnce(new Error('network down'));
    await saveFile(makeFile('f3', [{ blobKey: 'b4', storagePath: 'projects/p1/v.pdf' }]));
    await saveFileBlob('b4', blob());

    await expect(deleteFile('f3')).resolves.toBeUndefined();
    expect(await getFileBlob('b4')).toBeUndefined();
  });
});
