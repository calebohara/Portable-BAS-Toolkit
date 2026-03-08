# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.1.x   | Yes       |
| < 2.1   | No        |

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly with details of the vulnerability
3. Include steps to reproduce, impact assessment, and suggested fix if possible
4. Allow reasonable time for a fix before public disclosure

## Security Architecture

### Data Model

BAU Suite is an **offline-first, local-only** application. All project data, files, notes, reports, and settings are stored locally in the browser using:

- **IndexedDB** — all project data, file blobs, reports, activity logs
- **localStorage** — UI preferences, Zustand-persisted state (sidebar, theme, notepad, terminal history, web endpoints)
- **Cache Storage** — Service Worker app shell and static asset caches

**There is no backend server, no user authentication, no cloud database, and no cross-device sync.** All data lives exclusively in the user's browser.

### What This Means for Security

- **No authentication** — the app has no login flow because there is no remote data to protect. All data is local to the browser profile.
- **No authorization / RLS** — there are no multi-user data access boundaries because the app is single-user, local-only.
- **No API keys or secrets** — the app makes no external API calls and stores no credentials.
- **No CSRF risk** — there are no state-changing server endpoints to protect.

### Browser Security Headers

The following security headers are set via `next.config.ts` for all routes:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | Restrictive policy | Limits script, style, frame, and connection sources |
| X-Content-Type-Options | nosniff | Prevents MIME type sniffing |
| X-Frame-Options | SAMEORIGIN | Prevents clickjacking |
| Referrer-Policy | strict-origin-when-cross-origin | Limits referrer leakage |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Blocks unnecessary browser APIs |
| Cross-Origin-Opener-Policy | same-origin | Isolates browsing context |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Enforces HTTPS |

### Input Handling

- All user input is rendered via React's JSX auto-escaping (no `dangerouslySetInnerHTML` usage)
- HTML entities are explicitly escaped in print/PDF export title templates
- Filenames are sanitized to remove path traversal characters, leading dots, and control characters
- URL inputs in the Web Interface tool are validated to allow only `http://` and `https://` protocols
- Host fields are validated to reject protocol injection, script vectors, and unsafe characters

### File Handling

- File uploads are validated for size (100MB limit) and type (extension whitelist per category)
- Filenames are sanitized on upload to remove unsafe characters
- File previews use sandboxed iframes (`sandbox="allow-same-origin"`) for PDFs
- Images are rendered in `<img>` tags (no script execution)
- Text files are rendered as plain text in `<pre>` tags (no HTML parsing)
- SVG files are rendered via `<img>` tags only (prevents inline script execution)
- Blob URLs are properly created and revoked to prevent memory leaks

### Web Interface Tool

- Only `http://` and `https://` protocols are allowed — `javascript:`, `data:`, `blob:`, and `vbscript:` are blocked
- Embedded panels use sandboxed iframes with `referrerpolicy="no-referrer"`
- External links use `window.open` with `noopener,noreferrer` to prevent `window.opener` access
- The app honestly communicates browser security limitations (X-Frame-Options, CSP, mixed content) rather than making false security claims

### Service Worker

- Only caches same-origin GET requests
- Never caches opaque or error responses
- Dynamic cache is size-limited to prevent unbounded growth
- Cache is versioned and old versions are purged on activation
- Does not intercept cross-origin requests

## Shared Device Considerations

Since all data is stored in the browser:

- **Do not store sensitive credentials** (passwords, API keys, access tokens) in project notes, sticky notepad, or report fields
- **Clear data** via Settings before transferring a device to another user
- **Browser storage is not encrypted at rest** — physical device access means data access
- **Use browser profiles** to separate work if multiple people use the same device
- **Incognito/private mode** will not persist any data (IndexedDB and localStorage are cleared on close)

## Known Limitations

1. **No at-rest encryption** — IndexedDB data is stored unencrypted by the browser. This is a browser platform limitation, not an app vulnerability. Mitigate with device-level encryption (BitLocker, FileVault).

2. **Print export uses document.write** — Print/PDF export writes React-rendered HTML to a new window. All user-generated text content is auto-escaped by React's JSX rendering before reaching `innerHTML`. Template titles are explicitly HTML-escaped. This is an acceptable pattern for controlled, same-origin print windows.

3. **iframe embedding of external panels** — The Web Interface tool embeds external BAS controller web panels in sandboxed iframes. The app cannot control the security posture of those external panels. Users should only connect to trusted, known devices on their local network.

4. **Mixed content** — If BAU Suite is served over HTTPS and a target BAS panel uses HTTP, the browser will block the embedded connection. The app detects this and recommends "Open in New Tab" mode. This is correct browser security behavior.
