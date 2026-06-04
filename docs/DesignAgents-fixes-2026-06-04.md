# DesignAgents Fixes — 2026-06-04

**Trigger:** User request — "I don't really like the help section. On a computer it's a lot of data and all shoved to the left of the screen. Let's make the design more intuitive and make sure it's updated against all of the tools/features."

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-04 |
| Agents | 2 — content-accuracy scout (Explore, read-only) + Luma (Experience & Page-UX designer) |
| Files changed | 1 rewritten (`src/app/help/page.tsx`) + 1 new (`src/app/help/help-content.ts`) |
| Insertions / deletions | ~+450 / −544 in page.tsx; +~525 new content module (net fewer page lines despite much more content) |
| TypeScript | Clean for changed files (only pre-existing `xlsx`/DXR module errors remain) |
| Lint | `eslint` clean on both files |
| Visual QA | Rendered & screenshotted at 1440px (desktop), 375px (mobile), dark mode; search filter exercised; 0 console errors |

## Audit Phase

| Agent | Role | Output |
|-------|------|--------|
| Content scout (Explore) | Read-only audit of `src/app/help/page.tsx` content vs. the real app (`sidebar.tsx`, `routes.ts`, every tool page, `src-tauri/src/lib.rs`) | Authoritative corrected content spec: canonical 26-route tool list, gap analysis (8 missing guides), inaccuracy list (Ping, Web Interface, Terminal, shortcuts), and an 8-category IA. |
| Luma (Designer) | Implemented the redesign + content corrections against the spec | Rewrote the page; extracted content into a data module. |

## Fixes Applied

### P1 — Layout: content pinned to a narrow left column on desktop

- **`src/app/help/page.tsx`** — *Issue:* the whole page was wrapped in `max-w-3xl` with **no horizontal centering**, so on wide desktop screens all content was jammed into a narrow column on the far left; it was also one long vertical stack of ~19 collapsibles + FAQ + troubleshooting (a wall of data). *Fix:* replaced with `mx-auto w-full max-w-7xl`; on `lg` the body is a two-column `grid-cols-[15rem_minmax(0,1fr)]` — a **sticky left category-nav rail** beside a wide content area (verified live: `240px` rail + `944px` content, centered). Feature guides now render as a responsive **card grid** (`md:grid-cols-2 xl:grid-cols-3`, 1 col on mobile). On mobile the rail collapses to a horizontal scroll-chip row and everything stacks to one column.

### P1 — UX: not intuitive / wall of data

- **`src/app/help/page.tsx`** — Added a hero header with a **prominent search box** that live-filters ALL content (guides, FAQ, troubleshooting) client-side/offline on title + body, with a result count, clear button, and a "no results" empty state; matched cards/accordions auto-expand. Added **8-category navigation** (Getting Started · Engineering Tools · Field Connectivity & Diagnostics · Projects & Documentation · Collaboration & Cloud · Safety · Settings · FAQ/Troubleshooting/Shortcuts) with smooth-scroll jumps; categories with no search matches are disabled. Accessibility: real heading hierarchy, `sr-only` search label, `role="searchbox"`, `aria-live` count, keyboard-operable accordions (`aria-expanded`/`aria-controls`), theme tokens only (light/dark safe). Preserved the "Replay Tour" button and version footer.

### P1 — Content: stale & inaccurate vs. the actual tools

- **`src/app/help/help-content.ts` (new data module)** — All help content extracted here for maintainability.
- **Added missing guides:** Trend Data Viewer, DXR Import (Desigo CC Smart Copy), Global Notepad, Pre-Work Safety Log (PWSL), Activity Timeline, and a Settings guide (Backup/Restore, Consistency Check, Data Cleanup, Clear File Cache, theme, PWSL reminder toggle). Expanded Daily Reports (draft→finalize, attachments, per-project history, Teams/Outlook/PDF/JSON export).
- **Fixed inaccuracies (verified against `src-tauri/src/lib.rs` + tool code):**
  - **Terminal** — renamed "Telnet HMI Tool" → **"Terminal (Telnet & Serial)"**; documented desktop Serial support (COM port, baud, data bits, parity, stop bits, flow control, port listing); Telnet = TCP/23.
  - **Ping Tool** — removed the false "uses fetch() (not ICMP)" claim; now: desktop = native **ICMP** ping + TTL + optional TCP port check; browser/PWA = HTTP/HTTPS fallback + optional BAS port scan (8080/8443/47808).
  - **Web Interface** — corrected the X-Frame-Options-only description; now describes the desktop **`proxy_fetch`** path (embeds self-signed-cert panels in a sandboxed iframe with injected `<base>`), the browser direct-embed + new-tab fallback, and the Trust-Certificate retry flow.
  - **Keyboard Shortcuts** — expanded from 3 to the full verified set (Global Cmd/Ctrl+K & Esc; Network Diagram V/H/C, +/=, -, 0, Delete/Backspace, Esc; PPCL Editor Esc).
- **Intentionally NOT documented:** Field Panels (data type only; no user-facing UI yet — documenting it would be inaccurate).

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries. Harmless; retained.

## Verification

- **TypeScript:** `npx tsc --noEmit` — no errors in `src/app/help/`. Only pre-existing `xlsx`/DXR module errors remain (out of scope).
- **Lint:** `eslint src/app/help/page.tsx src/app/help/help-content.ts` — clean.
- **Live render QA (preview server):** `/help` rendered at 1440×900 (desktop two-column rail confirmed via computed `grid-template-columns: 240px 944px`), dark mode, and 375×812 (mobile chip rail + single column). Search exercised: typing "serial" correctly narrowed to the single "Terminal (Telnet & Serial)" guide. `0` console errors.
