# DEPLOYMENT.md — Build, Release & Auto-Update

BAU Suite ships in three modes: web server, static export, and desktop app (Tauri). This document covers how to build each mode, cut a release, and how auto-updates work.

---

## Build Modes

### 1. Web App (Next.js Server)

```bash
npm run dev          # Development server on localhost:3000
npm run build        # Production build (SSR + API routes)
npm start            # Serve production build
```

- Full Next.js with SSR and API routes (`src/app/api/`)
- CSP headers defined in `next.config.ts`
- Requires server-side env vars for API routes (`SUPABASE_SERVICE_ROLE_KEY`, Stripe keys)

### 2. Static Export (for Tauri embedding)

```bash
npm run build:static    # Runs scripts/build-static.js
```

This mode sets `output: 'export'` in Next.js, producing a flat `out/` directory. The build script handles a critical problem: **API routes are server-only and incompatible with static export.**

**What `build-static.js` does:**

```
1. Delete .next/ cache (prevents stale type validator errors)
2. Move src/app/api/ → src/app/_api_excluded/ (temporarily)
3. Run `npx cross-env TAURI_BUILD=1 next build` (static export)
4. Move src/app/_api_excluded/ → src/app/api/ (restore)
```

The `TAURI_BUILD=1` env var triggers `next.config.ts` to set `output: 'export'` and `trailingSlash: true`.

### 3. Desktop App (Tauri v2)

```bash
npm run tauri:dev       # Dev mode — loads localhost:3000 via devUrl
npm run tauri:build     # Production — runs build:static, then compiles Rust
```

Tauri wraps the static export (`out/`) as an embedded web view. The Rust backend (`src-tauri/src/lib.rs`) provides:
- ICMP ping, TCP port checking
- Serial port communication
- Telnet sessions
- Dynamic route URL rewriting (maps `/projects/{uuid}` → `/projects/_/`)

**Tauri configuration** is in `src-tauri/tauri.conf.json`:
- `build.frontendDist`: `"../out"` — path to static export
- `build.devUrl`: `"http://localhost:3000"` — dev server for `tauri:dev`
- `build.beforeDevCommand`: `"npm run dev"` — auto-starts Next.js dev server
- `build.beforeBuildCommand`: `"npm run build:static"` — auto-runs static export

### Dynamic Route Handling in Desktop

Static export can't produce a page for every possible UUID. Instead:

- Dynamic routes use a catch-all placeholder: `/projects/_/index.html`
- Rust `setup` hook injects client-side JavaScript that detects failed dynamic route loads and redirects to the placeholder page (e.g., `/projects/abc-123/` → `/projects/_/`)
- A `resolve_spa_route` Tauri command provides server-side route resolution as a fallback
- Client-side JavaScript reads the real ID from `window.location` or query params
- `post-static-build.sh` (run manually, not part of automated build) copies placeholder pages into `__fallback/` directories

---

## Version Management

### Three files to update

Version must be synchronized across three files before every release:

| File | Field | Example |
|---|---|---|
| `package.json` | `"version"` | `"4.5.0"` |
| `src-tauri/tauri.conf.json` | `"version"` | `"4.5.0"` |
| `src-tauri/Cargo.toml` | `version` | `"4.5.0"` |

### How version reaches the app

```
package.json "version"
  └→ npm sets process.env.npm_package_version at build time
      └→ next.config.ts maps it to NEXT_PUBLIC_APP_VERSION
          └→ src/lib/version.ts exports APP_VERSION
              └→ Used by update checker, settings page, etc.
```

For Tauri builds, the `tauri.conf.json` version is embedded in the binary and used by the auto-updater's `latest.json` manifest.

### Semver conventions

- **Patch** (`4.5.1`): Bug fixes, minor UI tweaks
- **Minor** (`4.6.0`): New features, new entity types, new tools
- **Major** (`5.0.0`): Breaking changes (schema migrations, API changes)

---

## Release Process

### Step-by-step checklist

```
1. Update version in all three files:
   - package.json
   - src-tauri/tauri.conf.json
   - src-tauri/Cargo.toml

2. Commit the version bump:
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "chore: bump version to 4.6.0"

3. Tag the release:
   git tag v4.6.0

4. Push commit and tag:
   git push origin main
   git push origin v4.6.0

5. CI automatically:
   - Builds Windows (MSI) and macOS (DMG × 2 architectures)
   - Creates a GitHub Release with installers attached
   - Generates latest.json for auto-updater
```

### Manual release (workflow_dispatch)

The CI can also be triggered manually from GitHub Actions → "Release Desktop App" → "Run workflow". This uses whatever code is on the branch, but the tag must still exist for the release to be created properly.

---

## CI Workflow (`.github/workflows/release.yml`)

### Trigger

- **Push tag** matching `v*` (e.g., `v4.5.0`)
- **Manual dispatch** via GitHub Actions UI

### Build matrix

