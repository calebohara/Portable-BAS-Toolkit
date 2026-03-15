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
 * Get the public URL for a file in storage.
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
 * Format file size for display.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
