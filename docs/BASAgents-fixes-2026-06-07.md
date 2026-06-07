# BASAgents Fixes — 2026-06-07

**Trigger:** Critical review of the Daily Reports tool's email output. The owner approved fixing items #1, #2, #4 from the review (no signature feature wanted).

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-07 |
| Agent | Project Manager (owns `src/components/reports/`) |
| Scope | Daily Report email export hardening |
| Files changed | 1 modified, 2 new |
| Insertions / deletions | ~+562 / −10 |
| TypeScript / Lint | clean |
| Tests | **371 passed** (13 new for the `.eml` builder) |

## Audit Phase

A read-only critique of the Daily Reports feature found the email path was the weakest of the four exports: the `mailto:` "Open in Email" button could silently truncate long reports, attachments never traveled with the email, the body was plain-text-only, "Copy Email" embedded the subject into the body, and the subject omitted the report number. Owner approved fixing #1/#2/#4.

## Fixes Applied

### #1 — `mailto:` length guard (P1: silent data loss)
- **`src/components/reports/report-export-dialog.tsx`** — "Open in Email" now builds the full `mailto:` string and, if it exceeds 1800 chars (the practical Outlook/client cap), does **not** open a truncated draft — it copies the body to the clipboard and toasts "Report is too long to open directly in email — copied to clipboard instead." Under the threshold it opens as before.

### #2 — `.eml` export with HTML body + real attachments (the high-value upgrade)
- **`src/components/reports/report-eml.ts` (new)** — pure builder: `multipart/mixed` MIME with a random boundary, RFC-2047-encoded subject, CRLF endings. Body part is base64 `text/html` (email-safe inline styles: details table + bold section headings + `\n→<br>`). Each report attachment is fetched via `getFileBlob(blobKey)`, base64-encoded, and embedded as a `Content-Disposition: attachment` part with 76-char-wrapped base64 (RFC 2045). Missing blobs are skipped, not fatal. base64 done via chunked `btoa` over `Uint8Array` (no call-stack blowups); HTML/subject via `TextEncoder`.
- **`report-export-dialog.tsx`** — new **"Download .eml (with attachments)"** button (async, spinner + disabled "Building…" state, success/warn/error toasts, gentle note over ~25 MB total). Downloads via `downloadBlob(..., 'message/rfc822')`. Opens in Outlook/Mail as a complete draft — rich body **and** the actual files attached, with no URL length cap. Presented as the recommended way to email a full report.
- **Security:** all user-entered content (work/issues/notes, project name/number, technician, cover note, prepared-by, filenames) is HTML-escaped (`& < > " '`) before interpolation, so report text can't break or inject markup into the email HTML.

### #4 — Quick fixes
- **Subject** now includes the report number: `Daily Report #<n> – <project> – <date>` across the mailto, `.eml`, and copy paths (a user-provided title still overrides).
- **Honest plain-text attachments:** the plain-text/mailto output header is now `ATTACHMENTS (attach these files manually)` (the `.eml` carries them, so its list reads normally).
- **Copy Email** now copies the **body only** (no `Subject:` line, so pasting into a compose body is clean); a separate **"Copy subject"** button preserves the subject.

## Verification

- `npx tsc --noEmit` — clean. `npx eslint` on the changed/new files — 0 problems (also removed two pre-existing unused imports in the dialog).
- `npx vitest run` — **371 passed**, including 13 new `report-eml` tests (subject contains `#<n>`, title override, plain-text caveat present/absent per path + no `Subject:` line, HTML escaping, RFC-2047 en-dash encoding, 76-char wrapping, and `.eml` structure: boundary + HTML part + base64 attachment part).

### Not done (per owner / out of scope)
- Signature capture — explicitly not wanted.
- HTML-clipboard copy (#3) and report-level audience/data-masking (#5) — deferred; not requested this round.

### Caveat
- The `.eml` builder's pure string assembly is unit-tested, but opening the file in a real Outlook/Mail client (attachments rendering as a draft) can't be tested in CI — worth one manual open to confirm on the owner's setup.
