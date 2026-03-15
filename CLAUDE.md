# CLAUDE.md — BAU Suite Project Guide

## Project Overview

**BAU Suite** is a portable project toolkit for Building Automation Systems (BAS) field work. It runs in three modes:

1. **Web app** — Next.js server mode, deployed with full API routes and SSR
2. **Static export** — `output: 'export'` for embedding in Tauri
3. **Desktop app** — Tauri v2 wrapper around the static export (Windows + macOS)

The app is **offline-first** with IndexedDB (`idb` library) for local storage and optional Supabase cloud sync.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui, `cva`, `clsx`, `tailwind-merge` |
| State | Zustand (`useAppStore`) |
| Auth & DB | Supabase (auth + Postgres + Storage) |
| Offline DB | IndexedDB via `idb` (`BasToolkitDB` schema in `src/lib/db.ts`) |
| Desktop | Tauri v2 (Rust backend) |
| Icons | lucide-react |
| Toasts | sonner |
| Payments | Stripe |

## Key Commands

```bash
npm run dev          # Next.js dev server (web mode)
npm run build        # Production web build
npm run build:static # Static export for Tauri (excludes API routes)
npm run lint         # ESLint
npm run tauri:dev    # Tauri dev mode (loads localhost:3000)
npm run tauri:build  # Tauri production build (uses static export)
```

## Architecture — Critical Patterns

### Tri-Mode Build System

- `next.config.ts` checks `TAURI_BUILD=1` to toggle `output: 'export'`
- `scripts/build-static.js` temporarily moves `src/app/api/` out before static build (API routes are server-only), then restores it. It also clears `.next` cache to prevent stale type validator errors.
- Version is injected via `NEXT_PUBLIC_APP_VERSION` from `npm_package_version`

### CSP Split

- **Web CSP**: Defined in `next.config.ts` headers (only applied in server mode). Explicitly lists Supabase domains, Stripe, GitHub API.
- **Desktop CSP**: Defined in `src-tauri/tauri.conf.json` under `app.security.csp`. Uses broad `connect-src 'self' ws: wss: http: https:` for API calls, and explicitly allows `https://*.supabase.co` in `img-src` for avatar images.

### Supabase Client Architecture

- **Browser client** (`src/lib/supabase/client.ts`): Singleton via `getSupabaseClient()`. Returns `null` when env vars missing (local-only mode). Uses `localStorage` for session persistence (works in both web and Tauri).
- **Admin client** (`src/lib/supabase/server.ts`): Uses `SUPABASE_SERVICE_ROLE_KEY` (server-only secret). Only available in API routes, never in Tauri.
- **No cookies/SSR auth**: Auth is entirely client-side, no `@supabase/ssr` `createBrowserClient`.
- `isSupabaseConfigured()` checks if env vars are present.

### Auth Modes

- `'local'` — No Supabase, offline-only (when env vars missing)
- `'authenticated'` — Signed in with Supabase auth
- Auth provider: `src/providers/auth-provider.tsx`
- Profiles table: `profiles` with `first_name`, `last_name`, `display_name`, `avatar_url`, `approved`, `role` (user/admin)

### Desktop vs Web Detection

```typescript
// Runtime detection (src/lib/tauri-bridge.ts)
isTauri()  // checks '__TAURI_INTERNALS__' in window

// Hook with richer context (src/hooks/use-device-class.ts)
useDeviceClass()  // returns { isTauriRuntime, deviceClass, desktopOS, isWindowsDesktopWeb }
```

### API Routes (Web-Only)

These exist in `src/app/api/` and are **stripped from static export**:

| Route | Purpose | Requires |
|---|---|---|
| `/api/admin/users` | Admin user approval panel | `SUPABASE_SERVICE_ROLE_KEY` |
| `/api/account/delete` | Account deletion | `SUPABASE_SERVICE_ROLE_KEY` |
| `/api/donate/checkout` | Stripe checkout | Stripe keys |
| `/api/donate/webhook` | Stripe webhook | Stripe keys |

In Tauri, features that need API routes must use direct Supabase client calls instead. The `AdminApprovalPanel` in `src/app/settings/page.tsx` demonstrates this pattern: it detects `isTauri()` and queries the `profiles` table directly rather than calling `/api/admin/users`.

### Routing in Static Export

