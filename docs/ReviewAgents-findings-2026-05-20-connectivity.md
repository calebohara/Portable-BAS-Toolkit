# ReviewAgents Findings — Field Connectivity — 2026-05-20

**Agent:** Field Connectivity Reviewer
**Files reviewed:** 29
**LOC reviewed:** ~6,500

Reviewed:
- `src-tauri/src/main.rs` + `src-tauri/src/lib.rs` (full)
- `src-tauri/capabilities/default.json`, `Cargo.toml`, `tauri.conf.json`
- `src/lib/tauri-bridge.ts`
- `src/store/terminal-store.ts`, `src/store/web-interface-store.ts`
- `src/app/terminal/page.tsx` (+ `error.tsx`)
- `src/app/ping/page.tsx` (+ `error.tsx`)
- `src/app/web-interface/page.tsx` (+ `error.tsx`)
- `src/app/network-diagram/page.tsx` (+ `error.tsx`)
- `src/components/web-interface/embedded-workspace.tsx`, `endpoint-card.tsx`, `endpoint-edit-dialog.tsx`, `security-guidance.tsx`
- `src/components/network-diagram/canvas-node.tsx`, `connection-line.tsx`, `constants.ts`
- `src/components/dxrs/*.tsx` (all 6 components)
- `src/lib/hmi/ansi-parser.ts`, `types.ts`, `transports/serial-transport.ts`, `transports/telnet-transport.ts`
- `src/lib/dxr/analysis.ts`, `xlsx-parser.ts`

## Summary
| Priority | Count |
|----------|-------|
| P0 | 3 |
| P1 | 6 |
| P2 | 9 |
| P3 | 11 |

---

## P0 — Data loss / crash / security

### Proxy-rendered controller HTML can escape sandbox and execute in the host app
- **Location:** `src/components/web-interface/embedded-workspace.tsx:239-245` (proxy srcDoc iframe) + `src-tauri/src/lib.rs:716-775` (`proxy_fetch`)
- **Current behavior:** When a controller is reachable as HTTPS on a private network and the app is running under Tauri, the Rust `proxy_fetch` command downloads the HTML body (cert validation disabled) and the frontend renders it via `<iframe srcDoc={proxyHtml} sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />`. A `<base href={activeUrl}>` is also injected so relative URLs resolve back to the controller.
- **Why it's a bug:** `srcDoc` HTML inherits the parent document's origin, so combining `allow-same-origin` with `allow-scripts` effectively grants the injected page DOM/script access to the BAU Suite app's own origin. The CSP in `tauri.conf.json:26` already permits `script-src 'self' 'unsafe-inline'`, so an attacker-controlled controller (or a man-in-the-middle on the local network — cert checks are disabled) can run arbitrary JS in the host app's context. That means full read/write access to Zustand stores, IndexedDB (`bas-toolkit`), Supabase session tokens cached in storage, and the `__TAURI_INTERNALS__` invoke channel — which can call every registered Rust command. This is a complete app-level compromise from a single rogue BAS controller on the field network.
- **Suggested fix:** Drop `allow-same-origin` from the srcDoc iframe (the proxied path doesn't need it — there's no cross-origin XHR the controller content has to make). Alternatively, blob-URL the HTML so the iframe is loaded from a unique opaque origin instead of via `srcDoc`. Strip `<script>` tags and inline `on*=` handlers from the proxy response before injecting (defense in depth). Also consider scoping the proxy iframe's CSP via the `csp` attribute. Tighten the parent CSP `script-src` to remove `'unsafe-inline'` once feasible.

