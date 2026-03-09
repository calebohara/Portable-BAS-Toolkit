<div align="center">

# BAU Suite

### Portable Project Toolkit for Building Automation Systems

*A field-ready project container for BAS engineers and technicians.*
*Organize panel databases, IP plans, device inventories, wiring diagrams, and field notes — online or offline.*

[![Version](https://img.shields.io/badge/Version-2.4.1-00BCD4?style=flat-square)](#application-versioning)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](#pwa-capabilities)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=white)](#desktop-app)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## Version

**Current Release: v2.4.1**

This project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`). The version is synchronized across `package.json`, the application UI (sidebar and Settings page), and this README.

---

## Overview

**BAU Suite** is a portable project management toolkit purpose-built for Building Automation System (BAS) technicians, controls engineers, and commissioning specialists.

It centralizes the critical project data that field engineers carry between job sites:

- **Panel databases** — controller inventories and configurations
- **Wiring diagrams** — versioned electrical documentation
- **Sequences of operation** — control logic references
- **IP plans** — network addressing with VLAN/subnet tracking
- **Device lists** — BACnet controllers, sensors, actuators
- **Backups** — controller snapshots and configuration archives
- **Technician notes** — field observations, issues, punch items

> Think **Git for BAS projects** — version-controlled, searchable, and available offline.

### Who is this for?

| Role | Use Case |
|------|----------|
| **Commissioning Engineer** | Track startup progress, document punch items, manage IP plans |
| **Service Technician** | Access project history, controller configs, and network maps on-site |
| **Controls Programmer** | Organize panel databases, sequences, and wiring documentation |
| **Project Manager** | Monitor project status, review activity logs, manage contacts |
| **Network Engineer** | Plan IP addressing, track VLANs, detect duplicate addresses |

### Real-world scenarios

- **AHU commissioning** — document every controller, IP address, and startup note in one place
- **Troubleshooting** — pull up device lists, network maps, and past field notes instantly
- **System migrations** — track old vs. new panel databases with version history
- **Service calls** — access offline project data without needing VPN or site Wi-Fi
- **Project handoff** — share organized, searchable project containers between engineers

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Project Management** | Create, edit, and delete BAS projects with status, contacts, tags, and cascading cleanup |
| **Full CRUD** | Add, edit, and delete devices, IP entries, contacts, notes, and project metadata inline |
| **Quick Upload** | Global upload button in the top bar — upload any document from anywhere in the app, assign to a project or leave in the uploads inbox for later |
| **File Upload & Versioning** | Drag-and-drop upload with staged progress tracking, file type validation, retry on failure — panel databases (.pcl), wiring diagrams (.pdf), sequences (.txt/.pdf), backups (.pcl) |
| **Document Preview** | In-app preview for PDFs (iframe), images (PNG/JPG/SVG/WebP/GIF), and text files (TXT/CSV/JSON/XML) with download fallback for unsupported types |
| **General Documents** | Dedicated category for miscellaneous project files (PDFs, Word docs, Excel, images, ZIPs, proprietary BAS files) that don't fit standard categories |
| **Uploads Inbox** | Global document inbox for unassigned uploads — preview, download, assign to any project, or organize later |
| **IP Plan Management** | Full IP addressing table with VLAN, subnet, hostname, device role, and duplicate detection |
| **Device Inventory** | Track controllers, sensors, and actuators with BACnet instance, IP, MAC, and location |
| **Technician Notes** | Categorized field notes — issues, fixes, punch items, startup notes, network changes |
| **Activity Log** | Automatic audit trail of every project modification |
| **Offline Access** | Pin projects for full offline availability via IndexedDB and Service Worker |
| **PWA Install** | Install as a native app on any device — desktop, tablet, or phone |
| **Global Search** | Live search-as-you-type across all projects, files, devices, IP entries, and notes with debounced indexing, quick chips, and highlighted results |
| **Mobile-Ready** | Responsive design optimized for field use on phones and tablets |
| **Theme Switching** | System, light, and dark modes for any environment |
| **Contact Management** | Track site contacts — GC, TAB, mechanical, building engineer |
| **Daily Reports** | Structured daily field reports tied to projects — work completed, issues, coordination notes, equipment status, attachments, autosave drafts, and three-stage workflow (Draft → Submitted → Finalized) |
| **Report Export** | Export daily reports via Teams (markdown), Outlook (email with suggested subject), PDF (print-optimized), or JSON share package — reuses the project share infrastructure |
| **Share / Export** | Selective project sharing — Teams (markdown), Outlook (email), PDF (print), or JSON package with audience presets and sensitive data masking |
| **Network Diagram Builder** | Visual BAS network topology mapping — drag-and-drop nodes (controllers, routers, switches, servers, sensors, actuators, panels, workstations, gateways), draw connections with labels and styles, property editing panel, pan/zoom canvas, PNG and SVG export, per-project diagram storage |
| **Telnet HMI Tool** | Browser-based terminal for BAS controller access — WebSocket-to-Telnet proxy support, session logging, .txt export, project attachment, baud rate configuration, multiple session tabs, command history, connection history, and persistent session buffers that survive navigation |
| **Command Snippet Library** | Save and reuse terminal commands — categorized snippets (BACnet, LonWorks, Modbus, Niagara, Siemens, Johnson, Honeywell), search and filter, one-click insert into terminal, usage tracking, favorites |
| **Web Interface** | Access BAS controller web panels directly — saved endpoints with favorites, protocol/port/path configuration, embedded iframe workspace with honest browser security handling (X-Frame-Options, CSP, mixed content), new-tab fallback, project association, recent connections, JSON export, and persistent active workspace that survives navigation |
| **Ping Tool** | Reachability testing with dual mode — browser mode uses HTTP/HTTPS with optional BAS port scanning (80, 443, 8080, 8443, 47808/BACnet); desktop mode uses real ICMP ping with TTL and native TCP port checking. Single/repeated/multi-target modes, auto-detects desktop vs browser, helpful diagnostics, latency statistics, project association, result saving, and .txt export |
| **Desktop App** | Native desktop application via Tauri — real ICMP ping, direct TCP port checking, system-level network access over VPN, lightweight ~15 MB installer for Windows (.msi), macOS (.dmg), and Linux (.deb/.AppImage), auto-built via GitHub Actions CI |
| **Global Sticky Notepad** | Draggable floating scratchpad accessible from any page — drag the launcher icon anywhere on screen with persistent position, edge snapping, tabbed notes, minimize/restore, and offline persistence via Zustand |
| **Guided Tour** | Interactive step-by-step onboarding walkthrough with spotlight overlay — auto-launches on first visit, replayable from Help or Settings, mobile-friendly with clean sidebar state management |
| **Help Center** | Dedicated help page with getting started guide, feature guides, FAQ, troubleshooting, keyboard shortcuts, and best practices |
| **Storage Management** | Monitor IndexedDB usage, clear caches, manage offline storage |

---

## Screenshots

> Add screenshots to `docs/screenshots/` and they will render below.

<details>
<summary><strong>Dashboard</strong></summary>

![Dashboard](docs/screenshots/dashboard.png)
*Quick actions, pinned projects, active project cards, and recent activity at a glance.*

</details>

<details>
<summary><strong>Project Overview</strong></summary>

![Project Overview](docs/screenshots/project-overview.png)
*Project details, contacts, panel roster, network summary, and technician notes — all editable inline.*

</details>

<details>
<summary><strong>IP Plan</strong></summary>

![IP Plan](docs/screenshots/ip-plan.png)
*Full IP addressing table with VLAN, subnet, hostname, device role, status, and duplicate detection.*

</details>

<details>
<summary><strong>Device List</strong></summary>

![Device List](docs/screenshots/device-list.png)
*Device inventory with controller type, BACnet instance, IP address, location, and status tracking.*

</details>

<details>
<summary><strong>Offline Mode</strong></summary>

![Offline Mode](docs/screenshots/offline-mode.png)
*Pinned projects available offline with storage usage monitoring and cache management.*

</details>

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser / PWA                       │
├──────────────┬──────────────┬───────────────────────────┤
│   Next.js    │   Zustand    │      Service Worker       │
│  App Router  │    Store     │     (Offline Cache)       │
├──────────────┴──────────────┴───────────────────────────┤
│                  React Components                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Projects │ │ Devices  │ │ IP Plan  │ │   Notes   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                    Custom Hooks                           │
│              (useProjects, useProject,                    │
│         useProjectDevices, useProjectIpPlan)              │
├─────────────────────────────────────────────────────────┤
│                    IndexedDB (idb)                        │
│  ┌──────────┐ ┌───────┐ ┌───────┐ ┌────────┐ ┌──────┐  │
│  │ projects │ │ files │ │ notes │ │devices │ │ipPlan│  │
│  └──────────┘ └───────┘ └───────┘ └────────┘ └──────┘  │
│  ┌───────────┐ ┌─────────────┐ ┌──────────────┐            │
│  │ fileBlobs │ │ activityLog │ │ dailyReports │            │
│  └───────────┘ └─────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────┘
```

**Data flow:** UI Components → Custom Hooks → IndexedDB → Browser Storage

**State layers:**
- **Zustand** — UI preferences (theme, sidebar, recent items, search history) persisted to localStorage
- **React hooks** — data fetching and mutation via IndexedDB
- **IndexedDB** — all project data, files, notes, devices, IP plans, and activity logs
- **Service Worker** — app shell caching for offline availability

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 16 |
| **Language** | TypeScript | 5 |
| **Styling** | Tailwind CSS | 4 |
| **UI Components** | shadcn/ui + Base UI | — |
| **State** | Zustand (with persist) | 5 |
| **Local Storage** | IndexedDB via `idb` | 8 |
| **Icons** | Lucide React | — |
| **Dates** | date-fns | 4 |
| **Toasts** | Sonner | 2 |
| **Themes** | next-themes | — |
| **Offline** | Service Worker + IndexedDB | — |
| **Desktop** | Tauri (Rust backend) | 2 |
| **Deployment** | Vercel / GitHub Releases | — |

---

## Installation

### Prerequisites

- **Node.js** 18.17 or later
- **npm** 9+ (or pnpm / yarn)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/Portable-BAS-Toolkit.git
cd Portable-BAS-Toolkit

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> On first launch, the app auto-seeds demo project data so you can explore immediately.

### Production Build

```bash
npm run build
npm start
```

---

## Development Setup

### Environment Variables

Create a `.env.local` file in the project root if needed:

```env
# Base URL for OG image resolution (optional — defaults to localhost in dev)
NEXT_PUBLIC_URL=https://your-domain.vercel.app
```

The application is **fully offline-first** — no external API keys or database credentials are required. All data is stored locally in IndexedDB.

### Dev Server Configuration

The dev server is configured in `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "next-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

### Code Quality

```bash
# Lint the codebase
npm run lint

# Type check
npx tsc --noEmit

# Production build (includes type checking)
npm run build
```

---

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout — providers, metadata, fonts
│   ├── page.tsx                  # Dashboard — quick actions, pinned projects, stats
│   ├── globals.css               # Global styles and Tailwind config
│   ├── projects/
│   │   ├── page.tsx              # Project list — search, filter, create
│   │   └── [id]/
│   │       └── page.tsx          # Project detail — tabbed sections
│   ├── reports/
│   │   ├── page.tsx              # Daily reports list — search, filter, status
│   │   ├── new/
│   │   │   └── page.tsx          # Create new daily report
│   │   └── [id]/
│   │       ├── page.tsx          # Report detail view — sections, export, delete
│   │       └── edit/
│   │           └── page.tsx      # Edit existing report
│   ├── terminal/
│   │   └── page.tsx              # Telnet HMI terminal tool
│   ├── web-interface/
│   │   └── page.tsx              # Web Interface panel access tool
│   ├── search/
│   │   └── page.tsx              # Global search across all data
│   ├── settings/
│   │   └── page.tsx              # Theme, storage, cache management
│   ├── help/
│   │   └── page.tsx              # Help center — guides, FAQ, troubleshooting
│   └── offline/
│       └── page.tsx              # Offline projects and storage monitor
│
├── components/
│   ├── layout/                   # App shell, sidebar, top bar
│   ├── ui/                       # shadcn/ui component library
│   ├── projects/                 # Project dialogs and activity timeline
│   ├── devices/                  # Device list, IP plan, entry dialogs
│   ├── files/                    # File list, upload dialog, download
│   ├── notes/                    # Field notes view
│   ├── reports/                  # Daily report form, export dialog
│   ├── notepad/                  # Global floating sticky notepad
│   ├── share/                    # Share/export wizard, formatters, PDF view
│   ├── onboarding/               # Guided tour overlay and step definitions
│   ├── shared/                   # Error boundary, empty states, confirm dialog
│   └── theme/                    # Theme provider and switcher
│
├── hooks/
│   ├── use-projects.ts           # All data hooks — CRUD for every entity
│   └── use-keyboard-shortcut.ts  # Cmd+K search shortcut
│
├── lib/
│   ├── db.ts                     # IndexedDB schema, queries, and mutations
│   ├── demo-data.ts              # Auto-seeded sample data for first launch
│   └── utils.ts                  # Tailwind class merge utility
│
├── store/
│   ├── app-store.ts              # Zustand store — theme, sidebar, recent items
│   ├── notepad-store.ts          # Zustand store — sticky notepad tabs and state
│   ├── terminal-store.ts         # Zustand store — terminal sessions and settings
│   └── web-interface-store.ts    # Zustand store — web endpoints and connections
│
└── types/
    └── index.ts                  # All TypeScript interfaces and enums

public/
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
├── favicon.ico                   # Browser favicon
├── icons/                        # PWA icon set (72–1024px, maskable, monochrome)
├── favicons/                     # Multi-size favicons (16, 32, 48)
└── og/                           # Open Graph and social preview images

scripts/
└── generate-icons.mjs            # Icon asset generation from SVG sources
```

---

## Core Feature Breakdown

### Projects

The central organizing unit. Each project represents a BAS job site or system and contains:
- Metadata (name, project number, customer, site address, building/area) — all editable after creation
- Status tracking (active, on-hold, completed, archived)
- Site contacts with role, company, phone, and email — add, edit, delete inline
- Tags for categorization and filtering
- Panel roster summary and network summary — inline editable
- Technician notes — inline editable
- Full project deletion with confirmation dialog and cascading cleanup of all related data

### Project Tabs

Each project has a tabbed interface:

| Tab | Purpose |
|-----|---------|
| **Overview** | Project details, contacts, panel roster, network summary, tech notes — all inline-editable with quick actions |
| **Panel DBs** | Uploaded panel database files with version history |
| **Wiring** | Wiring diagram documents with revision tracking |
| **Sequences** | Sequence of operation documents |
| **IP Plan** | Network addressing table — IP, hostname, VLAN, subnet, device role, MAC, status |
| **Devices** | Device inventory — name, controller type, BACnet instance, IP, floor, area, status |
| **Backups** | Controller backups and configuration snapshots |
| **Notes** | Categorized field notes (issues, fixes, punch items, startup notes, network changes) |
| **Activity** | Chronological audit trail of all project modifications |

### IP Plan

Full IP address management with:
- IPv4 validation
- Duplicate IP detection with warnings
- VLAN and subnet tracking
- Device role assignment
- Status tracking (active, reserved, available, conflict)
- Sortable and searchable table

### Device Inventory

Track every BAS device on the project:
- Device name and description
- System assignment (HVAC, lighting, etc.)
- Panel and controller type (e.g., PXC36.1-E.D)
- BACnet instance number
- IP and MAC address
- Floor and area location
- Status (Online, Offline, Issue, Not Commissioned)

### Global Search

Full-text search across:
- Project names, numbers, and metadata
- File titles and tags
- Field note content
- Device names and descriptions
- IP addresses and hostnames

Results are highlighted and grouped by type.

### Daily Reporting

Structured field reporting for documenting daily progress:

- **Report creation** — project selector, date, technician name, auto-numbered reports
- **Content sections** — work completed, issues encountered, work planned next, coordination notes, equipment/systems worked on, device/IP changes, safety notes, general notes
- **Time tracking** — start/end time, hours on site, location, weather
- **Attachments** — upload images, PDFs, and documents directly to reports
- **Workflow status** — Draft → Submitted → Finalized with read-only protection for finalized reports
- **Autosave** — drafts automatically saved every 30 seconds
- **Export/Share** — Teams markdown, Outlook email, PDF print, or JSON share package

### Exporting Daily Reports

Reports can be exported in four formats, using the same share infrastructure as project exports:

| Format | Output |
|--------|--------|
| **Teams** | Markdown message with all report sections, ready to paste |
| **Outlook** | Subject line (`Daily Report – [Project] – [Date]`) + formatted email body |
| **PDF** | Print-optimized view with professional formatting |
| **Share Package** | JSON bundle with report data and project metadata |

### Telnet HMI Tool

A browser-based terminal interface for connecting to BAS controllers and panels:

- **Terminal emulator** — dark-themed, monospace terminal with scrollback buffer, command input, and live output stream
- **Connection panel** — host/IP, port, baud rate (9600–115200), local echo, and line mode configuration
- **Session tabs** — open multiple concurrent terminal sessions, each with independent connection, buffer, and log state
- **Session control** — connect, disconnect, reconnect, clear buffer, pause/resume output
- **Buffer management** — configurable buffer size (100–10,000 lines) to prevent memory overload
- **Session logging** — timestamped output capture with toggle control
- **Export** — download session logs as `.txt` files with full metadata (host, port, baud, timestamps)
- **Project integration** — attach session logs directly to any project via file blob storage
- **Command history** — arrow-key recall of previously entered commands (up to 50)
- **Connection history** — recent connections with quick-reconnect, persisted across sessions
- **WebSocket proxy architecture** — designed for WebSocket-to-Telnet proxy bridging; falls back to local-mode logging when no proxy is available

### Web Interface

A panel web access console for connecting to BAS controller web interfaces:

- **Launch form** — protocol (HTTP/HTTPS), host/IP, port, path, and open mode (auto, embedded, new tab) with live URL preview
- **Embedded workspace** — iframe-based web panel viewer with loading indicator, reload, and open-in-new-tab controls
- **Honest security handling** — detects X-Frame-Options, CSP, and mixed content blocks; shows clear explanations and automatic new-tab fallback instead of broken iframes
- **Saved endpoints** — save frequently-used controller web panels with friendly names, tags, and notes
- **Favorites** — star endpoints for quick access; favorites sort to top
- **Project association** — link endpoints to projects for organized access
- **Recent connections** — last 20 connections with one-click relaunch
- **Search & filter** — search saved endpoints by name, host, tags, or notes
- **Export** — download saved endpoints as JSON for backup or sharing
- **Security guidance** — collapsible panel explaining browser limitations (same-origin policy, mixed content, HTTPS requirements) with practical workarounds

### Global Sticky Notepad

A persistent floating scratchpad accessible from any page in the application:

- **Draggable launcher** — drag the FAB icon anywhere on screen; position persists across pages, reloads, and browser restarts via localStorage
- **Click vs drag detection** — movement threshold distinguishes taps/clicks from drags; no accidental opens when repositioning
- **Edge snapping** — launcher snaps to the nearest left/right edge when dropped nearby for a clean resting position
- **Viewport safety** — launcher stays within visible bounds; automatically repositions on window resize or orientation change
- **Floating panel** — opens from the launcher; panel itself is also draggable on desktop; mobile uses a bottom-sheet layout
- **Tabbed notes** — create, rename (double-click), reorder, and close multiple note tabs
- **Plain-text editor** — monospace font optimized for IP addresses, commands, device numbers, and quick documentation
- **Minimize / restore** — collapse to a small draggable pill without losing state; pill shares the launcher's persisted position
- **Reset position** — reset button in the panel header returns the launcher to its default bottom-right position
- **Offline persistence** — all tabs, content, and launcher position persist via Zustand localStorage across page refreshes, route changes, and offline sessions
- **Delete protection** — confirmation prompt when closing a tab that contains content
- **Theme-aware** — follows light/dark/system theme automatically

---

## PWA Capabilities

BAU Suite is a fully installable Progressive Web App:

- **Installable** — add to home screen on iOS, Android, Windows, macOS, ChromeOS
- **Offline-capable** — Service Worker caches the app shell for instant loading
- **App-like experience** — standalone display mode, no browser chrome
- **Maskable icons** — adaptive icons that look native on any launcher
- **Theme-aware** — respects system light/dark preference

### How to install

**Desktop (Chrome/Edge):** Click the install icon in the address bar, or use the browser menu.

**iOS Safari:** Tap Share → Add to Home Screen.

**Android Chrome:** Tap the install banner or use the browser menu → Install App.

---

## Desktop App

BAU Suite is also available as a native desktop application built with [Tauri](https://v2.tauri.app/), providing capabilities that browsers cannot offer:

### What you get

| Feature | Browser (PWA) | Desktop (Tauri) |
|---------|:---:|:---:|
| All BAU Suite tools | Yes | Yes |
| Offline data (IndexedDB) | Yes | Yes |
| Real ICMP ping | No | Yes |
| Direct TCP port checking | No | Yes |
| VPN network access | Via HTTP only | Full system-level |
| Install size | ~0 MB (browser) | ~15 MB |

### How to install

Download the latest installer from [GitHub Releases](https://github.com/calebohara/Portable-BAS-Toolkit/releases):

- **Windows:** `.msi` installer
- **macOS (Apple Silicon):** `.dmg` (M1/M2/M3/M4)
- **macOS (Intel):** `.dmg` (x86_64)
- **Linux:** `.deb` package or `.AppImage`

### How to build locally

```bash
npm run tauri:dev      # Development mode with hot reload
npm run tauri:build    # Production build (.app/.dmg on macOS, .msi on Windows, .deb/.AppImage on Linux)
```

Requires [Rust](https://rustup.rs/) and platform build tools (Xcode CLI on macOS, Visual Studio Build Tools on Windows).

### CI/CD

Desktop builds are automated via GitHub Actions. Push a version tag to trigger a release:

```bash
git tag v2.x.x
git push origin v2.x.x
```

This builds all platform targets in parallel and creates a draft GitHub Release with installers attached.

---

## Offline-First Design

Every piece of data in BAU Suite is stored locally in the browser via **IndexedDB**. This is critical for field engineers who frequently work in:

- Mechanical rooms with no Wi-Fi
- Construction sites with unreliable connectivity
- Secure facilities that restrict internet access
- Remote locations without cellular service

### How it works

1. **IndexedDB** stores all projects, files, notes, devices, IP plans, and activity logs locally
2. **Service Worker** caches the application shell (HTML, CSS, JS) for instant offline loading
3. **File blobs** can be cached locally for offline document access
4. **Zustand persist** keeps UI preferences in localStorage

### Offline management

The `/offline` page provides:
- List of projects marked for offline availability
- Storage usage monitoring (quota and usage)
- Cache clearing controls
- Per-project offline toggle

---

## Usage Guide

### Quick workflow

1. **Create a project** — name, project number (44OP-XXXXXX), customer, site address
2. **Add contacts** — GC, TAB contractor, mechanical, building engineer
3. **Upload files** — panel databases, wiring diagrams, sequences, backups
4. **Build the IP plan** — add every controller with IP, hostname, VLAN, subnet
5. **Track devices** — log each BAS controller with type, instance, location
6. **Record field notes** — document issues, fixes, punch items, startup observations
7. **Pin for offline** — mark the project for offline availability before heading to site

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open global search |

---

## BAS Workflow Example

**Scenario: Commissioning an AHU Controls Upgrade**

```
1. Create Project
   → "AHU-1/2 Controls Upgrade"
   → Project # 44OP-001234
   → Customer: Memorial Regional Hospital
   → Site: 3501 Johnson St, Hollywood, FL

2. Add Contacts
   → John Smith — GC, ABC Construction, 555-0101
   → Maria Garcia — TAB, Air Balance Inc, 555-0202

3. Upload Panel Databases
   → PXC36-AHU1 controller backup (Rev 1)
   → PXC36-AHU2 controller backup (Rev 1)

4. Build IP Plan
   → 10.40.1.10 — PXC36-AHU1 — VLAN 100 — Active
   → 10.40.1.11 — PXC36-AHU2 — VLAN 100 — Active
   → 10.40.1.1  — Gateway    — VLAN 100 — Active

5. Add Devices
   → AHU-1-MAT — Mixed Air Temp — PXC36.1-E.D — Instance 300001
   → AHU-1-DAT — Discharge Temp — PXC36.1-E.D — Instance 300002

6. Record Field Notes
   → [startup-note] Phase 1 startup complete, AHU-1 running in auto
   → [issue] AHU-2 mixed air damper actuator binding at 60%
   → [fix] Replaced actuator linkage, damper now full stroke

7. Write Daily Report
   → Work Completed: AHU-1 startup, all points verified
   → Issues: AHU-2 damper actuator binding at 60%
   → Work Planned: Replace actuator linkage tomorrow
   → Export to Teams for PM status update

8. Access Offline at Site
   → Pin project → drive to job site → open app → full data available
```

---

## Configuration

### Theme

Three modes available via Settings or the top bar toggle:
- **System** — follows OS preference
- **Light** — optimized for bright environments
- **Dark** — optimized for mechanical rooms and low-light field work

### Storage

The Settings page provides:
- **Storage usage** — current IndexedDB size vs. browser quota
- **Clear file cache** — remove cached file blobs to free space
- **Clear all data** — full reset (requires confirmation)

### Project Number Format

Projects use the **44OP-XXXXXX** format by default. The input provides soft validation — non-matching formats show a warning but are not blocked.

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect the GitHub repository directly in the [Vercel Dashboard](https://vercel.com/new) for automatic deployments on push.

### Environment Variables (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_URL` | No | Base URL for OG image resolution. Defaults to the Vercel deployment URL. |

### Build Output

```bash
npm run build
```

Produces an optimized production build with:
- Static pages pre-rendered
- Dynamic routes server-rendered on demand
- Service Worker for offline caching
- All icon and OG assets in `/public`

---

## Roadmap

Future enhancements under consideration:

| Feature | Description |
|---------|-------------|
| **BACnet Network Scanner** | Discover devices on the local BACnet/IP network |
| **Panel Configuration Library** | Reusable controller templates and standard configurations |
| **Drive Configuration Tools** | VFD parameter sheets and commissioning checklists |
| **Loop Tuning Utilities** | PID tuning calculators and trend logging |
| **PDF Annotation** | Mark up wiring diagrams and sequences directly in-browser |
| **Project Export Bundles** | Export complete project as a shareable archive (.zip) — *partial: JSON share packages and endpoint export available in v2.2.0* |
| **Cloud Sync** | Optional Supabase backend for cross-device synchronization |
| **Role-Based Access** | Multi-user support with permission levels |
| **BACnet Object Browser** | Read/write BACnet object properties from the field |
| **Sequence Diagram Viewer** | Visual rendering of control sequences |

---

## Contributing

Contributions are welcome. To contribute:

```bash
# 1. Fork the repository

# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes with clear, focused commits
git commit -m "Add BACnet scanner utility"

# 4. Push to your fork
git push origin feature/your-feature-name

# 5. Open a Pull Request
```

### Guidelines

- Write TypeScript with strict types — no `any` unless absolutely necessary
- Follow existing component patterns and file structure
- Test on mobile viewport — field engineers use phones and tablets
- Ensure offline compatibility — do not introduce external API dependencies without fallback
- Keep commits focused and descriptive

---

## Typography

The application uses **Inter** as its primary typeface — a clean, geometric sans-serif designed for technical interfaces with excellent readability at all sizes. Inter provides metrics closely matching Siemens Sans while being freely available via Google Fonts.

| Context | Font | Weight |
|---------|------|--------|
| **UI Text** | Inter | 400 (Regular) |
| **Labels & Nav** | Inter | 500 (Medium) |
| **Headings** | Inter | 600–700 (Semibold–Bold) |
| **Code / Technical** | JetBrains Mono | 400 |

Fonts are loaded via `next/font/google` with `display: swap` for zero layout shift.

---

## Application Versioning

The version is tracked in three synchronized locations:

| Location | Format | Source |
|----------|--------|--------|
| `package.json` | `"version": "2.4.1"` | Source of truth |
| Sidebar footer | `v2.4.1` | Read from `NEXT_PUBLIC_APP_VERSION` at build time |
| Settings → About | `Version 2.4.0` | Read from `NEXT_PUBLIC_APP_VERSION` at build time |

The version follows [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking changes or major redesigns
- **MINOR** — new features, backward-compatible
- **PATCH** — bug fixes and minor improvements

`next.config.ts` injects the version from `package.json` as an environment variable at build time, ensuring the UI always matches the repository version.

---

## Security

BAU Suite is an **offline-first, local-only** application with no backend server, no authentication, and no cloud database. All data lives exclusively in the user's browser via IndexedDB and localStorage.

### Browser Security Headers

All responses include Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, and Strict-Transport-Security headers configured in `next.config.ts`.

### Hardening Measures

- **Input escaping** — all user input rendered via React JSX auto-escaping; print/export titles explicitly HTML-escaped
- **URL validation** — Web Interface tool only allows `http://` and `https://` protocols; blocks `javascript:`, `data:`, and other dangerous schemes
- **File safety** — filenames sanitized against path traversal; PDF previews use sandboxed iframes; SVGs rendered as images only
- **Window isolation** — all external window.open calls use `noopener,noreferrer`; iframes include `referrerpolicy="no-referrer"`
- **Service worker** — only caches same-origin GET requests; never caches opaque/error responses; size-limited dynamic cache

### Usage Guidelines

- **Do not store sensitive credentials** (passwords, API keys) in project notes or sticky notepad
- **Sanitize controller backups** before sharing — remove passwords and credentials
- **Review exported files** before publishing or emailing
- **Browser storage is not encrypted at rest** — use device-level encryption for sensitive environments
- **Clear data** via Settings before transferring a device to another user

For full details, see [SECURITY.md](SECURITY.md).

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Acknowledgements

Built for the building automation community:

- **BAS field engineers** who carry project data between job sites every day
- **Siemens controls technicians** and the broader BAS community
- **Open source ecosystem** — Next.js, Tailwind CSS, shadcn/ui, Zustand, and the teams behind them

---

<div align="center">

**BAU Suite** — *Keep your projects portable.*

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/Portable-BAS-Toolkit)

</div>
