/**
 * Tauri Auto-Updater — Checks for updates via GitHub Releases
 * and prompts the user before installing.
 *
 * Desktop-only: uses @tauri-apps/plugin-updater for signed binary updates.
 * The web app uses a separate lightweight GitHub check (see version.ts).
 */

import { isTauri } from './tauri-bridge';
import { logUpdateDebug } from './version';

export interface UpdateStatus {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
  error?: string;
}

export interface DownloadProgress {
  chunkLength: number;
  contentLength: number | null;
}

// Cache the update object so downloadAndInstall doesn't need to re-fetch
let cachedUpdate: Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> = null;

/**
 * Check if a new version is available from GitHub Releases.
 * Returns update info if available, or { available: false } if up-to-date.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!isTauri()) {
    return { available: false, error: 'Updates only available in the desktop app' };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    // Cache for later use by downloadAndInstall
    cachedUpdate = update;

    if (update) {
      logUpdateDebug('tauri-check', {
        available: true,
        latestVersion: update.version,
        date: update.date,
      });

      return {
        available: true,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }

    logUpdateDebug('tauri-check', { available: false });
    return { available: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check for updates';
    logUpdateDebug('tauri-check-error', { error: message });
    return {
      available: false,
      error: message,
    };
  }
}

/**
 * Download and install the available update.
 * Uses the cached update object from the last check to avoid re-fetching.
 * Calls onProgress during download, then restarts the app.
 */
export async function downloadAndInstall(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (!isTauri()) return;

  // Use cached update from checkForUpdate, or re-fetch as fallback
  let update = cachedUpdate;
  if (!update) {
    const { check } = await import('@tauri-apps/plugin-updater');
    update = await check();
  }

  if (!update) {
    throw new Error('No update available');
  }

  let downloaded = 0;
  let contentLength: number | null = null;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data?.contentLength ?? null;
        break;
      case 'Progress':
        downloaded += event.data?.chunkLength ?? 0;
        onProgress?.({
          chunkLength: downloaded,
          contentLength,
        });
        break;
      case 'Finished':
        break;
    }
  });

  // Clear cache after install
  cachedUpdate = null;

  // Restart the app to apply the update
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