### `is_private_network` is a string prefix match, not an IP check — DNS rebinding / SSRF gate is bypassable
- **Location:** `src-tauri/src/lib.rs:703-714`
- **Current behavior:** `is_private_network(host)` checks `host.starts_with("10.") || host.starts_with("192.168.") || host.starts_with("127.") || host == "localhost" || (host.starts_with("172.") && ...)`. The `host` value comes from `reqwest::Url::parse(&url).host_str()`, which returns hostnames verbatim — it does not require an IP.
- **Why it's a bug:** Domains like `10.attacker.example`, `192.168.evil.com`, `127.attacker.tld` all pass the gate. Combined with `danger_accept_invalid_certs(true)` and reqwest's default redirect-follow (up to 10), an attacker who can control a single URL the app passes to `nativeProxyFetch` can make the desktop app fetch arbitrary internet/intranet hosts with cert validation off, then bounce the result back to the UI for srcDoc rendering. Together with the sandbox issue above, this is a full SSRF + RCE chain.
- **Suggested fix:** Parse `host` into an `IpAddr` (or use `url::Host`) before checking. Only accept hosts that are literal IPv4/IPv6 addresses in the documented private ranges; reject hostnames outright (controllers are addressed by IP on field networks). Add an explicit reqwest `redirect::Policy::none()` (or `limited(0)`) so the request can't be redirected out of the private range mid-flight. Re-validate the destination after each redirect if any are allowed.

### Telnet IAC parser drops or corrupts bytes that straddle a read boundary
- **Location:** `src-tauri/src/lib.rs:194-265` (`process_telnet_bytes`) called from `src-tauri/src/lib.rs:336-369` (read loop)
- **Current behavior:** When a TCP read returns a chunk that ends mid-IAC sequence — e.g. last byte is `IAC` (`0xFF`) alone, or `IAC WILL` with no option byte yet — the parser either falls into the `else { filtered.push(buf[i]); i += 1; }` branch (line 258-261) and pushes `0xFF` into the visible output, or hits one of the `break` arms (line 213, 222, 230, 235) and silently discards the partial sequence. The remaining bytes of the IAC command are NOT stashed across reads — every new `reader.read(...)` call starts parsing fresh.
- **Why it's a bug:** Telnet servers (Siemens PXC HMI, Niagara, Tridium) negotiate continuously and produce IAC sequences at arbitrary points in the stream. Under load — or when the OS hands us a short read at a TCP-segment boundary — the displayed terminal output will be corrupted with stray `ÿ` (`0xFF`) characters or missing negotiation responses, and the server's view of the negotiated options will drift from ours (e.g. server thinks we said `DONT ECHO` when we never received the `WILL ECHO`). For commissioning logs this is a P0 because the logs are attached to projects as evidence of device state — corrupted output isn't just a UX issue, it's a data-integrity issue.
- **Suggested fix:** Maintain a residue buffer (`Vec<u8>`) inside the per-session `TelnetConnection` (or local to the read task). Each call: prepend leftover bytes from the previous read, run the parser, and stash any incomplete IAC sequence at the end of the buffer back into the residue. Cover all four cases: bare `IAC`, `IAC WILL/WONT/DO/DONT` waiting for the option byte, `IAC SB ...` waiting for `IAC SE`, and a partial sub-negotiation payload. Add a regression test that feeds the parser one byte at a time and asserts the output matches the full-buffer call.

---

## P1 — Visible bugs

### Tauri-side telnet/serial connections leak when the user navigates away from the terminal page
- **Location:** `src/app/terminal/page.tsx:1338-1349`
- **Current behavior:** The unmount `useEffect` closes any `wsRef` WebSocket and unsubscribes Tauri event listeners. It does NOT call `nativeTelnetDisconnect` or `nativeSerialDisconnect` for any session that is still `connected`.
- **Why it's a bug:** On navigation away from `/terminal`, the React tree unmounts but the Rust `TelnetState`/`SerialState` HashMaps still hold the connection. The TCP socket / COM port stays open and the read task keeps running, emitting `telnet-data-${sid}` events to no listener. The user comes back later, the session ID is rehydrated from Zustand, and `nativeTelnetConnect` runs again — at line `src-tauri/src/lib.rs:371-374` (telnet) and `:579-582` (serial) the old `read_task` is aborted via `connections.remove(...)`, but the orphaned socket only closes on its next failed read. Meanwhile the panel may have refused a second connection from the same client IP, or the COM port (single-open device) refuses with `Access denied`. This is exactly the kind of "I disconnected, why can't I reconnect?" field bug.
- **Suggested fix:** In the unmount cleanup, iterate `sessions.filter(s => s.connectionState === 'connected' || s.connectionState === 'connecting')` and call the matching disconnect command (fire-and-forget; ignore errors). Same on `removeSession` calls. Optionally, on Tauri side, register a window-close handler that drains both state maps.