| Platform | Runner | Rust Target | Output |
|---|---|---|---|
| macOS (Apple Silicon) | `macos-latest` | `aarch64-apple-darwin` | `.dmg` |
| macOS (Intel) | `macos-latest` | `x86_64-apple-darwin` | `.dmg` |
| Windows | `windows-latest` | (default x86_64) | `.msi` |

`fail-fast: false` ensures all platforms build even if one fails.

### Build steps

1. **Checkout** code
2. **Setup Node.js 22** with npm cache
3. **Install Rust stable** with appropriate target
4. **Rust cache** (keyed to `src-tauri → target`)
5. **`npm ci`** — install JS dependencies
6. **`tauri-apps/tauri-action@v0.5`** (step name: "Build and release") — builds the app with `TAURI_BUILD=1` env var set:
   - Runs `npm run build:static` (via `beforeBuildCommand`)
   - Compiles Rust backend
   - Packages into platform-specific installer
   - Creates GitHub Release (`releaseDraft: false`, `prerelease: false`)
   - Attaches installers and `latest.json` (`includeUpdaterJson: true`)

### Release output

The GitHub Release includes:
- `BAU-Suite_4.5.0_aarch64.dmg` — macOS Apple Silicon
- `BAU-Suite_4.5.0_x64.dmg` — macOS Intel
- `BAU-Suite_4.5.0_x64-setup.msi` — Windows
- `latest.json` — auto-updater manifest with download URLs and signatures

---

## Required Secrets

Configure these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Required by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `tauri-action` | Auto-provided by GitHub Actions. Creates releases, uploads assets. |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater | Signs update bundles so the desktop app can verify authenticity. Generated via `tauri signer generate`. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Tauri updater | Password for the signing key. |
| `NEXT_PUBLIC_SUPABASE_URL` | Static export | Baked into the frontend at build time. Without this, the desktop app runs in local-only mode (no sync). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Static export | Baked into the frontend at build time. Used for Supabase client auth. |

### Subscription paywall (optional — Vercel only)

| Variable | Required by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SYNC_PAYWALL` | Paywall gate | Set to `true` to enable cloud sync paywall. Unset or `false` = free sync for all. |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `/api/subscribe/checkout` | Stripe price ID for Pro monthly ($8/mo) |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `/api/subscribe/checkout` | Stripe price ID for Pro yearly ($79/yr) |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | `/api/subscribe/checkout` | Stripe price ID for Team monthly ($15/mo) |
| `STRIPE_TEAM_YEARLY_PRICE_ID` | `/api/subscribe/checkout` | Stripe price ID for Team yearly ($149/yr) |

These are only needed on Vercel (web deployment). The desktop app has no paywall — it's always free.

> **Important:** `NEXT_PUBLIC_*` vars are embedded in the JavaScript bundle during static export. They are not secret — they're the public anon key. The `SUPABASE_SERVICE_ROLE_KEY` is **never** used in CI because the desktop app has no server-side code.

### Generating signing keys

```bash
# Install Tauri CLI if not already
cargo install tauri-cli

# Generate a new keypair
cargo tauri signer generate -w ~/.tauri/bau-suite.key

# Output:
#   Public key: dW50cnVzdGVk...  (goes in tauri.conf.json → plugins.updater.pubkey)
#   Private key saved to ~/.tauri/bau-suite.key  (goes in TAURI_SIGNING_PRIVATE_KEY secret)
#   Password used during generation → TAURI_SIGNING_PRIVATE_KEY_PASSWORD secret
```

---

## Auto-Update System

BAU Suite has **two independent update mechanisms** — one for the desktop app and one for the web app.

### Desktop: Tauri Updater (`src/lib/updater.ts`)

Uses `@tauri-apps/plugin-updater` for signed binary updates.

**Flow:**

```
App launch
  └→ checkForUpdate()
      └→ Tauri plugin fetches latest.json from GitHub:
         https://github.com/calebohara/Portable-BAS-Toolkit/releases/latest/download/latest.json
      └→ Compares version in latest.json with embedded app version
      └→ If newer:
          ├→ Show update prompt to user
          └→ User accepts → downloadAndInstall()
              ├→ Download signed update bundle
              ├→ Verify signature against pubkey in tauri.conf.json
              ├→ Apply update
              └→ Relaunch app via @tauri-apps/plugin-process
```

**Tauri capabilities required** (in `src-tauri/capabilities/default.json`):
- `updater:default` — permission to check and install updates
- `process:allow-restart` — permission to relaunch after update

**`latest.json` format** (generated by `tauri-action`):
```json
{
  "version": "4.5.0",
  "notes": "Release notes...",
  "pub_date": "2024-01-15T10:30:00Z",
  "platforms": {
    "darwin-aarch64": { "url": "...dmg.tar.gz", "signature": "..." },
    "darwin-x86_64": { "url": "...dmg.tar.gz", "signature": "..." },
    "windows-x86_64": { "url": "...msi.zip", "signature": "..." }
  }
}
```

### Web: GitHub Release Check (`src/lib/version.ts`)

A lightweight check for the web app (no binary updates — just notification).

**Flow:**

```
Settings page or periodic check
  └→ fetchLatestRelease()
      └→ GET https://api.github.com/repos/calebohara/Portable-BAS-Toolkit/releases/latest
      └→ Compare tag_name against APP_VERSION using semver comparison
      └→ If newer AND not dismissed by user:
          └→ Show "Update available" banner with link to GitHub Release
