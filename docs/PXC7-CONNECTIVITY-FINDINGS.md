# PXC7 Connectivity & Networking Findings

**Document Type:** Technical Audit Report
**Date:** 2026-03-18
**Scope:** Siemens Desigo PXC7 web access integration into BAU Suite
**Audience:** Development team, BAS integration engineers

---

## Table of Contents

1. [Desktop App vs Web Browser Runtime — Connectivity Truth](#1-desktop-app-vs-web-browser-runtime--connectivity-truth)
2. [Runtime Recommendation](#2-runtime-recommendation)
3. [Self-Signed Certificate Deep Dive](#3-self-signed-certificate-deep-dive)
4. [Network Topology Scenarios](#4-network-topology-scenarios)
5. [Connection Failure Catalog](#5-connection-failure-catalog)
6. [Final Recommendation](#6-final-recommendation)

---

## 1. Desktop App vs Web Browser Runtime — Connectivity Truth

### 1.1 Desktop App (Tauri / WebView2 on Windows)

| Question | Answer | Evidence |
|----------|--------|----------|
| Can WebView2 handle self-signed certificates? | **Partially.** WebView2 inherits Chromium cert handling and will reject self-signed certs by default. Tauri does not expose a native certificate bypass API. However, BAU Suite implements a Rust `proxy_fetch` command that uses `reqwest` with `danger_accept_invalid_certs(true)` to proxy HTTP/HTTPS requests through the Rust backend for private network addresses. | `src-tauri/src/lib.rs` lines 644-748: `proxy_fetch` command with `is_private_network()` guard |
| Can an iframe in WebView2 load a self-signed HTTPS page? | **No.** Same browser security model applies — WebView2 will block the iframe load with `ERR_CERT_AUTHORITY_INVALID`. The proxy approach returns HTML content which can be rendered via `srcdoc` attribute, bypassing the cert check entirely. | CSP in `tauri.conf.json` allows `frame-src blob: http: https:` but the TLS handshake still fails in the iframe context |
| Can the desktop app open the controller UI in a separate native window? | **Yes, technically possible.** Tauri v2 supports `WebviewWindow::builder()` to create additional windows. Not currently implemented in BAU Suite but architecturally feasible. | `src-tauri/src/lib.rs` app setup uses single `main` window; Tauri v2 API supports multi-window |
| Can `shell:open` launch the system browser to the controller URL? | **Yes.** The `shell:allow-open` permission is configured and `openUrl()` in the tauri-bridge already wraps this with protocol validation. | `src-tauri/capabilities/default.json` line 8: `"shell:allow-open"`. `src/lib/tauri-bridge.ts` lines 53-76: `openUrl()` with protocol whitelist (`http:`, `https:`, `mailto:`, `blob:`) |

**Current Implementation State:**
- `proxy_fetch` (Rust): Fully implemented. Accepts any private network URL, builds an `reqwest` client with `danger_accept_invalid_certs(true)`, returns `ProxyResponse { status, content_type, body, is_binary }`. Binary content is base64-encoded.
- `nativeProxyFetch` (TypeScript): Fully implemented in `src/lib/tauri-bridge.ts` as the frontend wrapper.
- Web Interface page (`src/app/web-interface/page.tsx`): Fully implemented with endpoint management, proxy embedding via srcdoc, and fallback to external browser.
- `openUrl`: Fully implemented with protocol validation.
- Separate Tauri window: **Not implemented.** Would require new Rust code.

### 1.2 Web Browser (Chrome / Firefox / Safari / Edge)

| Question | Answer | Reason |
|----------|--------|--------|
| Can an iframe embed a self-signed HTTPS controller page? | **No.** The browser terminates the TLS handshake before loading iframe content. There is no mechanism to accept a cert warning inside an iframe — only top-level navigations show the interstitial. | Browser security model: iframe cert errors produce `ERR_CERT_AUTHORITY_INVALID` with no user bypass |
| Can an iframe embed an HTTP controller page from an HTTPS app? | **No.** Mixed active content is blocked by all modern browsers. An HTTPS page cannot load HTTP resources in iframes, XHR, fetch, or WebSocket. | Mixed content policy: active mixed content blocked since Chrome 80, Firefox 72, Safari 14 |
| Can opening in a new tab work? | **Yes.** User navigates to the controller URL in a new tab, accepts the cert warning once per session, and the controller UI loads normally. | Standard browser cert interstitial flow — user clicks "Advanced" then "Proceed" |
| Is there any way to embed reliably? | **No.** Cross-origin embedding of BAS controller UIs is fundamentally blocked by three independent mechanisms: (1) self-signed cert rejection in iframes, (2) mixed content policy, (3) controllers typically set `X-Frame-Options: DENY` or `SAMEORIGIN`. | Even if certs were valid and protocol matched, X-Frame-Options would still block |

**Summary:** The web browser runtime has **zero viable embedding paths** for typical BAS controller web UIs. The only reliable access method is opening the controller URL in a new tab/window.

---

## 2. Runtime Recommendation

### 2.1 Desktop App (Tauri) — Four Options Evaluated

#### OPTION A: Rust Proxy (`proxy_fetch`) with `srcdoc` Iframe

**How it works:** The Rust backend fetches the controller page HTML, bypassing cert validation. The frontend renders the HTML in an iframe using the `srcdoc` attribute, avoiding cross-origin restrictions entirely.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Seamless in-app embedding; no cert warnings; no user action required; works with self-signed certs; already implemented and tested |
| **Cons** | Relative resource loading breaks (CSS, JS, images that use relative paths resolve against the app origin, not the controller); interactive elements that depend on the controller's session/cookies will not work; forms POST to the app origin instead of the controller; WebSocket connections from embedded JS will fail; JavaScript-heavy SPAs will not function |
| **Best for** | Simple HTML status pages, read-only dashboards, controllers that render fully server-side with inline styles |
| **Breaks for** | Modern controller UIs (React/Angular SPAs), pages with extensive JS, pages requiring authentication cookies, real-time data via WebSocket |

**Current proxy_fetch limitations (from codebase analysis):**
- GET-only: The Rust command only performs `client.get(&url)`. No POST, PUT, or cookie forwarding.
- Single-page: Does not rewrite relative URLs in the returned HTML. A `<link href="/style.css">` in srcdoc will attempt to load from the Tauri app origin.
- No session: No cookie jar. Each request is stateless. Authenticated controller pages will redirect to login.
- Private network only: `is_private_network()` restricts to RFC 1918 + localhost ranges — correct security boundary.

#### OPTION B: Separate Tauri Webview Window

**How it works:** Create a new Tauri webview window pointed at the controller URL. The webview handles its own TLS and navigation independently.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Full controller UI functionality; native window with OS chrome; controller JS/CSS/WebSocket all work; user can interact naturally; proper session/cookie handling |
| **Cons** | User leaves the main BAU Suite window (context switch); cert warning still appears in the new webview (WebView2 will show `ERR_CERT_AUTHORITY_INVALID`); requires new Rust code to create windows; window lifecycle management complexity |
| **Best for** | N/A — the cert problem follows the webview |
| **Verdict** | **Not recommended as primary.** A separate webview window still hits the same self-signed cert wall as an iframe. WebView2 does not expose a per-webview cert bypass API in Tauri v2. |

#### OPTION C: System Browser via `shell:open`

**How it works:** Launch the controller URL in the user's default system browser (Chrome, Edge, Firefox). User accepts the cert warning once, then interacts with the full controller UI.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Always works; full controller functionality; user can accept certs via browser interstitial; browser remembers cert exceptions; zero implementation needed (already implemented via `openUrl()`); no resource loading issues |
| **Cons** | User leaves BAU Suite entirely; loses app context; no way to track what happens in the external browser; user must manually return to BAU Suite |
| **Best for** | All controller UIs, all cert configurations, all network topologies |
| **Breaks for** | Nothing — this is the universal fallback |

#### OPTION D: Hybrid (Proxy First, External Fallback)

**How it works:** Attempt `proxy_fetch` first. If the returned HTML is a simple page (heuristic: small page size, no `<script>` tags, inline styles only), render via srcdoc. If the page is complex (large, JS-heavy, SPA framework detected), fall back to `shell:open`.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Best of both worlds for simple status pages; graceful degradation; user stays in-app when possible |
| **Cons** | Heuristic detection is fragile; false positives embed broken UIs; complexity in determining "simple" vs "complex"; user experience inconsistency |
| **Best for** | The current implementation direction — the web-interface page already has this pattern |
| **Enhancement needed** | Add complexity heuristics: page size threshold, script tag count, framework detection (React root, Angular app-root, Vue #app) |

### 2.2 Web App (Browser) — Two Options Evaluated

#### OPTION A: Open in New Tab

**How it works:** `window.open(controllerUrl, '_blank')` or anchor with `target="_blank"`.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Always works; user can accept cert warnings; full controller UI; no embedding restrictions |
| **Cons** | User leaves the BAU Suite tab; popup blockers may interfere; no way to track or manage the opened tab |
| **Best for** | All scenarios |

#### OPTION B: Smart Launcher with Session Tracking

**How it works:** BAU Suite stores endpoint metadata (IP, port, protocol, friendly name, project association, last access time). The web-interface page provides a rich launcher UI with endpoint management, connection history, and one-click open. After opening in a new tab, the app records the access event.

| Dimension | Assessment |
|-----------|------------|
| **Pros** | Organized endpoint management; connection history; project association; quick access to frequently used controllers; metadata persists across sessions |
| **Cons** | Still opens in a new tab (no embedding); initial setup overhead for saving endpoints |
| **Best for** | Field techs managing multiple controllers across projects |
| **Already implemented** | Yes — `src/app/web-interface/page.tsx` and `src/store/web-interface-store.ts` provide full endpoint CRUD, favorites, recent connections, project association, and open mode selection |

---

## 3. Self-Signed Certificate Deep Dive

### 3.1 PXC7 Default Certificate Behavior

Based on research from Siemens documentation and general Desigo platform behavior:

| Property | Value / Behavior | Confidence |
|----------|-----------------|------------|
| **HTTPS support** | Yes — PXC7 includes IT security featuring HTTPS per IEC-62443 4-2 Security Level 2 | HIGH (confirmed in Siemens product documentation) |
| **Default cert type** | Self-signed certificate generated during initial commissioning | HIGH (standard Siemens controller behavior; documented in Desigo CC commissioning guides) |
| **Cert CN/SAN** | Typically set to the controller's hostname or IP address at commissioning time | MEDIUM (follows Siemens convention; exact PXC7 behavior may vary by firmware) |
| **Can cert be replaced?** | Yes — Siemens documents a procedure for importing custom certificates. The system owner is responsible for maintaining certificate validity when using custom certs. | HIGH (documented in Desigo CC engineering help) |
| **HTTP (port 80) behavior** | Typically redirects to HTTPS (port 443). Some firmware versions may serve HTTP directly during initial setup/commissioning mode. | MEDIUM (common pattern across Desigo platform; PXC7-specific redirect behavior depends on firmware version) |
| **HTTPS (port 443) behavior** | Primary web interface access. Self-signed cert causes browser warning on first access. | HIGH |
| **Cert chain** | Single self-signed cert — no intermediate CA. Issuer = Subject (self-issued). | HIGH (standard for embedded controller certs) |
| **Cert lifetime** | Typically 10+ years (common for embedded systems that cannot easily rotate certs) | MEDIUM (varies by firmware generation) |
| **BACnet/SC certificates** | Separate from web interface certs. BACnet Secure Connect uses its own certificate infrastructure per ASHRAE 135-2020. | HIGH |

### 3.2 Certificate Trust Scenarios

| Scenario | Browser Behavior | Workaround |
|----------|-----------------|------------|
| First visit, self-signed cert | Browser shows `ERR_CERT_AUTHORITY_INVALID` interstitial | User clicks Advanced > Proceed (cert exception stored per browser session) |
| Return visit, same browser | If cert exception was saved: loads normally. If session expired: warning again. | Chrome remembers for the session; Firefox can save permanent exceptions |
| Cert replaced with trusted CA cert | No warning — loads normally | Preferred for permanent installations. Requires PKI infrastructure or Let's Encrypt (if DNS-resolvable). |
| Cert expired | Browser shows `ERR_CERT_DATE_INVALID` | Replace cert on controller or accept browser exception |
| Cert hostname mismatch | Browser shows `ERR_CERT_COMMON_NAME_INVALID` | Access via the hostname/IP that matches the cert CN, or replace cert |

### 3.3 Implications for BAU Suite

- **Desktop (Tauri):** The `proxy_fetch` Rust command bypasses all cert validation for private network addresses. This is the correct approach — field techs should not be blocked by self-signed certs on local controllers.
- **Web (Browser):** No programmatic cert bypass is possible. The user must accept the browser warning manually for each controller. This is a one-time action per browser session.
- **Security boundary:** The `is_private_network()` guard in `proxy_fetch` ensures cert bypass only applies to RFC 1918 addresses. Public internet addresses always require valid certificates.

### 3.4 Research Sources

- [Siemens Desigo PXC Controller Portfolio](https://assets.new.siemens.com/siemens/assets/api/uuid:0769a609-d8a1-4d01-a26e-e22bd617b0ce/desigoautomation-pxc-controller-brochure.pdf)
- [Siemens PXC7 Owner's Manual](https://manuals.plus/siemens/pxc7-e400m-automation-stations-manual)
- [Desigo BACnet PICS — PXC7](https://bacnetinternational.net/catalog/manu/siemens/PICS_Siemens_DESIGO_PXC7_4_5.pdf)
- [Siemens Web Server Security Certificates (S7-1200 reference)](https://docs.tia.siemens.cloud/r/simatic_s7_1200_manual_collection_enus_20/web-server/web-server-security-certificates)
- [Siemens Digital Grid — Trusting Self-Signed Certificates](https://support.industry.siemens.com/cs/attachments/109759179/Certificate-Trusting-in-Browsers.pdf)

---

## 4. Network Topology Scenarios

### Scenario 1: Direct Laptop Connection (Tool Port)

**Setup:** Tech plugs laptop Ethernet directly into the PXC7's service/tool port. No switches, no routing.

| Property | Detail |
|----------|--------|
| **IP addressing** | Static assignment required. Controller typically at `192.168.1.1` or `10.0.0.1` (factory default). Tech sets laptop to same subnet (e.g., `192.168.1.100/24`). |
| **DNS** | None. IP address only. |
| **Routing** | None needed. Point-to-point link. |
| **Firewall** | None between tech and controller. Windows Firewall on the laptop may still block outbound connections — BAU Suite needs firewall exception. |
| **What works** | Everything: ping, port check, web UI access, telnet, BACnet/IP. Lowest latency, most reliable. |
| **What breaks** | Nothing — this is the ideal connectivity scenario. Only issue: laptop loses internet access while plugged into the isolated controller network. |
| **User needs to know** | Set a static IP on the correct adapter. Disable Wi-Fi if it causes routing conflicts. Controller IP is in the commissioning documentation or printed on the controller label. |

### Scenario 2: Controller Wi-Fi Service Access Point

**Setup:** PXC7 (or a connected wireless AP) broadcasts a service SSID. Tech connects laptop Wi-Fi to this network.

| Property | Detail |
|----------|--------|
| **IP addressing** | DHCP from controller/AP, or static. Subnet is controller-defined. |
| **DNS** | Typically none. Use IP address. Some setups may have mDNS. |
| **Routing** | Single subnet, no routing. |
| **Firewall** | Minimal — service network is typically unfiltered. |
| **What works** | Web UI, BACnet/IP, BAU Suite tools. Slightly higher latency than wired. |
| **What breaks** | Wi-Fi signal quality in mechanical rooms can be poor. Thick walls, metal cabinets, and electrical interference degrade connectivity. Connection drops are more common than wired. |
| **User needs to know** | Connect to the correct SSID (often labeled on the controller or in commissioning docs). Signal strength matters — stay close to the AP. If connection is unstable, fall back to wired tool port. |

### Scenario 3: Building LAN (Same VLAN)

**Setup:** Controller on the building's OT network. Tech's laptop on the same VLAN, typically via a wall jack or network switch in the mechanical room.

| Property | Detail |
|----------|--------|
| **IP addressing** | DHCP from building network, or static per site policy. |
| **DNS** | Building DNS may resolve controller hostnames. May also need IP-only access. |
| **Routing** | Same subnet — no routing. Switching only. |
| **Firewall** | Building network switches may have ACLs. Port-level security (802.1X) may require MAC registration. |
| **What works** | Full connectivity if network policy allows. Fastest path for multi-controller access (all on same VLAN). |
| **What breaks** | 802.1X port authentication — unregistered laptops may be quarantined. DHCP exhaustion if pool is small. Managed switches may block unknown MAC addresses. |
| **User needs to know** | Get IT clearance before connecting. May need MAC address registered. Ask for the OT VLAN number and whether 802.1X is enforced. Have a static IP fallback ready if DHCP fails. |

### Scenario 4: Remote / VPN Access

**Setup:** Tech connects to building network via VPN (site-to-site or client VPN). Accessing controllers from off-site.

| Property | Detail |
|----------|--------|
| **IP addressing** | VPN assigns IP in remote subnet. Controller accessible via routed VPN tunnel. |
| **DNS** | VPN may push DNS settings for the building network. Split-tunnel configurations may only resolve building hostnames over VPN. |
| **Routing** | Multi-hop: laptop → VPN gateway → building router → OT VLAN → controller. |
| **Firewall** | VPN gateway firewall rules. Building firewall between IT and OT. Controller subnet ACLs. Multiple firewall traversals. |
| **What works** | Web UI access (HTTP/HTTPS through VPN tunnel). BACnet/IP if firewall rules allow UDP 47808. |
| **What breaks** | High latency (100-500ms+ depending on VPN). BACnet/IP broadcast discovery does not traverse routers. Telnet connections may timeout. Large page loads are slow. VPN disconnections interrupt sessions. Some VPN configurations block non-HTTP traffic. |
| **User needs to know** | VPN must be connected and stable. Know the controller's IP address (no broadcast discovery). Expect higher latency. If VPN uses split tunneling, controller traffic may not route through the tunnel — check with IT. Some sites require 2FA for VPN, which may timeout during extended sessions. |

### Scenario 5: Segmented Network (OT/IT VLAN Separation)

**Setup:** Controller on OT VLAN (e.g., VLAN 100, `10.100.x.x`). Tech on IT VLAN (e.g., VLAN 200, `10.200.x.x`). Firewall between VLANs.

| Property | Detail |
|----------|--------|
| **IP addressing** | Different subnets. Routing required between VLANs. |
| **DNS** | IT DNS may not resolve OT hostnames. OT DNS may be separate. |
| **Routing** | Inter-VLAN routing through L3 switch or firewall. |
| **Firewall** | OT/IT firewall typically restricts traffic to specific ports: HTTPS (443), possibly HTTP (80), BACnet/IP (47808). All other ports blocked by default. ICMP may be blocked (ping fails but web UI works). |
| **What works** | HTTPS web UI access if firewall rule exists for port 443 from IT to OT VLAN. BAU Suite `proxy_fetch` works if the Rust backend can reach the controller IP (application-level; not blocked by browser CORS). |
| **What breaks** | ICMP ping blocked by firewall (BAU Suite ping tool shows unreachable even though web UI works). Telnet blocked (firewall does not allow arbitrary TCP). BACnet/IP UDP blocked. Port scan shows all ports closed even though HTTPS works (firewall drops non-whitelisted ports). |
| **User needs to know** | Request a firewall rule for laptop IP → controller IP on port 443 (and optionally 80, 47808). If ping fails but browser works, the firewall is allowing HTTPS but blocking ICMP — this is normal. Use the TCP port check tool (port 443) instead of ICMP ping to verify connectivity. Know both the controller IP and the firewall rule status before starting work. |

---

## 5. Connection Failure Catalog

### Failure 1: Wrong IP / Wrong Subnet

| Property | Detail |
|----------|--------|
| **Symptoms** | Connection timeout. No response from ping or port check. Browser shows "This site can't be reached." |
| **Detection method** | BAU Suite TCP port check returns timeout after full duration (3-5 seconds). ICMP ping returns "Destination host unreachable" or 100% loss. |
| **User-facing error** | "Connection to {ip}:{port} timed out. The device may be unreachable or the IP address may be incorrect." |
| **Remediation** | 1. Verify controller IP from commissioning docs or controller display. 2. Check laptop IP is on the same subnet (`ipconfig` / `ifconfig`). 3. If direct-connected, ensure the correct network adapter has the static IP (not Wi-Fi). 4. Try pinging the controller from a command prompt to isolate BAU Suite vs OS-level issues. |

### Failure 2: Controller Not on Network (Pre-Commissioning)

| Property | Detail |
|----------|--------|
| **Symptoms** | Identical to wrong IP — timeout. No ARP response. |
| **Detection method** | Port check times out. Ping returns no response. ARP table (`arp -a`) shows no entry for the target IP. |
| **User-facing error** | "No response from {ip}. The controller may not be powered on or connected to the network." |
| **Remediation** | 1. Verify controller is powered on (check status LEDs). 2. Verify Ethernet cable is connected to the correct port (service port vs BACnet port). 3. Check if controller is in boot sequence (wait 2-3 minutes after power-on). 4. Try the tool port with a direct cable before relying on the building network. |

### Failure 3: Self-Signed Certificate Rejection

| Property | Detail |
|----------|--------|
| **Symptoms** | In browser: cert warning interstitial page. In iframe: blank frame or `ERR_CERT_AUTHORITY_INVALID`. In `proxy_fetch`: works normally (cert bypass). |
| **Detection method** | In web mode: `fetch()` to the controller URL fails with a TypeError (CORS + cert). In Tauri mode: `proxy_fetch` succeeds (cert bypassed). Browser iframe `onError` event fires. |
| **User-facing error** | "The controller's security certificate is not trusted by your browser. In the desktop app, this is handled automatically. In the web app, open the controller in a new tab and accept the certificate warning." |
| **Remediation** | Desktop: Use `proxy_fetch` (automatic). Web: Open in new tab, accept cert warning. Permanent fix: Install a trusted certificate on the controller (requires Siemens ABT Site or equivalent commissioning tool). |

### Failure 4: Mixed Content (HTTPS App Loading HTTP Controller)

| Property | Detail |
|----------|--------|
| **Symptoms** | Iframe is empty. Browser console shows "Mixed Content: The page was loaded over HTTPS but requested an insecure resource." No visible error in the UI. |
| **Detection method** | Browser console monitoring for "Mixed Content" errors. The iframe `onLoad` event may fire but content is empty. |
| **User-facing error** | "Cannot load the controller page because it uses HTTP while BAU Suite uses HTTPS. Open the controller in a new tab instead." |
| **Remediation** | Desktop: `proxy_fetch` handles this (Rust makes the HTTP request, returns content to the HTTPS app). Web: Open in new tab. If the controller supports HTTPS, switch the endpoint protocol to HTTPS. |

### Failure 5: CORS / X-Frame-Options Blocking Embedding

| Property | Detail |
|----------|--------|
| **Symptoms** | Iframe shows "refused to connect" or is blank. Browser console shows "Refused to display in a frame because it set 'X-Frame-Options' to 'deny'" or CSP `frame-ancestors` violation. |
| **Detection method** | Iframe `onLoad` fires but `contentWindow` access throws SecurityError. Console errors reference X-Frame-Options or frame-ancestors. |
| **User-facing error** | "The controller's web server blocks embedding in other applications. Open the controller in a new tab for full access." |
| **Remediation** | Desktop: `proxy_fetch` + srcdoc bypasses X-Frame-Options entirely (the HTML is served from the app origin, not from the controller's server). Web: No workaround — open in new tab. Note: Even if other issues are resolved, X-Frame-Options may independently block embedding. |

### Failure 6: Firewall / VLAN Blocking

| Property | Detail |
|----------|--------|
| **Symptoms** | Connection timeout (if firewall drops packets) or immediate connection refused (if firewall rejects). Ping may fail while web works (ICMP blocked, TCP 443 allowed). |
| **Detection method** | TCP port check on port 443: timeout = firewall dropping, refused = firewall rejecting or service down. Compare ICMP ping result vs TCP port check — mismatch indicates selective firewall rules. |
| **User-facing error** | "Connection to {ip}:{port} timed out. A firewall may be blocking access. Check with your network administrator." |
| **Remediation** | 1. Verify which ports are allowed (ask IT/OT team). 2. Try port 443 even if ping fails. 3. Request firewall rule: source=tech laptop IP, dest=controller IP, ports=443,80,47808. 4. If on a different VLAN, verify inter-VLAN routing exists. 5. Temporarily connect to the OT VLAN directly if permitted. |

### Failure 7: Port Conflict (Controller Not on Expected Port)

| Property | Detail |
|----------|--------|
| **Symptoms** | Connection refused on expected port. Controller may be running web server on non-standard port (e.g., 8443, 8080). |
| **Detection method** | TCP port check returns "Connection refused" (not timeout). This means the host is reachable but nothing is listening on that port. Try common alternative ports: 80, 443, 8080, 8443. |
| **User-facing error** | "Connection refused by {ip} on port {port}. The controller may be running its web server on a different port." |
| **Remediation** | 1. Check commissioning documentation for the configured web port. 2. Try common ports: 80, 443, 8080, 8443. 3. Use BAU Suite port scan to check a range. 4. Check the controller display/status page for the configured web port. |

### Failure 8: Controller in Maintenance / Reboot

| Property | Detail |
|----------|--------|
| **Symptoms** | Connection timeout or partial page load. Controller may respond to ping but web server returns errors (503, connection reset). Page loads partially then hangs. |
| **Detection method** | ICMP ping succeeds but TCP port 443 returns timeout or connection reset. HTTP response status 503 (Service Unavailable). Partial HTML response (connection terminated mid-transfer). |
| **User-facing error** | "The controller at {ip} is reachable but its web server is not responding. The controller may be rebooting or in maintenance mode." |
| **Remediation** | 1. Wait 2-3 minutes for reboot to complete. 2. Check controller status LEDs. 3. If persistent, the web server process may have crashed — power cycle the controller (coordinate with building operations). 4. Check if firmware update is in progress (do NOT power cycle during firmware update). |

### Failure 9: DNS Resolution Failure (Hostname vs IP)

| Property | Detail |
|----------|--------|
| **Symptoms** | "DNS lookup failed" or "Could not resolve host." The endpoint was saved with a hostname but the current network has no DNS for it. |
| **Detection method** | Hostname resolution failure is distinct from connection timeout — it fails immediately (no delay). Error message explicitly mentions DNS or resolution. |
| **User-facing error** | "Cannot resolve hostname '{hostname}'. Try using the controller's IP address instead, or check your DNS settings." |
| **Remediation** | 1. Switch the endpoint from hostname to IP address. 2. If on VPN, check that DNS is pushed correctly (VPN split DNS configuration). 3. Add a hosts file entry: `{ip} {hostname}` in `C:\Windows\System32\drivers\etc\hosts`. 4. For future endpoints, prefer IP addresses over hostnames in BAS field work — DNS is unreliable across different network topologies. |

### Failure 10: Browser Cache Serving Stale Page

| Property | Detail |
|----------|--------|
| **Symptoms** | Controller page loads but shows outdated information. Page appears to work but data is not current. After firmware update, old UI version appears. |
| **Detection method** | Difficult to detect programmatically. Compare page content timestamp with current time. Check browser DevTools Network tab for "(from cache)" or 304 responses. |
| **User-facing error** | "The page may be showing cached content. Try refreshing with Ctrl+Shift+R (hard refresh) to load the latest version." |
| **Remediation** | 1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). 2. Clear browser cache for the controller's hostname. 3. In BAU Suite desktop: the `proxy_fetch` approach naturally avoids caching (each request goes through Rust, no browser cache layer). 4. Append a cache-buster query param: `?_t={timestamp}`. |

---

## 6. Final Recommendation

### 6.1 Best Access Model: Desktop App (Tauri)

**Recommended: OPTION D (Hybrid) — already substantially implemented.**

The current implementation in `src/app/web-interface/page.tsx` already follows the hybrid pattern:

1. **Primary path:** Use `proxy_fetch` to load controller HTML via srcdoc iframe. This works seamlessly for simple/read-only controller pages and avoids all cert/CORS/mixed-content issues.
2. **Fallback path:** When the embedded view fails or the page is too complex, the user opens in system browser via `shell:open` (already implemented as `openUrl()`).
3. **Enhancement needed:** Add heuristic complexity detection to auto-switch between embedded and external. Suggested heuristics:
   - Page size > 500KB: likely a complex SPA, recommend external
   - Script tag count > 5: likely JS-heavy, recommend external
   - Framework markers detected (`<div id="root">`, `<app-root>`, `ng-version`): SPA, recommend external
   - Response is a redirect (3xx status from proxy_fetch): authentication wall, recommend external

**Not recommended: OPTION B (separate Tauri window).** It does not solve the cert problem and adds complexity without clear benefit over shell:open.

### 6.2 Best Access Model: Web App (Browser)

**Recommended: OPTION B (Smart Launcher) — already fully implemented.**

The web-interface page with its endpoint management store already provides:
- Endpoint CRUD with project association
- Favorites and recent connection history
- Protocol/port/path configuration
- One-click open in new tab
- Connection metadata persistence

**No embedding is possible in the web runtime.** The smart launcher is the best we can do, and it is already built.

### 6.3 Should Desktop and Web Access Models Differ?

**Yes.** They must differ because the runtimes have fundamentally different capabilities:

| Capability | Desktop (Tauri) | Web (Browser) |
|------------|----------------|---------------|
| Cert bypass | Yes (Rust proxy) | No (user must accept manually) |
| Embedding | Partial (proxy + srcdoc for simple pages) | No (CORS, mixed content, X-Frame-Options) |
| External open | Yes (shell:open) | Yes (window.open / target=_blank) |
| Session tracking | Full (Zustand store persists in IndexedDB) | Full (same store, same persistence) |
| Port checking | Native TCP (Rust) | Not available (browser security sandbox) |

The **endpoint management and metadata layer** should be identical across both runtimes (same store, same UI components). The **access mechanism** diverges: desktop gets proxy embedding + external fallback, web gets external-only with a richer launcher UI.

### 6.4 Connection Data Model (What to Persist)

The existing `WebEndpoint` type in `src/store/web-interface-store.ts` is well-designed. Recommended additions for PXC7/BAS-specific context:

```typescript
// Current fields (already implemented):
interface WebEndpoint {
  id: string;
  friendlyName: string;          // "AHU-1 PXC7" or "Chiller Plant Controller"
  host: string;                   // "192.168.1.10"
  protocol: Protocol;             // "http" | "https"
  port: string;                   // "443"
  path: string;                   // "/webui"
  projectId: string;              // Associated BAU Suite project
  panelName: string;              // Physical panel location
  systemName: string;             // BAS system identifier
  notes: string;                  // Free-form notes
  tags: string[];                 // Organizational tags
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  preferredOpenMode: OpenMode;    // "auto" | "embedded" | "new-tab"
  favorite: boolean;
  lastKnownEmbedSupport: EmbedSupport;  // "unknown" | "supported" | "blocked"
}

// Recommended additions for PXC7 connectivity context:
interface WebEndpointExtended extends WebEndpoint {
  controllerModel?: string;       // "PXC7.E400M", "Niagara N4", etc.
  firmwareVersion?: string;       // "4.5.x" — affects cert and web behavior
  macAddress?: string;            // For network troubleshooting
  bacnetDeviceId?: number;        // BACnet device instance
  lastResponseTimeMs?: number;    // Track latency trends
  lastHttpStatus?: number;        // Last HTTP status from proxy or direct
  certFingerprint?: string;       // SHA-256 of the controller's TLS cert
  certExpiresAt?: string;         // Cert expiration for proactive warnings
  networkScenario?: string;       // "direct" | "wifi" | "lan" | "vpn" | "segmented"
}
```

**Rationale for additions:**
- `controllerModel` + `firmwareVersion`: Different models/firmware have different web behaviors. Useful for troubleshooting.
- `macAddress`: Identifies the physical device across IP changes.
- `bacnetDeviceId`: Links the web endpoint to its BACnet identity.
- `lastResponseTimeMs` + `lastHttpStatus`: Trend data for connectivity diagnostics.
- `certFingerprint` + `certExpiresAt`: Detect cert changes (potential MITM) and proactive expiration warnings.
- `networkScenario`: Contextualizes troubleshooting advice per the topology scenarios documented above.

---

## Appendix: Quick Reference Matrix

| Access Method | Self-Signed Cert | Mixed Content | X-Frame-Options | Complex SPA | Works Offline |
|--------------|-----------------|---------------|-----------------|-------------|---------------|
| Desktop: proxy_fetch + srcdoc | Bypassed | Bypassed | Bypassed | Broken | Yes (if on same network) |
| Desktop: shell:open | User accepts | N/A (separate window) | N/A | Full support | Yes |
| Desktop: separate Tauri window | Blocked | N/A | N/A | Full support if cert accepted | Yes |
| Web: new tab | User accepts | N/A | N/A | Full support | Yes |
| Web: iframe embed | Blocked | Blocked | Blocked | N/A (never loads) | N/A |