### `is_private_network` host check uses string prefixes — also misclassifies `127.x.y.z` style host components
- **Location:** `src-tauri/src/lib.rs:703-714`
- **Current behavior:** Same logic as the P0 entry above, but worth a separate handoff to the broader connectivity stack: `192.168.252.1` passes (intended), `192.168.1` also passes, `192.168abc.evil` does NOT pass (no dot), but `192.168.evil.com` DOES.
- **Why it's a bug:** Even setting aside the security angle in the P0, this means a typo'd hostname (e.g., from autocomplete) can silently be routed through the cert-skipping proxy. There's no log line saying "proxied with cert validation off", so the user has no signal.
- **Suggested fix:** Same as P0 — parse to `IpAddr`. Adding a log line whenever the proxy is invoked also helps field debugging.

### Reqwest proxy follows up to 10 redirects with no destination revalidation
- **Location:** `src-tauri/src/lib.rs:730-739`
- **Current behavior:** `reqwest::Client::builder().danger_accept_invalid_certs(true).timeout(15s).build()` — no explicit `redirect::Policy`. Default is `Policy::limited(10)`.
- **Why it's a bug:** A controller (or an attacker on the LAN) can issue a 302 redirect to any URL, including external internet hosts. The proxy will follow with cert checks off and return the body to the iframe, which is then rendered in `srcDoc` (see P0).
- **Suggested fix:** Set `.redirect(reqwest::redirect::Policy::none())`. If redirects are needed for real BAS UIs, write a custom policy that re-runs `is_private_network` against each hop's `Location` and rejects otherwise.

### Web `tryFetch` does not `clearTimeout` on the error path
- **Location:** `src/app/ping/page.tsx:39-59`
- **Current behavior:** A `setTimeout` arms `controller.abort()`. On success the timer is cleared. On error (catch block), the timer is NOT cleared.
- **Why it's a bug:** If the fetch fails fast (e.g., DNS error in 50ms), the abort timer still fires 5s later — calling `controller.abort()` on an already-finished request is a no-op, but each ping iteration leaks a pending timer for the timeout duration. Across a 100-ping repeated test against a dead host you accumulate ~100 timers and the abort callbacks each call `signal.dispatchEvent`. Low impact, but it's a textbook resource hygiene bug and worth a `finally { clearTimeout(timeout); }`.
- **Suggested fix:** Wrap in `try/finally` and `clearTimeout` in `finally`.

### Reconnect path can race with an outstanding `nativeTelnetConnect` if `handleConnect` was never awaited
- **Location:** `src/app/terminal/page.tsx:1235-1238`
- **Current behavior:** `handleReconnect` awaits `handleDisconnect()` then `handleConnect()`. `handleDisconnect` ignores errors from the native call and proceeds. If the user spams Reconnect, multiple connect attempts can pile up because `handleConnect` does not check the live `connectionState` before starting and does not guard against re-entry.
- **Why it's a bug:** If `nativeTelnetConnect` is in flight when a second one starts, both end up calling `connections.insert(sessionId, ...)` on the Rust side. The first inserts its task; the second `connections.remove(&sessionId)` aborts task #1 and inserts task #2 — but the listeners are attached BEFORE the connect call on the TS side, so task #1's events were briefly being received by listeners that are still wired up. Output from task #1 could be mixed into the buffer.
- **Suggested fix:** In `handleConnect`, early-return if `session.connectionState === 'connecting'`. In `handleReconnect`, set state to 'connecting' immediately to lock the button. Better: convert to a state-machine guard or use a `connectingRef`.

