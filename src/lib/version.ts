/**
 * Version utilities — Canonical version source, semver comparison,
 * and GitHub release fetching for update detection.
 */

// ─── Canonical Current Version ──────────────────────────────
// Single source of truth: package.json → next.config.ts → build-time env var.
// Tauri conf and Cargo.toml must be kept in sync manually (enforced by release workflow).
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

// ─── Semver Comparison ──────────────────────────────────────

/** Parse a version string like "2.4.3" or "v2.4.3" into [major, minor, patch] */
function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.replace(/^v/, '').split('-')[0]; // strip v-prefix and prerelease
  const parts = cleaned.split('.');
  if (parts.length < 3) return null;
  const nums = parts.slice(0, 3).map(Number);
  if (nums.some(isNaN)) return null;
  return nums as [number, number, number];
}

/**
 * Compare two semver strings.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal.
 * Returns 0 for malformed inputs (safe default — no false positive).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/** Returns true if `latest` is strictly newer than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareSemver(latest, current) === 1;
}

// ─── GitHub Release Fetching ────────────────────────────────

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
}

const GITHUB_OWNER = 'calebohara';
const GITHUB_REPO = 'Portable-BAS-Toolkit';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/**
 * Fetch the latest published (non-draft, non-prerelease) release from GitHub.
 * Uses the /releases/latest endpoint which already filters drafts and prereleases.
 * Returns null on any failure (network, rate limit, parse error).
 */
export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(GITHUB_API_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
      // Bypass cache to get fresh data
      cache: 'no-store',
    });

    clearTimeout(timeout);

    // Rate limited or error — fail gracefully
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[update-check] GitHub API returned ${res.status}`);
      }
      return null;
    }

    const data = await res.json();

    // Validate expected shape
    if (!data || typeof data.tag_name !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[update-check] Invalid GitHub release payload', data);
      }
      return null;
    }

    // Double-check: reject drafts/prereleases (shouldn't happen with /latest, but be safe)
    if (data.draft || data.prerelease) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[update-check] Latest release is draft or prerelease, ignoring');
      }
      return null;
    }

    return data as GitHubRelease;
  } catch (err) {
    // Network error, timeout, abort — all handled gracefully
    if (process.env.NODE_ENV === 'development') {
      console.warn('[update-check] Failed to fetch latest release:', err);
    }
    return null;
  }
}

// ─── Dismissal Persistence ──────────────────────────────────

const DISMISSED_KEY = 'bau-update-dismissed-version';

/** Get the version the user has dismissed. */
export function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Record that the user dismissed the update prompt for a specific version. */
export function setDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, version.replace(/^v/, ''));
  } catch {
    // localStorage not available — fail silently
  }
}

/** Clear dismissed state (e.g., when user's current version catches up). */
export function clearDismissedVersion(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // fail silently
  }
}

/**
 * Check if a version should be shown to the user based on dismissal state.
 * Returns true if the version is newer than both the current version and the dismissed version.
 */
export function shouldShowUpdate(latestVersion: string): boolean {
  // Must be newer than current
  if (!isNewerVersion(APP_VERSION, latestVersion)) return false;

  // Check if user dismissed this exact version or a newer one
  const dismissed = getDismissedVersion();
  if (dismissed) {
    // If dismissed version >= latest, don't show
    if (compareSemver(dismissed, latestVersion) >= 0) return false;
  }

  return true;
}

// ─── Debug Logging (development only) ───────────────────────

export function logUpdateDebug(context: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[update-check:${context}]`, {
      currentVersion: APP_VERSION,
      ...data,
    });
  }
}
