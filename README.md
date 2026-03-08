<div align="center">

# BAU Suite

### Portable Project Toolkit for Building Automation Systems

*A field-ready project container for BAS engineers and technicians.*
*Organize panel databases, IP plans, device inventories, wiring diagrams, and field notes — online or offline.*

[![Version](https://img.shields.io/badge/Version-1.2.1-00BCD4?style=flat-square)](#application-versioning)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](#pwa-capabilities)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## Version

**Current Release: v1.2.1**

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
| **File Upload & Versioning** | Drag-and-drop upload with file type validation — panel databases (.pcl), wiring diagrams (.pdf), sequences (.txt/.pdf), backups (.pcl) |
| **IP Plan Management** | Full IP addressing table with VLAN, subnet, hostname, device role, and duplicate detection |
| **Device Inventory** | Track controllers, sensors, and actuators with BACnet instance, IP, MAC, and location |
| **Technician Notes** | Categorized field notes — issues, fixes, punch items, startup notes, network changes |
| **Activity Log** | Automatic audit trail of every project modification |
| **Offline Access** | Pin projects for full offline availability via IndexedDB and Service Worker |
| **PWA Install** | Install as a native app on any device — desktop, tablet, or phone |
| **Global Search** | Search across all projects, files, devices, IP entries, and notes instantly |
| **Mobile-Ready** | Responsive design optimized for field use on phones and tablets |
| **Theme Switching** | System, light, and dark modes for any environment |
| **Contact Management** | Track site contacts — GC, TAB, mechanical, building engineer |
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
│  ┌───────────┐ ┌─────────────┐                           │
│  │ fileBlobs │ │ activityLog │                           │
│  └───────────┘ └─────────────┘                           │
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
| **Deployment** | Vercel | — |

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
│   ├── search/
│   │   └── page.tsx              # Global search across all data
│   ├── settings/
│   │   └── page.tsx              # Theme, storage, cache management
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
│   └── app-store.ts              # Zustand store — theme, sidebar, recent items
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

7. Access Offline at Site
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
| **Project Export Bundles** | Export complete project as a shareable archive (.zip) |
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
| `package.json` | `"version": "1.2.1"` | Source of truth |
| Sidebar footer | `v1.2.1` | Read from `NEXT_PUBLIC_APP_VERSION` at build time |
| Settings → About | `Version 1.2.1` | Read from `NEXT_PUBLIC_APP_VERSION` at build time |

The version follows [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking changes or major redesigns
- **MINOR** — new features, backward-compatible
- **PATCH** — bug fixes and minor improvements

`next.config.ts` injects the version from `package.json` as an environment variable at build time, ensuring the UI always matches the repository version.

---

## Security Notes

This application stores all data locally in the browser. Keep the following in mind:

- **Do not upload confidential customer data** to public or shared instances
- **Sanitize controller backups** before sharing — remove passwords and credentials
- **Review exported files** before publishing or emailing
- **Browser storage is not encrypted** — do not store sensitive passwords or keys in project notes
- **Clear data** before transferring a device to another user

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
