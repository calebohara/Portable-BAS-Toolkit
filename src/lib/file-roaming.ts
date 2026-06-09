'use client';

/**
 * GAP-1 — regular (non-global) project file roaming.
 *
 * Historically a regular file upload stored its bytes ONLY in the origin
 * device's IndexedDB and synced just the metadata row, so on any other device
 * (or after a user-switch wipe) the file was a dead link. Global-project files
 * already roamed via Supabase Storage; this module gives regular project files
 * the same treatment through a single shared path (read + write), so we don't
 * fork a second copy of the upload/download logic.
 *
 * Strategy (see findings GAP-1):
 *   • forward  — new uploads push their blob to Storage at save time.
 *   • read     — resolve a version's blob locally first, else download from
 *                Storage and cache it.
 *   • backfill — when a device holds the only local copy of a pre-roaming file
 *                and opens it, opportunistically upload it so peers can fetch it.
 */

import { getFileBlob, saveFileBlob, saveFile } from '@/lib/db';
import {
  buildStoragePath,
  uploadBlobToStorage,
  downloadFromStorage,
} from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { FileVersion, ProjectFile } from '@/types';

/**
 * Whether a version's bytes are reachable from this device at all — either a
 * local IndexedDB copy or a roamed Storage copy. A version with neither is
 * "stranded" (its bytes live only on another device that hasn't roamed yet).
 */
export function isBlobReachable(version: FileVersion | undefined): boolean {
  return Boolean(version?.blobKey) || Boolean(version?.storagePath);
}

/**
 * Upload a regular project file's local blob to Supabase Storage and persist the
 * resulting `storagePath` on the version so it syncs to every device. Best
 * effort — callers must NOT block the save on it (offline simply leaves the file
 * local until the next access triggers a backfill). No-op if already roamed or
 * if Supabase isn't configured.
 */
export async function roamFileToStorage(
  file: ProjectFile,
  versionId: string,
  blob: Blob,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const version = file.versions.find((v) => v.id === versionId);
  if (!version || version.storagePath) return; // already roamed

  const path = buildStoragePath(file.projectId || 'unassigned', file.fileName);
  await uploadBlobToStorage(blob, path, file.mimeType);

  // Persist the path on the version so it syncs (rides in the `versions` JSON).
  version.storagePath = path;
  await saveFile(file);
}

/**
 * Resolve a file version's blob, roaming-aware:
 *   1. Prefer the local IndexedDB copy (offline-first).
 *   2. Missing locally but roamed → download from Storage and cache it.
 *   3. Local copy present but not yet roamed → kick off a background upload so
 *      peers can fetch it (lazy backfill of pre-roaming files), and return the
 *      local copy immediately.
 * Returns undefined only when the blob is neither local nor in Storage.
 */
export async function resolveFileBlob(
  file: ProjectFile,
  version: FileVersion | undefined,
): Promise<Blob | undefined> {
  if (!version) return undefined;

  const local = version.blobKey ? await getFileBlob(version.blobKey) : undefined;
  if (local) {
    if (!version.storagePath) {
      // Backfill-on-access: this device holds the only copy. Fire-and-forget.
      void roamFileToStorage(file, version.id, local).catch(() => {});
    }
    return local;
  }

  if (version.storagePath) {
    try {
      const blob = await downloadFromStorage(version.storagePath);
      // Cache locally so subsequent reads are offline-fast.
      if (version.blobKey) await saveFileBlob(version.blobKey, blob).catch(() => {});
      return blob;
    } catch {
      return undefined; // offline, or the object was removed
    }
  }

  return undefined; // stranded — bytes live only on a device that hasn't roamed
}