### `processIncomingData` flush timer can flush AFTER a disconnect/clear, re-injecting stale partial line
- **Location:** `src/app/terminal/page.tsx:934-998`
- **Current behavior:** When a chunk ends without a newline, a `setTimeout(...100)` is queued to flush the partial line. If the user clears the buffer or disconnects in those 100ms, the timer still fires and `appendLine` writes the partial line back into a fresh buffer.
- **Why it's a bug:** Clear+immediate-incoming-data ordering bug — the user sees stale text reappear after "Clear". `handleDisconnect` does call `flushLineBuffer` (line 1226) which clears the timer, but `clearBuffer` does not. Also, on `removeSession`, the timer map for that session is never cleared (`flushTimeoutRef.current.delete(sessionId)` only happens in the timer's own body or in `flushLineBuffer`).
- **Suggested fix:** In `clearBuffer` callbacks and `removeSession` flows, also clear/cancel the corresponding entry in `flushTimeoutRef.current` and `lineBufferRef.current` (call `flushLineBuffer` or a non-flushing reset). Have the timer callback double-check the session still exists and is not in a cleared state before appending.

---

## P2 — Inconsistencies

### Two parallel API surfaces for telnet/serial — `TelnetTransport`/`SerialTransport` classes are unused dead code
- **Location:** `src/lib/hmi/transports/telnet-transport.ts:1-69`, `src/lib/hmi/transports/serial-transport.ts:1-90`, `src/lib/hmi/types.ts:1-31`
- **Current behavior:** Two well-structured class wrappers exist, but a grep for `SerialTransport`/`TelnetTransport`/`'@/lib/hmi/transports'` returns zero importers outside the modules themselves. The whole `src/app/terminal/page.tsx` page hand-rolls the listener/cleanup logic at lines 1054-1146 instead of using these classes.
- **Why it's a bug:** Bloat (qualifies as P3) but also drift — the class has a different `ConnectionState` enum (`'idle' | 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'`) vs the store's enum (`'disconnected' | 'connecting' | 'connected' | 'error'`). If anyone re-wires the page to use these classes, they'll hit the mismatch.
- **Suggested fix:** Either delete the unused transports + `types.ts` (preferred — the page logic doesn't need them and they've drifted), or wire them in and delete the inline duplicates in the page. Don't keep both.

### TS sends `timeoutMs` to `telnet_connect` but Rust ignores it
- **Location:** `src/lib/tauri-bridge.ts:101-109` (TS) vs `src-tauri/src/lib.rs:267-275` (Rust signature)
- **Current behavior:** TS bridge accepts a `timeoutMs` arg (default 10000) and passes it as `{ sessionId, host, port, timeoutMs }` to invoke. The Rust command only takes `(sessionId, host, port)` and hardcodes `Duration::from_secs(15)` at line 277.
- **Why it's a bug:** Argument drift. Caller thinks they can control the timeout; they can't. The default in TS (10s) doesn't even match the actual Rust timeout (15s).
- **Suggested fix:** Either add `timeoutMs: Option<u64>` to the Rust command and use it, or remove `timeoutMs` from the TS bridge signature entirely.

### Serial port read holds `std::sync::Mutex` while `serial_send` waits to acquire it
- **Location:** `src-tauri/src/lib.rs:548-557` (read loop) vs `:615-619` (send)
- **Current behavior:** The serial port is wrapped in `Arc<std::sync::Mutex<Box<dyn SerialPort>>>`. The read task acquires the mutex inside `spawn_blocking`, calls `port.read(&mut buf)` with a 100ms timeout, releases, sleeps 10ms, repeats. `serial_send` also `spawn_blocking`s and tries to acquire the same mutex.
- **Why it's a bug:** Worst case, a send waits up to 100ms for the next read window. Not a deadlock — the read timeout guarantees release — but it adds jitter to interactive HMI typing. The 10ms `tokio::time::sleep` between reads also bottlenecks high-baud-rate data (115200 baud delivers ~11.5 KB/s; a 4 KB buffer fills in ~350ms, so the 10ms sleep is harmless at this rate, but it would matter at higher rates).
- **Suggested fix:** Use a `tokio::sync::Mutex` (async-aware) or a channel-based architecture (a single owner task driving the serial port, with sends queued via mpsc). Smaller fix: drop the 10ms sleep — the 100ms read timeout already throttles the loop.

### `process_telnet_bytes` corrupts on incomplete subnegotiation (`IAC SB ... IAC SE`) split across reads
- **Location:** `src-tauri/src/lib.rs:238-248`
- **Current behavior:** SB skip loop: `i += 2; while i < n { if buf[i] == IAC && i + 1 < n && buf[i + 1] == SE { ... break; } i += 1; }`. If the chunk ends before the closing `IAC SE`, the loop just exits with `i == n` and the next read starts a fresh parse.
- **Why it's a bug:** Same root cause as the P0 IAC handler — sub-negotiations (e.g., terminal type, window size) that span TCP segment boundaries are silently truncated, and the bytes after the closing `IAC SE` end up parsed as display data.
- **Suggested fix:** Fold this into the P0 fix — track residue across reads and continue sub-negotiation skipping where it left off.

### `is_private_network` blocks IPv6 entirely; `check_port`/`telnet_connect` only accept hosts parseable as `SocketAddr`
- **Location:** `src-tauri/src/lib.rs:704-714` (no IPv6 case), `:137-138` (`addr.parse::<SocketAddr>()`), `:280-281` (same)
- **Current behavior:** Host validation chars include `:` so IPv6 isn't rejected upfront, but `format!("{}:{}", host, port)` yields ambiguous strings like `"::1:23"` that don't parse as `SocketAddr`. The check immediately errors with "Invalid address: ::1:23".
- **Why it's a bug:** Inconsistency — UI hints at IPv6 acceptance, runtime rejects it. Also `is_private_network` doesn't recognize `::1`/`fc00::/7` as private.
- **Suggested fix:** If IPv6 is in scope: build addresses via `format!("[{}]:{}", host, port)` when `host` contains `:`, parse with `SocketAddr::from_str`, and add IPv6 private-range checks. If out of scope: reject `:` in the host validator outright and document.

### Active duplicate-key collision in ping result map when port is undefined
- **Location:** `src/app/ping/page.tsx:369`, `:455`, `:698-700`, `:709`, `:717`
- **Current behavior:** `resultKey = \`${target.host}:${target.port}\`` — when `target.port` is `undefined`, key becomes `"host:undefined"`. Two distinct targets `{host: 'X'}` and `{host: 'X', port: undefined}` collide; same when adding the same host twice.
- **Why it's a bug:** Adding the same host with no port twice (e.g., for parallel pings of the same target in `multi` mode) collapses results into one row.
- **Suggested fix:** Generate a stable per-target ID at row creation (`crypto.randomUUID()` stored on the `PingTarget`) and key results by that ID.

