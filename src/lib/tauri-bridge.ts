/**
 * Tauri Bridge — Detects desktop vs browser mode and provides
 * native command wrappers with automatic browser fallback.
 */

// ─── Runtime Detection ──────────────────────────────────────
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Types ──────────────────────────────────────────────────
export interface NativePingResult {
  host: string;
  reachable: boolean;
  response_time_ms: number | null;
  ttl: number | null;
  error: string | null;
  method: string;
}

export interface NativePortCheckResult {
  host: string;
  port: number;
  open: boolean;
  response_time_ms: number;
  error: string | null;
}

// ─── Lazy-loaded Tauri invoke ───────────────────────────────
let invokeCache: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getInvoke() {
  if (invokeCache) return invokeCache;
  const { invoke } = await import('@tauri-apps/api/core');
  invokeCache = invoke;
  return invoke;
}

// ─── Shell Open (external URLs, mailto, etc.) ─────────────
let shellOpenCache: ((url: string) => Promise<void>) | null = null;

async function getShellOpen() {
  if (shellOpenCache) return shellOpenCache;
  const { open } = await import('@tauri-apps/plugin-shell');
  shellOpenCache = open;
  return open;
}

/**
 * Open a URL externally (browser, email client, etc.).
 * In Tauri, uses the shell plugin; in browser, falls back to window.open.
 */
export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const open = await getShellOpen();
    await open(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ─── Native ICMP Ping ──────────────────────────────────────
export async function nativeIcmpPing(
  host: string,
  count: number = 4,
  timeoutMs: number = 5000
): Promise<NativePingResult[]> {
  const invoke = await getInvoke();
  return invoke('icmp_ping', { host, count, timeoutMs }) as Promise<NativePingResult[]>;
}

// ─── Native TCP Port Check ─────────────────────────────────
export async function nativeCheckPort(
  host: string,
  port: number,
  timeoutMs: number = 3000
): Promise<NativePortCheckResult> {
  const invoke = await getInvoke();
  return invoke('check_port', { host, port, timeoutMs }) as Promise<NativePortCheckResult>;
}
