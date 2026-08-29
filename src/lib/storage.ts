'use client';

import { getSupabaseClient } from '@/lib/supabase/client';

// ─── Constants ──────────────────────────────────────────────────────────────

export const PROJECT_FILES_BUCKET = 'project-files';
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB for photos/images
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB for documents

const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isImageFile(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Get the appropriate size limit based on file type.
 * Photos: 5MB, Documents: 50MB.
 */
export function getFileSizeLimit(mimeType: string): number {
  return isImageFile(mimeType) ? MAX_PHOTO_SIZE : MAX_FILE_SIZE;
}

/**
 * Validate file size against the appropriate limit.
 * Returns null if valid, error message if invalid.
 */
export function validateFileSize(file: File): string | null {
  const limit = getFileSizeLimit(file.type);
  if (file.size > limit) {
    const limitMB = (limit / (1024 * 1024)).toFixed(0);
    const isPhoto = isImageFile(file.type);
    return `${isPhoto ? 'Photo' : 'File'} "${file.name}" exceeds ${limitMB}MB limit`;
  }
  return null;
}

// ─── Upload / Download ──────────────────────────────────────────────────────

/**
 * Build a storage path for a project file.
 * Format: projects/{projectId}/{uuid}-{filename}
 */
export function buildStoragePath(
  projectId: string,
  fileName: string,
  prefix?: string,
): string {
  const uuid = crypto.randomUUID();
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const folder = prefix ? `${prefix}/${projectId}` : `projects/${projectId}`;
  return `${folder}/${uuid}-${sanitized}`;
}

/**
 * Upload a file to Supabase Storage.
 * Returns the storage path on success or throws on error.
 */
export async function uploadProjectFile(
  file: File,
  storagePath: string,
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (error) throw new Error(error.message);
  return storagePath;
}

/**
 * Upload a Blob (e.g. from IndexedDB) to Supabase Storage.
 * Returns the storage path on success or throws on error.
 */
export async function uploadBlobToStorage(
  blob: Blob,
  storagePath: string,
  contentType: string,
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: contentType || 'application/octet-stream',
    });

  if (error) throw new Error(error.message);
  return storagePath;
}

/**
 * Issue a short-lived signed URL for a file in the project-files bucket.
 *
 * Prefer this over getPublicUrl(). The bucket is being moved to `public = false`
 * (see supabase/migrations/make-project-files-bucket-private.sql): a PUBLIC
 * bucket serves /object/public/<path> WITHOUT consulting RLS, so anyone holding
 * a URL could read any customer's site drawings and field photos forever, and a
 * "deleted" file stayed readable at its old URL.
 *
 * Signed URLs work against a public bucket too, so this can (and should) ship
 * BEFORE the bucket is flipped — deploy the code, then apply the migration.
 *
 * @param expiresIn seconds the link stays valid (default 5 minutes — long enough
 *                  to open or download, short enough that a leaked URL is inert).
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn = 300,
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    console.warn('[storage] Failed to sign URL for', storagePath, error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Get the public URL for a file in storage.
 *
 * @deprecated Use getSignedUrl(). This only resolves while the bucket is
 * `public = true`, and it hands out a URL that never expires and is readable by
 * anyone. Retained for the `avatars` bucket pattern and any not-yet-migrated
 * caller; do not add new uses.
 */
export function getPublicUrl(storagePath: string): string | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = client.storage
    .from(PROJECT_FILES_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || null;
}

/**
 * Download a file from Supabase Storage as a Blob.
 */
export async function downloadFromStorage(storagePath: string): Promise<Blob> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { data, error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .download(storagePath);

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No data returned from download');
  return data;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromStorage(storagePath: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .remove([storagePath]);

  if (error) throw new Error(error.message);
}

/**
 * Best-effort batch delete of multiple storage paths in a single round-trip.
 * Empty/falsy paths are filtered out. Returns the number of paths attempted.
 * Throws only if the underlying Storage API errors — callers that want a
 * best-effort cleanup (e.g. project deletion) should catch and swallow.
 */
export async function deleteManyFromStorage(paths: string[]): Promise<number> {
  const cleaned = paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (cleaned.length === 0) return 0;

  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { error } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .remove(cleaned);

  if (error) throw new Error(error.message);
  return cleaned.length;
}

/**
 * Format file size for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
