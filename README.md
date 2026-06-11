<div align="center">

# BAU Suite

### The Field Platform for Building Automation

*Manage projects, run diagnostics, document fieldwork, and collaborate — online or offline.*

[![Version](https://img.shields.io/badge/Version-4.11.0-00BCD4?style=flat-square)](#versioning)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=white)](#desktop-app)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## What's New

### v4.40.0

- **Sync hardening: one conflict authority for shared projects** — "Share to Global" no longer trusts wall-clock timestamps alone: if a teammate edited a row since your device last pulled it, the share **surfaces a conflict to resolve** (keep yours / keep theirs) instead of silently overwriting their edit — closing the long-deferred two-writer gap (CFM-1/ARCH-1). Also fixed four data-stranding edge cases: the auto-mirror and remote-delete paths now respect un-pushed local edits, back-to-back self-edits no longer raise spurious conflict prompts, and an edit dismissed from the Sync Error Inspector can be re-synced later with "Sync Now". The read-only consistency check now covers all Global Project tables too. 10 new regression tests; full audit trail in `docs/SyncAuditAgents-fixes-2026-06-11.md`.

### v4.39.0

- **Import `.p2` panel databases into the PPCL Editor** — The editor now opens Siemens APOGEE/Desigo `.PXCM.P2` controller backups directly (upload or drag-and-drop). The proprietary binary container is decoded entirely in the browser: each panel's PPCL programs are reconstructed into editable `.pcl` tabs, and a new **Panel Inspector** side panel lists the panel's full point database and trends. The **Points** tab shows every logical point with a colour-coded type badge (LAI/LAO/LDI/LDO and setpoint/calc values), descriptor, and engineering units or state text, with a one-click *Physical I/O only* filter and CSV export. The **Trends** tab lists logged points with interval (`15 min`) or change-of-value (`COV`) markers. Point/program/trend extraction is covered by unit tests; the inspector is local-only (no sync changes).

### v4.12.0 – v4.21.0

- **Full code-review remediation (ReviewAgents P0–P3)** — Closed every priority tier from the 2026-05-20 audit: data-loss/security P0s (proxy/iframe sandboxing, IDB transaction safety, sync queue recovery, `sync_version` tiebreak, reset-password hardening), ~38 P1 visible bugs, ~43 P2 consistency fixes, and ~40 P3 cleanups (incl. removing 11 unused dependencies). See `docs/BASAgents-fixes-*` and `docs/ReviewAgents-findings-*`.
- **Daily health-check automation + active-bugs registry** — A GitHub Actions cron runs `tsc`/`eslint`/`vitest`/`build:static`/`cargo` daily and pulls open user bug reports from Supabase into `docs/ACTIVE-BUGS.md`, the single source of truth for active bugs.
- **Landing page simplified** — Consolidated the marketing page to a calmer, more informative layout.
- **PPCL preview** — Copy-to-clipboard and corrected `.pcl` download (no more `.pcl.txt`).
- **Help center redesign** — Searchable, categorized, full-width, and updated against every tool.
- **Sync fixes** — Resolved user-reported `globalProjectPreferences` and `trendSessions` sync errors; server-side `sync_version` auto-increment; storage bucket size limits.
- **Supabase migration tracking** — `schema_migrations` ledger + drift checker (`supabase/check-migrations.sql`). See `docs/MIGRATIONS.md`.

### v4.11.0

- **Database Consistency Check** — A read-only check that compares this device's local data against the cloud, per data type (projects, files, field notes, devices, IP plan, daily reports, DXRs, and 10 more). It runs automatically once after login on already-synced devices — so when you've edited on one device and open the app on another with stale local data, a toast warns "Your local data is behind the cloud" with a one-tap **Update**. A new **Database Consistency** card in **Settings → Cloud & Sync** runs it on demand and opens a results dialog showing exactly what's out of date (local vs cloud counts) with an **Update from cloud** action. The check is strictly read-only and conservative — pending local edits are never mis-flagged as "behind," and a single table failing degrades gracefully rather than failing the whole check. Only the user-initiated update pulls cloud→local (respecting remote deletes), reusing the existing sync engine.

### v4.10.2

- **PWSL dashboard access button** — Added an always-visible Pre-Work Safety Log access row at the top of the dashboard. If the login safety prompt is dismissed or missed, one click reopens the gate — so the safety check is never out of reach.

### v4.10.1

- **PWSL opens side-by-side, not embedded** — The Pre-Work Safety Log now opens in a sized companion browser window pinned beside the tool instead of an in-app iframe. Microsoft Forms blocks third-party-iframe authentication, so the embed rendered blank for signed-in users; a companion window is a first-party context where the form loads normally. The in-app prompt now tracks the window (auto-open, popup-blocked handling, reopen, and close-detection) while the tool stays exactly where the user left it.

### v4.10.0

- **Pre-Work Safety Log (PWSL) Gate** — A mandatory safety check now greets users on the dashboard at login. An attention-grabbing, non-dismissible dialog (amber safety banner, pulsing shield) asks whether the Pre-Work Safety Log has been completed before work begins. **Yes** clears it (with an optional "Don't remind me on future logins" checkbox); **No** opens the company Microsoft Forms PWSL in a companion window beside the tool so the user never loses their place. The reminder preference persists across sessions and is re-enableable from **Settings → Preferences → Safety**.
- **Dashboard Redesign (DashAgents)** — Three-pass overhaul (REMOVE / IMPROVE / ADD). Cut the sidebar-duplicating Tools Grid, the Recently Opened redundancy, the Total Projects vanity stat, the Desktop App acquisition banner, and the Leave Review action. Added proper a11y landmarks (`<main>`, `aria-labelledby` on every section, visually-hidden page `<h1>`), real `<button>` semantics on project cards (replacing a fake `role="button"` div), section-level skeleton loaders, an actionable Sync Now button wired to `triggerFullSync()`, and a clickable conflict resolver that opens the existing `SyncConflictsDialog`. New "Today" section above Quick Actions surfaces the most recently opened project + its last activity, today's draft daily reports, and active terminal/web sessions — hidden when none apply. Project tiles render at uniform height regardless of data payload.
- **PPCL Preview Dialog** — Preview PPCL programs from the project page without opening the full editor. Read-only CodeMirror with full syntax highlighting via the existing `ppclLanguage()` extension, metadata header (firmware target, line count, byte size), and a Download button that produces a properly named `.pcl` file. The preview pane is vertically resizable via native CSS resize; horizontal and vertical scrollbars stay sticky at the visible viewport edges regardless of scroll position. CodeMirror is dynamic-imported so the chunk only loads when a preview is opened.
- **File Extension Corrections** — Panel DBs and Backups upload categories now correctly accept `.p2` (Siemens panel database format) instead of `.pcl`. Added `.p2` → Database and `.pcl` → FileCode entries to the file-icon mapping. PPCL files (`.pcl`) are now previewable in-app via the project file preview dialog. Tightened the Trend Data uploader to `.csv` only — removed the vestigial `.tsv` / `.txt` accept paths that real BAS exports never use.
- **Landing Page Polish (LandingAgents)** — Hero animation refinement, design-token alignment, copy and conversion fixes, accessibility improvements. Restored missing tools in the landing tools grid and removed the broken Message Board entry. Corrected the placeholder Vercel favicon that was overriding the BAU Suite icon.
- **DesignAgents P0–P3 Fixes** — Accessibility audit, design-system consistency, and UX polish across the app shell, component library, and shared primitives.
- **PPCL Editor Navigation-Lock Fixes** — Three separate fixes for tour-overlay issues that could trap the user in the editor: TourOverlay SVG mask was blocking clicks across the editor surface; keyboard focus trap left users with no escape route; fullscreen overlay was blocking the sidebar.

### v4.9.1

- **macOS Desktop App** — BAU Suite is now available as a native macOS app (.dmg) via GitHub Releases, alongside the existing Windows installer. CI/CD pipeline updated with a full macOS aarch64 build matrix.
- **ANSI 256-color & True-color Terminal** — Telnet HMI now renders full 256-color (ESC[38;5;N) and 24-bit true-color (ESC[38;2;R;G;B) sequences from BAS controllers instead of stripping them.
- **Telnet Connect Timeout** — Unreachable hosts no longer hang the terminal indefinitely. Native telnet connect now times out at 10 seconds with a proper error state.
- **Terminal Listener Leak Fixed** — Tauri event listeners are now guaranteed to clean up on failed or interrupted connect attempts, preventing accumulation over rapid reconnect cycles.
- **Stripe Billing Portal Auth** — The subscription portal endpoint now verifies the caller's Bearer token and confirms the Stripe customer ID belongs to the authenticated user before creating a session.
- **Engine Input Hardening** — PID tuning calculators (ZN Ultimate, ZN Step, Cohen-Coon) now validate inputs and return empty results instead of silent NaN/Infinity on zero or negative values. Psychrometric bisection solvers now guard against out-of-range humidity ratios.
- **PPCL Duplicate Line Detection** — The PPCL editor warns on Cmd+S if the program contains duplicate line numbers (a common authoring error in PPCL that causes silent controller faults).
- **Global Project Cascade Delete** — Soft-deleting a global project now cascades to all child records (notes, devices, IP entries, reports, files) to prevent orphan accumulation.
- **IndexedDB Blob Cache LRU** — The local file blob store now checks storage quota before each write and evicts the oldest blobs when usage exceeds 80%, preventing unbounded storage growth.
- **Build Script Hardened** — API route restoration after Tauri static export builds now runs in a `finally` block, guaranteeing cleanup even if the build process crashes.

<details>
<summary>v4.9.0</summary>

- **Trend Data Visualizer** — Upload BAS trend CSVs from any platform (Niagara N4, Desigo CC, Metasys, EcoStruxure, WebCTRL, generic) and get clean interactive charts with multi-series overlay, dual Y-axis, and brush zoom. Includes:
  - Auto-detection of delimiter, header row, timestamp format, and units across all major BAS export styles
  - Anomaly detection engine: stuck sensor, spikes (rolling Z-score), oscillation/hunting, short-cycling, out-of-range, and data gaps — all with configurable thresholds
  - Per-series statistics: min/max/mean/median/std dev, gap count, and runtime hours for binary signals
  - Export: clean CSV, high-DPI PNG chart, print-ready HTML report, and clipboard copy for Excel
  - Session save/load with IndexedDB persistence and optional project association
</details>

<details>
<summary>v4.8.7</summary>

- **PPCL Editor** — Full-featured editor for PPCL programs with syntax highlighting, multi-tab support, line length enforcement, GOTO navigation, and cloud sync.
- **Register Tool Expansion** — Quick converter, register interpreter, byte order tool, IEEE 754 float decoder, bitmask tool, scaling calculator, Modbus builder, calculation history, and inline help reference.
- **Network Diagram Builder** — Canvas-based topology editor with color-coded node types (devices, controllers, gateways, sensors, actuators), connection lines, pan/zoom, and export.
- **Component Decomposition** — Large page components broken into focused modules for maintainability.
- **Error Handling Overhaul** — Error boundary, reporting utility, and silent catch fixes across the app.
- **Test Infrastructure** — Vitest setup with tests for DB operations, sync manager, PID tuning, and register utilities.
- **Psychrometric Calculator** — HVAC air property calculations with session save/load, AHU process modeling, comfort analysis, and reference tables.
</details>

<details>
<summary>v4.8.4</summary>

- **PID Tuning Tool** — Interactive PID loop tuning calculator with support for multiple loop types, output types, control modes, and session save/load.
- **Dashboard Enhancements** — Activity feed, project health cards, and stats widgets for at-a-glance project status.
- **Offline / Pinned Content** — Pin projects and content for guaranteed offline access with dedicated management view.
</details>

<details>
<summary>v4.3.0</summary>

- **Knowledge Base** — Forum-style knowledge base with full-page article composer, markdown formatting toolbar, categories, file attachments, threaded replies, and full-text search.
- **Supabase Cloud Sync** — Automatic background sync of local IndexedDB data to Supabase with push queue, incremental pull, and real-time status indicator in the sidebar.
- **Sync Conflict Resolution** — Detects when local and remote edits diverge during offline periods. Conflicts are stored with metadata and surfaced in a resolution dialog.
- **User Inbox** — Direct messaging between users with notification badge, sent/received tabs, and read tracking.
- **Online Presence** — Real-time online users indicator in the sidebar showing who's active.
- **Account Approval Gate** — Admin panel for approving new user registrations with deny/permanently-delete capability.
- **File Uploads & Storage** — Supabase storage integration with versioned file uploads and Postgres full-text search across all content.
- **Realtime Subscriptions** — All global project data hooks subscribe to Supabase realtime channels for live updates.
</details>

<details>
<summary>v4.2.0</summary>

- **Message Board** — Cross-project message board with threaded replies, unread tracking, and read receipts for team-wide communication.
- **Security Hardening** — Tightened CSP headers, cryptographic access code generation, input validation, ownership guards, and comprehensive account deletion cleanup.
- **RLS Policy Tightening** — Soft-deleted records excluded from SELECT policies, column-level write restrictions via database triggers.
</details>

<details>
<summary>v4.1.0</summary>

- **Global Projects** — Multi-user collaborative project management with Supabase. Create shared projects, invite team members via access codes, and work together with full audit trails.
- **Share Local to Global** — Migrate any local project to a Global Project with one click. Notes, devices, IP entries, and daily reports are transferred automatically.
- **Daily Report Linking** — Link daily reports from your profile directly to a Global Project via a toggle switch.
- **Full Global CRUD** — Edit projects (admin), edit/delete reports (creator-only), documents tab, files, notes, devices, and IP entries — all with activity logging and RLS enforcement.
</details>

---

## Overview

**BAU Suite** is a portable project management toolkit for BAS technicians, controls engineers, and commissioning specialists. It centralizes the project data, diagnostic tools, and documentation workflows that field engineers carry between job sites.

> Think **Git for BAS projects** — version-controlled, searchable, and available offline.

### Who is this for?

| Role | Use Case |
|------|----------|
| **Commissioning Engineer** | Track startup progress, document punch items, manage IP plans |
| **Service Technician** | Access project history, controller configs, and network maps on-site |
| **Controls Programmer** | Organize panel databases, sequences, and wiring documentation |
| **Project Manager** | Monitor project status, coordinate teams via Global Projects |
| **Network Engineer** | Plan IP addressing, track VLANs, detect duplicate addresses |

---

## Features

### Project Management
- Create, edit, and delete BAS projects with status, contacts, tags, and cascading cleanup
- Full CRUD for devices, IP entries, contacts, notes, and project metadata
- Activity log with automatic audit trail
- Share/export via Teams, Outlook, PDF, or JSON with audience presets

### Global Projects
- **Multi-user collaboration** — shared projects powered by Supabase with Row Level Security
- **Access codes** — invite team members with a generated code, no email exchange needed
- **Full feature parity** — notes, devices, IP plan, daily reports, documents, and files
- **Share local to global** — migrate an existing local project with all data in one click
- **Activity tracking** — every change logged with before/after diffs and creator attribution
- **Role-based access** — admin and member roles with creator-only edit/delete on content
- **Message board** — threaded discussions with replies, unread tracking, and read receipts
- **Direct messaging** — user inbox with sent/received tabs, notification badges, and read tracking

### Knowledge Base
- Forum-style article posting with full-page markdown editor and formatting toolbar
- Categories, file attachments (25MB limit), threaded replies
- Full-text search across all articles and replies

### Daily Reports
- Structured field reports with work completed, issues, coordination notes, equipment, and attachments
- Three-stage workflow: Draft, Submitted, Finalized
- Link reports to Global Projects via toggle switch
- Export to Teams, Outlook, PDF, or JSON

### Network & Device Tools
- **IP Plan** — full addressing table with VLAN, subnet, hostname, duplicate detection
- **Device Inventory** — controllers, sensors, actuators with BACnet instance, IP, MAC, location
- **Ping Tool** — HTTP and ICMP (desktop) reachability with port scanning
- **Network Diagram Builder** — canvas-based topology mapping with color-coded node types, connections, and PNG/SVG export
- **Register Tool** — hex/decimal/binary converter, IEEE 754 float decoder, byte order tool, bitmask editor, scaling calculator, Modbus address builder, and calculation history
- **PID Tuning** — interactive PID loop tuning calculator with multiple loop types, control modes, and session management
- **Psychrometric Calculator** — HVAC air property calculations with session save/load, AHU process modeling, comfort analysis, and reference tables
- **Trend Data Visualizer** — upload BAS trend CSVs from Niagara N4, Desigo CC, Metasys, EcoStruxure, WebCTRL, or generic exports; auto-detect delimiter / header / timestamp format / units; multi-series overlay with dual Y-axis and brush zoom; built-in anomaly detection (stuck sensor, spikes, oscillation, short-cycling, out-of-range, data gaps); per-series statistics; export to CSV / high-DPI PNG / HTML report / clipboard; session save/load with optional project linking

### Access & Diagnostics
- **Web Interface** — access BAS controller web panels with saved endpoints and security handling
- **Telnet HMI** — browser-based Telnet terminal with session tabs, logging, and command history
- **Command Snippets** — reusable commands for BACnet, Modbus, Niagara, Siemens, and more
- **PPCL Editor** — syntax-highlighted editor for PPCL programs with multi-tab support, line-length enforcement (198 chars for PXC/TC, 80 for PTEC), GOTO navigation, duplicate-line-number warning on save, and cloud sync. Imports Siemens `.p2` panel databases — reconstructs the panel's PPCL programs and opens a Panel Inspector listing its points (type, descriptor, units/states) and trends, with CSV export
- **PPCL Preview & Download** — preview PPCL programs directly from a project's PPCL tab in a read-only modal with full syntax highlighting, resizable viewer, sticky scrollbars, and a Download button that produces a proper `.pcl` file — no round-trip through the editor route required

### Cloud Sync & Offline
- **Offline-first** — all data in IndexedDB, works without Wi-Fi
- **Background cloud sync** — automatic push/pull to Supabase with real-time status indicator
- **Conflict resolution** — detects local/remote edit divergence with UI to choose which version to keep
- **Consistency check** — read-only local-vs-cloud comparison per data type; auto-runs on login and on demand from Cloud & Sync, with a one-tap pull to update a stale device
- **Online presence** — real-time indicator of active users in the sidebar
- **Account approval** — admin gate for new user registrations

### Donations & Subscriptions
- **Stripe integration** — one-time donations and monthly subscriptions to support the project
- **Customer portal** — manage subscription and billing via Stripe portal
- **Graceful fallback** — shows "Coming Soon" when Stripe keys are not configured

### Platform
- **Pre-Work Safety Log gate** — mandatory safety reminder on dashboard login asking whether the PWSL is complete; opens the company Microsoft Forms safety log in a companion window beside the tool on "No", with a persisted "don't remind me" preference and a Settings re-enable toggle
- **Dashboard** — at-a-glance home view with a contextual "Today" rail (resume your last project + its last activity, today's draft daily reports, active terminal/web sessions), Quick Actions, Pinned and Active project grids, Overview stats (active count, offline-ready count, sync status with one-click Sync Now and conflict resolver, local storage usage), and Recent Activity + Field Notes feeds with skeleton loaders
- **Desktop app** — native Tauri app with real ICMP ping and full network access
- **Global search** — search across all projects, files, devices, IP entries, and notes
- **Global notepad** — floating scratch pad with tabs, project linking, and persistent state
- **Command palette** — quick-access command menu for fast navigation
- **Help center** — in-app help documentation and guidance
- **Bug reports & reviews** — built-in bug reporting and user feedback/review system
- **Offline / Pinned** — pin content for guaranteed offline access with a dedicated management view
- **Uploads Inbox** — central file upload area for organizing project documents
- **Error boundary** — graceful error recovery with reporting

---

## Quick Start

```bash
git clone https://github.com/calebohara/Portable-BAS-Toolkit.git
cd Portable-BAS-Toolkit
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app auto-seeds demo data on first launch.

### Environment Variables

Create `.env.local` (optional — app works fully without these):

```env
# Supabase (cloud sync, auth, global projects)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key

# Stripe (donations & subscriptions — shows "Coming Soon" without these)
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **UI** | shadcn/ui + Base UI |
| **State** | Zustand 5 (persisted) |
| **Local Storage** | IndexedDB via `idb` |
| **Auth & Cloud** | Supabase (optional) |
| **Desktop** | Tauri 2 (Rust) |
| **Testing** | Vitest |
| **Deployment** | Vercel / GitHub Releases |

---

## Desktop App

Native desktop app via [Tauri](https://v2.tauri.app/) with capabilities browsers can't provide:

| Feature | Browser | Desktop |
|---------|:---:|:---:|
| All BAU Suite tools | Yes | Yes |
| Real ICMP ping | No | Yes |
| Direct TCP port checking | No | Yes |
| Serial port / Telnet | No | Yes |
| 256-color & true-color terminal | Yes | Yes |
| VPN network access | HTTP only | Full |
| Platform | — | Windows + macOS |
| Install size | ~0 MB | ~15 MB |

Download from [GitHub Releases](https://github.com/calebohara/Portable-BAS-Toolkit/releases) (Windows .msi / macOS .dmg).

```bash
npm run tauri:dev      # Dev mode
npm run tauri:build    # Production build
```

---

## Authentication & Cloud

Supabase-powered authentication is **optional**. Without it, the app runs fully local.

| Feature | Status |
|---------|--------|
| Email/password auth | Active |
| Password reset | Active |
| User profiles | Active |
| Global Projects (multi-user) | Active |
| Row Level Security | Active |
| Cloud sync with conflict resolution | Active |
| Online presence | Active |
| Account approval gate | Active |

### Security

- All tables have Row Level Security enabled
- Browser security headers (CSP, HSTS, X-Frame-Options) configured
- Input escaping, URL validation, file sanitization, window isolation
- See [SECURITY.md](SECURITY.md) for full details

---

## Versioning

**Current: v4.11.0** — synchronized across `package.json`, `tauri.conf.json`, `Cargo.toml`, and the app UI.

Follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

---

## Contributing

```bash
git checkout -b feature/your-feature
# Make changes
git push origin feature/your-feature
# Open a Pull Request
```

- TypeScript with strict types
- Follow existing component patterns
- Test on mobile viewport
- Ensure offline compatibility
- See [CLAUDE.md](CLAUDE.md) for detailed architecture, build system, and common pitfalls

---

<div align="center">

**BAU Suite** — *Keep your projects portable.*

Built by [Caleb O'Hara](https://www.calebblaze.com)

</div>