```

**Dismissal:** Users can dismiss update prompts per-version. The dismissed version is stored in `localStorage` under `bau-update-dismissed-version`. If the user updates or a newer version is released, the prompt reappears.

### Update check error handling

- **Network timeout:** 8-second abort controller. Returns `null` gracefully.
- **GitHub rate limit:** Returns `null`. No retry.
- **Malformed latest.json:** Sanitizes raw git protocol data in error messages (can happen if `latest.json` is missing from the release).
- **Debug logging:** Update checks log to console with `[update-check:context]` prefix (e.g., `[update-check:tauri-check]`) in development mode.

---

## Content Security Policy (CSP)

CSP is configured differently for web and desktop due to their different security models.

### Web CSP (`next.config.ts`)

Applied via HTTP headers in server mode only (not in static export):

```
default-src   'self'
script-src    'self' 'unsafe-inline'
style-src     'self' 'unsafe-inline'
img-src       'self' blob: data: https://*.supabase.co
font-src      'self'
connect-src   'self' wss://{supabase} https://api.github.com https://*.supabase.co https://api.stripe.com
frame-src     'self' https://js.stripe.com
object-src    'none'
base-uri      'self'
form-action   'self' https://checkout.stripe.com
```

> The `connect-src` WSS URL is derived at runtime from `NEXT_PUBLIC_SUPABASE_URL` by replacing `https://` with `wss://`. If the env var is unset, falls back to `wss://*.supabase.co`.

Also includes security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`.

### Desktop CSP (`src-tauri/tauri.conf.json`)

Applied at the Tauri webview level:

```
default-src 'self'
script-src  'self' 'unsafe-inline'
style-src   'self' 'unsafe-inline'
img-src     'self' blob: data: asset: https://asset.localhost https://*.supabase.co
font-src    'self'
connect-src 'self' ws: wss: http: https:
frame-src   blob: http: https:
object-src  'none'
```

**Key differences:**
- Desktop `connect-src` is broad (`http: https:`) because API calls go directly to Supabase (no same-origin server)
- Desktop `img-src` includes `asset:` and `https://asset.localhost` for Tauri's asset protocol
- Web CSP explicitly lists Stripe domains (not needed in desktop — Stripe checkout opens in system browser)

---

## Tauri Plugins & Capabilities

### Plugins registered in `lib.rs`

| Plugin | Purpose |
|---|---|
| `tauri-plugin-shell` | Open URLs in system browser |
| `tauri-plugin-updater` | Check/download/install updates from GitHub |
| `tauri-plugin-notification` | System notifications |
| `tauri-plugin-process` | Restart app after update |
| `tauri-plugin-log` | Debug logging (dev builds only) |

### Capability permissions (`capabilities/default.json`)

```json
["core:default", "shell:allow-open", "updater:default",
 "notification:default", "process:allow-restart"]
```

### macOS entitlements (`entitlements.plist`)

Required for notarization and network access on macOS. The app needs network entitlements for Supabase sync and GitHub update checks.

---

## Troubleshooting

### Build issues

| Problem | Cause | Fix |
|---|---|---|
| Static build fails with type errors | Stale `.next` cache referencing API routes | `build-static.js` auto-clears `.next`; or manually `rm -rf .next` |
| `src/app/api` missing after failed build | `build-static.js` crashed mid-build | Check for `src/app/_api_excluded/` and rename it back |
| Rust compilation fails | Missing Rust target for cross-compile | `rustup target add aarch64-apple-darwin` |
| `npm run tauri:dev` blank screen | Dev server not ready yet (timing) | Tauri's `beforeDevCommand` auto-starts the dev server; wait a moment or restart |

### Release issues

| Problem | Cause | Fix |
|---|---|---|
| CI fails on macOS | Missing Rust target in matrix | Ensure `rust_target` matches `args: '--target ...'` |
| Auto-updater can't find update | `latest.json` not in release assets | Ensure `includeUpdaterJson: true` in workflow |
| Update signature verification fails | Wrong signing key or password | Regenerate keys, update `pubkey` in `tauri.conf.json` and secrets |
| Desktop app in local-only mode | `NEXT_PUBLIC_SUPABASE_*` not set in CI secrets | Add secrets to GitHub repository settings |
| Version mismatch after release | Forgot to update all three version files | Always update `package.json`, `tauri.conf.json`, and `Cargo.toml` together |

### Desktop-specific issues

| Problem | Cause | Fix |
|---|---|---|
| Auth redirects fail in Tauri | `window.location.origin` is `tauri://localhost` | Email confirmation/password reset flows may need custom protocol handling |
| External images not loading | Domain not in `img-src` CSP | Add domain to `app.security.csp` in `tauri.conf.json` |
| API route features missing | Expected — API routes don't exist in static export | Implement Tauri fallback using direct Supabase client calls |