### IDB transaction is not used by this slice — but `lastKnownEmbedSupport` is written via `updateEndpoint` without a SyncManager hook
- **Location:** `src/components/web-interface/embedded-workspace.tsx:50`, `:60`, `:259`, `:273`
- **Current behavior:** Direct calls to `updateEndpoint(activeEndpointId, { lastKnownEmbedSupport: ... })`. Endpoints are stored in `bau-suite-web-interface` Zustand persist, not in IDB / Supabase. So no SyncManager violation.
- **Why it's a bug:** Worth flagging because the rest of the codebase routes mutations through SyncManager for entities that are remote-synced. If endpoints are ever promoted to project-scoped sync entities, this code will need to switch over.
- **Suggested fix:** N/A today. Add a code comment noting endpoints are local-only.
- **Handoff to:** Sync / Persistence reviewer

### `telnet_disconnect` `try_lock` fails silently if writer is held; shutdown skipped
- **Location:** `src-tauri/src/lib.rs:442-449`
- **Current behavior:** `if let Ok(mut w) = conn.writer.try_lock() { let _ = w.shutdown().await; }`. If the read task happens to hold the writer to send a negotiation response at the same moment, try_lock fails and shutdown is skipped. The socket still closes when the Arc refcount hits zero, but ungracefully (no FIN).
- **Why it's a bug:** Some panels react badly to dropped-without-FIN connections — they may keep the session "open" server-side until a TCP keepalive times out, blocking the next reconnect (especially Tridium Niagara).
- **Suggested fix:** Use `.lock().await` instead of `try_lock()`. The read task only holds the writer briefly while writing negotiation bytes, so the wait is bounded.

