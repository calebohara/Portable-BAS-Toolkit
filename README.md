<div align="center">

# BAU Suite

### The Field Platform for Building Automation

*Manage projects, run diagnostics, document fieldwork, and collaborate — online or offline.*

[![Version](https://img.shields.io/badge/Version-4.1.0-00BCD4?style=flat-square)](#versioning)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](#pwa)
[![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?style=flat-square&logo=tauri&logoColor=white)](#desktop-app)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

</div>

---

## What's New in v4.1.0

- **Global Projects** — Multi-user collaborative project management with Supabase. Create shared projects, invite team members via access codes, and work together with full audit trails.
- **Share Local → Global** — Migrate any local project to a Global Project with one click. Notes, devices, IP entries, and daily reports are transferred automatically.
- **Daily Report Linking** — Link daily reports from your profile directly to a Global Project via a toggle switch.
- **Full Global CRUD** — Edit projects (admin), edit/delete reports (creator-only), documents tab, files, notes, devices, and IP entries — all with activity logging and RLS enforcement.

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

### Global Projects (NEW)
- **Multi-user collaboration** — shared projects powered by Supabase with Row Level Security
- **Access codes** — invite team members with a generated code, no email exchange needed
- **Full feature parity** — notes, devices, IP plan, daily reports, documents, and files
- **Share local → global** — migrate an existing local project with all data in one click
- **Activity tracking** — every change logged with before/after diffs and creator attribution
- **Role-based access** — admin and member roles with creator-only edit/delete on content

### Daily Reports
- Structured field reports with work completed, issues, coordination notes, equipment, and attachments
- Three-stage workflow: Draft → Submitted → Finalized
- Link reports to Global Projects via toggle switch
- Export to Teams, Outlook, PDF, or JSON

### Network & Device Tools
- **IP Plan** — full addressing table with VLAN, subnet, hostname, duplicate detection
- **Device Inventory** — controllers, sensors, actuators with BACnet instance, IP, MAC, location
- **Ping Tool** — HTTP and ICMP (desktop) reachability with port scanning
- **Network Diagram Builder** — drag-and-drop topology mapping with PNG/SVG export
- **Protocol Converter** — hex/decimal/binary, IEEE 754, byte order, Modbus addressing, bitmask tool

### Access & Diagnostics
- **Web Interface** — access BAS controller web panels with saved endpoints and security handling
- **HMI Terminal** — browser-based Telnet terminal with session tabs, logging, and command history
- **Command Snippets** — reusable commands for BACnet, Modbus, Niagara, Siemens, and more

### Platform
- **Offline-first** — all data in IndexedDB, works without Wi-Fi
- **PWA installable** — add to home screen on any device
- **Desktop app** — native Tauri app with real ICMP ping and full network access
- **Global search** — search across all projects, files, devices, IP entries, and notes
- **Sticky notepad** — draggable floating scratchpad with tabbed notes
- **Guided tour** — interactive onboarding walkthrough

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
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
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
| **Deployment** | Vercel / GitHub Releases |

---

## Desktop App

Native desktop app via [Tauri](https://v2.tauri.app/) with capabilities browsers can't provide:

| Feature | Browser | Desktop |
|---------|:---:|:---:|
| All BAU Suite tools | ✓ | ✓ |
| Real ICMP ping | — | ✓ |
| Direct TCP port checking | — | ✓ |
| VPN network access | HTTP only | Full |
| Install size | ~0 MB | ~15 MB |

Download from [GitHub Releases](https://github.com/calebohara/Portable-BAS-Toolkit/releases) — Windows (.msi), macOS (.dmg), Linux (.deb/.AppImage).

```bash
npm run tauri:dev      # Dev mode
npm run tauri:build    # Production build
```

---

## Authentication & Cloud

Supabase-powered authentication is **optional**. Without it, the app runs fully local.

| Feature | Status |
|---------|--------|
| Email/password auth | ✓ Active |
| Password reset | ✓ Active |
| User profiles | ✓ Active |
| Global Projects (multi-user) | ✓ Active |
| Row Level Security | ✓ Active |
| Local project data sync | Planned |

### Security

- All tables have Row Level Security enabled
- Browser security headers (CSP, HSTS, X-Frame-Options) configured
- Input escaping, URL validation, file sanitization, window isolation
- See [SECURITY.md](SECURITY.md) for full details

---

## PWA

Installable Progressive Web App:

- **Desktop:** Click install icon in Chrome/Edge address bar
- **iOS:** Share → Add to Home Screen
- **Android:** Install banner or menu → Install App

---

## Versioning

**Current: v4.1.0** — synchronized across `package.json`, `tauri.conf.json`, `Cargo.toml`, and the app UI.

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

---

<div align="center">

**BAU Suite** — *Keep your projects portable.*

Built by [Caleb O'Hara](https://www.calebblaze.com)

</div>
