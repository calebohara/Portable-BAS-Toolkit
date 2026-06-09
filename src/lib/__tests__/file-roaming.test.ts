import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  getFileBlob: vi.fn(),
  saveFileBlob: vi.fn().mockResolvedValue(undefined),
  saveFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/storage', () => ({
  buildStoragePath: vi.fn(() => 'projects/p1/uuid-doc.pdf'),
  uploadBlobToStorage: vi.fn().mockResolvedValue('projects/p1/uuid-doc.pdf'),
  downloadFromStorage: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

import { resolveFileBlob, roamFileToStorage, isBlobReachable } from '../file-roaming';
import { getFileBlob, saveFileBlob, saveFile } from '@/lib/db';
import { uploadBlobToStorage, downloadFromStorage } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { ProjectFile, FileVersion } from '@/types';

function makeFile(version: Partial<FileVersion>): ProjectFile {
  const v: FileVersion = {
    id: 'v1', fileId: 'f1', versionNumber: 1, uploadedAt: '', uploadedBy: '',
    notes: '', size: 1, status: 'current', ...version,
  };
  return {
    id: 'f1', projectId: 'p1', title: 't', fileName: 'doc.pdf', fileType: 'pdf',
    mimeType: 'application/pdf', category: 'general-documents', revisionNumber: 'Rev 1',
    revisionDate: '', uploadedBy: '', notes: '', tags: [], status: 'current',
    isPinned: false, isFavorite: false, isOfflineCached: true, currentVersionId: 'v1',
    versions: [v], createdAt: '', updatedAt: '', size: 1,
  } as ProjectFile;
}

const localBlob = new Blob(['local']);
const remoteBlob = new Blob(['remote']);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
});

describe('resolveFileBlob (GAP-1)', () => {
  it('returns the local blob when present, without downloading', async () => {
    vi.mocked(getFileBlob).mockResolvedValue(localBlob);
    const file = makeFile({ blobKey: 'bk1', storagePath: 'projects/p1/x.pdf' });

    const out = await resolveFileBlob(file, file.versions[0]);

    expect(out).toBe(localBlob);
    expect(downloadFromStorage).not.toHaveBeenCalled();
  });

  it('downloads from Storage and caches locally when the local copy is missing', async () => {
    vi.mocked(getFileBlob).mockResolvedValue(undefined);
    vi.mocked(downloadFromStorage).mockResolvedValue(remoteBlob);
    const file = makeFile({ blobKey: 'bk1', storagePath: 'projects/p1/x.pdf' });

    const out = await resolveFileBlob(file, file.versions[0]);

    expect(out).toBe(remoteBlob);
    expect(downloadFromStorage).toHaveBeenCalledWith('projects/p1/x.pdf');
    expect(saveFileBlob).toHaveBeenCalledWith('bk1', remoteBlob); // cached for next time
  });

  it('returns undefined when the blob is neither local nor roamed (stranded)', async () => {
    vi.mocked(getFileBlob).mockResolvedValue(undefined);
    const file = makeFile({ blobKey: 'bk1' }); // no storagePath

    const out = await resolveFileBlob(file, file.versions[0]);

    expect(out).toBeUndefined();
    expect(downloadFromStorage).not.toHaveBeenCalled();
  });

  it('backfills a local-only (pre-roaming) file by uploading it on access', async () => {
    vi.mocked(getFileBlob).mockResolvedValue(localBlob);
    const file = makeFile({ blobKey: 'bk1' }); // local present, never roamed

    const out = await resolveFileBlob(file, file.versions[0]);

    expect(out).toBe(localBlob);
    expect(uploadBlobToStorage).toHaveBeenCalledWith(localBlob, expect.any(String), 'application/pdf');
  });
});

describe('roamFileToStorage (GAP-1)', () => {
  it('uploads and persists storagePath on the version', async () => {
    const file = makeFile({ blobKey: 'bk1' });

    await roamFileToStorage(file, 'v1', localBlob);

    expect(uploadBlobToStorage).toHaveBeenCalledWith(localBlob, 'projects/p1/uuid-doc.pdf', 'application/pdf');
    expect(file.versions[0].storagePath).toBe('projects/p1/uuid-doc.pdf');
    expect(saveFile).toHaveBeenCalledWith(file);
  });

  it('is a no-op when the version already roamed', async () => {
    const file = makeFile({ blobKey: 'bk1', storagePath: 'projects/p1/existing.pdf' });

    await roamFileToStorage(file, 'v1', localBlob);

    expect(uploadBlobToStorage).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('is a no-op when Supabase is not configured', async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const file = makeFile({ blobKey: 'bk1' });

    await roamFileToStorage(file, 'v1', localBlob);

    expect(uploadBlobToStorage).not.toHaveBeenCalled();
  });
});

describe('isBlobReachable', () => {
  it('is true when local or roamed, false when neither', () => {
    expect(isBlobReachable({ blobKey: 'x' } as FileVersion)).toBe(true);
    expect(isBlobReachable({ storagePath: 'y' } as FileVersion)).toBe(true);
    expect(isBlobReachable({} as FileVersion)).toBe(false);
    expect(isBlobReachable(undefined)).toBe(false);
  });
});
