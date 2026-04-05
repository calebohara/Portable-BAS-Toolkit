<div align="center">

# BAU Suite

### The Field Platform for Building Automation

*Manage projects, run diagnostics, document fieldwork, and collaborate — online or offline.*

[![Version](https://img.shields.io/badge/Version-4.9.0-00BCD4?style=flat-square)](#versioning)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=white)](#desktop-app)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## What's New in v4.9.0

- **Trend Data Visualizer** — Upload BAS trend CSVs from any platform (Niagara N4, Desigo CC, Metasys, EcoStruxure, WebCTRL, generic) and get clean interactive charts with multi-series overlay, dual Y-axis, and brush zoom. Includes:
  - Auto-detection of delimiter, header row, timestamp format, and units across all major BAS export styles
  - Anomaly detection engine: stuck sensor, spikes (rolling Z-score), oscillation/hunting, short-cycling, out-of-range, and data gaps — all with configurable thresholds
  - Per-series statistics: min/max/mean/median/std dev, gap count, and runtime hours for binary signals
  - Export: clean CSV, high-DPI PNG chart, print-ready HTML report, and clipboard copy for Excel
  - Session save/load with IndexedDB persistence and optional project association

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

### Access & Diagnostics
- **Web Interface** — access BAS controller web panels with saved endpoints and security handling
- **Telnet HMI** — browser-based Telnet terminal with session tabs, logging, and command history
- **Command Snippets** — reusable commands for BACnet, Modbus, Niagara, Siemens, and more
- **PPCL Editor** — syntax-highlighted editor for PPCL programs with multi-tab support, line length enforcement, GOTO navigation, and cloud sync

### Cloud Sync & Offline
- **Offline-first** — all data in IndexedDB, works without Wi-Fi
- **Background cloud sync** — automatic push/pull to Supabase with real-time status indicator
- **Conflict resolution** — detects local/remote edit divergence with UI to choose which version to keep
- **Online presence** — real-time indicator of active users in the sidebar
- **Account approval** — admin gate for new user registrations

### Donations & Subscriptions
- **Stripe integration** — one-time donations and monthly subscriptions to support the project
- **Customer portal** — manage subscription and billing via Stripe portal
- **Graceful fallback** — shows "Coming Soon" when Stripe keys are not configured

### Platform
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
| VPN network access | HTTP only | Full |
| Install size | ~0 MB | ~15 MB |

Download from [GitHub Releases](https://github.com/calebohara/Portable-BAS-Toolkit/releases) (Windows .msi).

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

**Current: v4.9.0** — synchronized across `package.json`, `tauri.conf.json`, `Cargo.toml`, and the app UI.

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
