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

// ─── Native Telnet TCP Connection ─────────────────────────
export async function nativeTelnetConnect(
  sessionId: string,
  host: string,
  port: number,
): Promise<void> {
  const invoke = await getInvoke();
  await invoke('telnet_connect', { sessionId, host, port });
}

export async function nativeTelnetSend(
  sessionId: string,
  data: string,
): Promise<void> {
  const invoke = await getInvoke();
  await invoke('telnet_send', { sessionId, data });
}

export async function nativeTelnetDisconnect(
  sessionId: string,
): Promise<void> {
  const invoke = await getInvoke();
  await invoke('telnet_disconnect', { sessionId });
}

// ─── Tauri Event Listener ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listenCache: ((event: string, handler: (event: any) => void) => Promise<() => void>) | null = null;

async function getListen() {
  if (listenCache) return listenCache;
  const { listen } = await import('@tauri-apps/api/event');
  listenCache = listen;
  return listen;
}

export async function onTelnetData(
  sessionId: string,
  handler: (data: string) => void,
): Promise<() => void> {
  const listen = await getListen();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return listen(`telnet-data-${sessionId}`, (event: any) => handler(event.payload as string));
}

export async function onTelnetClosed(
  sessionId: string,
  handler: () => void,
): Promise<() => void> {
  const listen = await getListen();
  return listen(`telnet-closed-${sessionId}`, () => handler());
}

export async function onTelnetError(
  sessionId: string,
  handler: (error: string) => void,
): Promise<() => void> {
  const listen = await getListen();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return listen(`telnet-error-${sessionId}`, (event: any) => handler(event.payload as string));
}