- Dynamic routes use catch-all fallback pages (e.g., `/projects/_/index.html`)
- `src/lib/routes.ts` provides Tauri-aware navigation helpers
- In Tauri mode, navigation uses `window.location.href` (hard navigation) instead of `router.push()` to work with static export
- Route pattern: `/projects/_/?_id={uuid}` instead of `/projects/{uuid}`

## Release / CI Process

- **Trigger**: Push a `v*` tag (e.g., `v4.4.0`) or manual `workflow_dispatch`
- **Workflow**: `.github/workflows/release.yml`
- **Matrix**: Windows + macOS (aarch64 + x86_64)
- **Build**: Node 22, Rust stable, `npm ci`, then `tauri-apps/tauri-action`
- **Output**: GitHub Release with MSI (Windows), DMG (macOS), and `latest.json` for auto-updates
- **Secrets needed**: `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Auto-update**: Tauri updater checks `https://github.com/calebohara/Portable-BAS-Toolkit/releases/latest/download/latest.json`

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # Server-only API routes (excluded from static build)
│   ├── dashboard/          # Main dashboard
│   ├── projects/           # Project management
│   ├── global-projects/    # Shared/team projects
│   ├── settings/           # Settings (account, admin, theme, storage)
│   ├── login/              # Auth pages
│   ├── register-tool/      # Device registration
│   ├── network-diagram/    # Network diagrams
│   ├── ping/               # ICMP ping tool
│   ├── terminal/           # HMI/Telnet/Serial terminal
│   ├── reports/            # Report generation
│   ├── knowledge-base/     # Knowledge base
│   ├── documents/          # Document management
│   ├── search/             # Global search
│   └── ...
├── components/             # React components
│   ├── ui/                 # shadcn/ui primitives
│   ├── layout/             # Top bar, sidebar, online users
│   ├── settings/           # Settings dialogs
│   └── shared/             # Shared components
├── hooks/                  # Custom React hooks
├── lib/                    # Core utilities
│   ├── db.ts               # IndexedDB schema & operations
│   ├── supabase/           # Supabase client setup
│   ├── sync/               # Cloud sync engine
│   ├── tauri-bridge.ts     # Desktop API bridge (ICMP, TCP, serial, shell)
│   ├── routes.ts           # Route helpers (Tauri-aware)
│   ├── version.ts          # Version + update checker
│   └── ...
├── providers/              # React context providers
│   ├── auth-provider.tsx   # Auth state management
│   └── sync-provider.tsx   # Sync state management
├── store/                  # Zustand stores
│   └── app-store.ts
src-tauri/                  # Tauri Rust backend
├── src/main.rs             # Rust commands (ICMP ping, TCP check, serial, telnet)
├── tauri.conf.json         # Tauri config (CSP, window, updater, bundle)
├── capabilities/           # Tauri v2 capability permissions
└── Cargo.toml              # Rust dependencies
scripts/
└── build-static.js         # Static export build script (API exclusion)
```

## Path Alias

```
@/* → ./src/*
```

## Common Pitfalls

1. **Supabase env vars must be set at build time** for the desktop app. They're `NEXT_PUBLIC_*` so they're baked into the static export. If missing, `getSupabaseClient()` returns `null` and the app runs in local-only mode.

2. **API routes don't exist in Tauri**. Any feature that calls `/api/*` must have a Tauri fallback using direct Supabase client calls. The `handleDeny` (user deletion) operation cannot work in Tauri because it requires `SUPABASE_SERVICE_ROLE_KEY`.

3. **CSP for Tauri images**. If loading images from external sources (like Supabase Storage), the domain must be in `img-src` in `tauri.conf.json`. The `connect-src` is already broad (`http: https:`), so API calls work fine.

4. **Static export routing**. Don't use `router.push()` for dynamic routes in Tauri — use `window.location.href` with the `routes.ts` helpers. Dynamic routes use the catch-all `_` pattern with `?_id=` query params.

5. **Version bumping**. Update version in: `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. The `NEXT_PUBLIC_APP_VERSION` is auto-derived from `package.json`.

6. **Auth redirects in Tauri**. Email confirmation and password reset use `window.location.origin` as redirect URL, which in Tauri is `tauri://localhost`. These flows may not work in the desktop app without custom protocol handling.

7. **The `.next` cache can cause static build failures**. The `build-static.js` script clears it before building to prevent stale type validators from referencing excluded API routes.