### `EmbedSupport` field type allows three values but UI handles only two consistently
- **Location:** `src/store/web-interface-store.ts:9` (`'unknown' | 'supported' | 'blocked'`) vs `src/components/web-interface/endpoint-card.tsx:29-34`
- **Current behavior:** Card shows a "ext only" badge for `'blocked'`, "embed ok" for `'supported'`, nothing for `'unknown'`. The proxy success path writes `'supported'`; iframe `onError` writes `'blocked'`. The `'cert-issue'` path does NOT write `'blocked'`, so cards stay `'unknown'` after the user hits cert issues.
- **Why it's a bug:** Inconsistent state labelling — repeated cert failures should be persisted so the user knows next time to choose 'New Tab'.
- **Suggested fix:** When `embedState` transitions to `'cert-issue'`, write `lastKnownEmbedSupport: 'blocked'` (or add a `'cert-issue'` variant). Pick one.

---

## P3 — Bloat / dead code / polish

### Outer `let mut buf = [0u8; 4096]` in serial read task is functionally dead
- **Location:** `src-tauri/src/lib.rs:544`
- **Current behavior:** `buf` is declared in the outer task, then moved into the inner `spawn_blocking` closure each iteration. Because `[u8; 4096]` is `Copy`, each iteration copies a fresh `buf` into the closure; the outer one is never read or modified. The variable exists only to satisfy the closure's capture.
- **Why it's a bug:** Confusing for future maintainers — looks like a shared buffer; isn't.
- **Suggested fix:** Move the `let mut buf = [0u8; 4096];` INSIDE the spawn_blocking closure to make ownership obvious.

### Unused transport classes (see P2) and `src/lib/hmi/types.ts`
- **Location:** `src/lib/hmi/transports/serial-transport.ts`, `src/lib/hmi/transports/telnet-transport.ts`, `src/lib/hmi/types.ts`
- **Current behavior:** Zero imports outside the slice.
- **Suggested fix:** Delete.

### `isValidHost` blocks IPv6 brackets `[` `]` — IPv6 hosts can never be saved as web endpoints
- **Location:** `src/store/web-interface-store.ts:76`
- **Current behavior:** Regex `/[<>"'\`{}|\\^~\[\]]/` includes `[` and `]`, so `[2001:db8::1]` fails validation.
- **Why it's a bug:** Drift with the Rust proxy/check_port which conceptually allow `:` in host. Either both support IPv6 or neither does.
- **Suggested fix:** Pick one path. If IPv6 is in scope, allow brackets in `isValidHost` and add IPv6 detection. If not, document the limitation.

### `parseTtl` / `parseRtt` case-fold inputs but ping output is already ASCII; lowercasing the whole stdout each iteration is wasteful
- **Location:** `src-tauri/src/lib.rs:89-111`
- **Current behavior:** `output.to_lowercase()` allocates a new String per ping call.
- **Suggested fix:** Match against the known patterns case-sensitively (`"TTL="`, `"ttl="`, `"time="`, `"time<1ms"`) using `find` with both. Or do a single pass via regex.

### `nativeIcmpPing` accepts `count` up to `u32::MAX` from frontend with no upper bound; UI always sends 1
- **Location:** `src-tauri/src/lib.rs:24-87`
- **Current behavior:** Loop runs `count` times with no cancellation. Frontend always passes `1` (`src/app/ping/page.tsx:145`).
- **Suggested fix:** Clamp `count` to a sane max (e.g. 100) in the Rust command.

