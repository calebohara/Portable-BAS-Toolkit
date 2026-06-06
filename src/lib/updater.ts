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

// Cache the update object so downloadAndInstall doesn't need to re-fetch.
// Stored alongside the timestamp it was fetched so we can expire stale caches:
// re-fetching at install time would risk installing a different binary than the
// one described in the dialog the user is looking at (race if a new release
// lands between "Check" and "Install").
let cachedUpdate: Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> = null;
let cachedUpdateAt = 0;

// How long a cached update remains valid. After this the dialog must re-check
// before installing so the description the user saw matches the binary fetched.
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Raised by downloadAndInstall when the cached update is missing or stale. */
export class StaleUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleUpdateError';
  }
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
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    // Cache for later use by downloadAndInstall
    cachedUpdate = update;
    cachedUpdateAt = Date.now();

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
    const raw = err instanceof Error ? err.message : 'Failed to check for updates';
    // Sanitize: if the error contains raw git protocol data or is excessively long,
    // replace with a user-friendly message (happens when latest.json is missing from release)
    const isRawProtocol = raw.includes('refs/tags') || raw.includes('refs/heads') || raw.length > 300;
    const isNotFound = raw.includes('404') || raw.includes('Not Found') || raw.includes('not found');
    const message = isRawProtocol
      ? 'Could not fetch update info. The update manifest may be missing from the latest release.'
      : isNotFound
        ? 'Update server unreachable. The repository may be private — auto-updates require a public GitHub repository or a custom update endpoint.'
        : raw;
    logUpdateDebug('tauri-check-error', { error: raw });
    return {
      available: false,
      error: message,
    };
  }
}

/**
 * Download and install the available update.
 *
 * Uses *only* the cached update object from the last {@link checkForUpdate}.
 * It deliberately never re-fetches: re-running check() here could return a
 * different (newer) release than the one shown in the dialog, so the installed
 * binary would not match what the user agreed to. If the cache is missing or
 * older than {@link CACHE_TTL_MS}, this throws a {@link StaleUpdateError} so the
 * caller can re-prompt with a fresh check.
 *
 * Calls onProgress during download, then restarts the app.
 */
export async function downloadAndInstall(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (!isTauri()) return;

  const update = cachedUpdate;
  if (!update) {
    throw new StaleUpdateError('No cached update — run a fresh check before installing.');
  }

  if (Date.now() - cachedUpdateAt > CACHE_TTL_MS) {
    // Don't install a stale binary; force the caller to re-check + re-confirm.
    cachedUpdate = null;
    cachedUpdateAt = 0;
    throw new StaleUpdateError('Update info is stale — please check for updates again.');
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
  cachedUpdateAt = 0;

  // Restart the app to apply the update
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
