/**
 * Tauri Auto-Updater — Checks for updates via GitHub Releases
 * and prompts the user before installing.
 */

import { isTauri } from './tauri-bridge';

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

/**
 * Check if a new version is available from GitHub Releases.
 * Returns update info if available, or { available: false } if up-to-date.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!isTauri()) {
    return { available: false, error: 'Updates only available in the desktop app' };
  }

  try {
    // Dynamic import wrapped in try-catch — these modules only exist in Tauri builds.
    // The bundler may still try to resolve them; the catch handles missing modules.
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (update) {
      return {
        available: true,
        version: update.version,
        date: update.date,
        body: update.body,
      };
    }

    return { available: false };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : 'Failed to check for updates',
    };
  }
}

/**
 * Download and install the available update.
 * Calls onProgress during download, then restarts the app.
 */
export async function downloadAndInstall(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (!isTauri()) return;

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();

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

  // Restart the app to apply the update
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