### `nativeProxyFetch` returns `body` as `text()` regardless of charset; binary payloads encoded with custom base64
- **Location:** `src-tauri/src/lib.rs:754-792` + frontend `src/components/web-interface/embedded-workspace.tsx:38-62`
- **Current behavior:** Custom `base64_encode` reimplemented to avoid a dependency. Frontend only consumes the text path; binary path's base64 body is never displayed.
- **Suggested fix:** Either remove the binary path (since it's never used) or use `base64::engine::general_purpose::STANDARD.encode` from the existing `base64` crate (added transitively via reqwest). The 14-line custom encoder is unnecessary.

### `unused import `use serde::ser::Error;` inside `proxy_fetch`
- **Location:** `src-tauri/src/lib.rs:766`
- **Current behavior:** Inside the `else` branch (binary path), `use serde::ser::Error;` is imported but never referenced. Likely a left-over from an earlier draft.
- **Suggested fix:** Delete the `use` line. Should produce a clippy warning.

### Tauri command argument naming uses camelCase via `#[allow(non_snake_case)]` — fights Rust conventions for no functional reason
- **Location:** `src-tauri/src/lib.rs:23, 124, 268, 387, 415, 436, 496, 595, 625, 648`
- **Current behavior:** Every command marks `#[allow(non_snake_case)]` and uses `sessionId`, `portName`, `baudRate`, etc.
- **Why it's a bug:** Tauri's invoke serializer accepts snake_case JS payloads transparently. Could change frontend to send `session_id` and drop the lint allowances.
- **Suggested fix:** Optional. If you want Rust idioms, convert. Otherwise document in `tauri-bridge.ts` why the lint is suppressed.

### `check_port`'s spawn_blocking task is not aborted if the caller is dropped
- **Location:** `src-tauri/src/lib.rs:140-145`
- **Current behavior:** No abort handle stored. If the user reloads the page mid-port-check, the blocking task runs until OS connect_timeout (up to user-supplied timeout).
- **Why it's a bug:** Briefly wastes a thread from the blocking pool. Bounded so non-critical.
- **Suggested fix:** Live with it. Or use `tokio::select!` with a cancellation token if you want to be tidy.

### `handleExport` (terminal) and `handleExport` (ping) duplicate the URL.createObjectURL + setTimeout-revoke + sanitizeFilename dance
- **Location:** `src/app/terminal/page.tsx:1325-1335` and `src/app/ping/page.tsx:484-491` and `src/app/web-interface/page.tsx:141-148` and `src/app/network-diagram/page.tsx:309-339` (PNG/SVG export)
- **Why it's a bug:** Same boilerplate four times. A util like `downloadBlob(content, filename, mime)` would shrink each call site to one line.
- **Suggested fix:** Add a small helper to `src/lib/utils.ts` (if it doesn't already exist) and switch each site over.

### `SIEMENS_PRESETS` quick-connect button only fills host/protocol — doesn't carry `accessMethod` over to subsequent save dialog
- **Location:** `src/app/web-interface/page.tsx:181-186`
- **Current behavior:** Clicking a preset sets `host`/`protocol`/`port`/`path` but ignores `preset.accessMethod`. When the user clicks Save, the access-method field on the form starts blank.
- **Suggested fix:** Add `accessMethod` to the React state for the launch form, set it from the preset, and pass it through `handleSaveFromForm` to the `saveFrom` object.

---

## Handoffs (issues found outside your slice)

- **Sync / Persistence:** Endpoint state (`lastKnownEmbedSupport`) is mutated directly on the client via Zustand persist (see P2 "EmbedSupport"). If endpoints ever become syncable entities, this needs to route through SyncManager. — `src/components/web-interface/embedded-workspace.tsx:50, 60, 259, 273`
- **Security / CSP:** Parent app CSP includes `script-src 'self' 'unsafe-inline'`. Combined with the proxy srcDoc P0, tightening this would mitigate even if the sandbox fix lags. — `src-tauri/tauri.conf.json:26`
- **Routing / SPA Fallback:** `resolve_spa_route` is registered but never invoked from the frontend (the JS injection at lib.rs:818-865 is invoked instead). If the command is dead code, remove it. — `src-tauri/src/lib.rs:666-686`, `:872`
