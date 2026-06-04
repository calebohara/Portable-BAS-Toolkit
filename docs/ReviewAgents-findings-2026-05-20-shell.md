# ReviewAgents Findings — Desktop, UI & Build — 2026-05-20

**Agent:** Desktop, UI & Build Reviewer
**Files reviewed:** ~55 files (Tauri config + Rust shell, root `app/` pages + layout, `components/ui/` primitives, `components/layout/`, `components/shared/`, `components/theme/`, `components/onboarding/`, `components/ppcl-editor/`, `components/pwa/`, `components/notepad/`, shell hooks, `lib/routes.ts`, `lib/updater.ts`, `lib/version.ts`, `lib/tauri-bridge.ts`, `lib/utils.ts`, `lib/ppcl-language.ts`, `store/ppcl-editor-store.ts`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `package.json`, `scripts/`, `.github/workflows/release.yml`)
**LOC reviewed:** ~5,500

## Summary
| Priority | Count |
|----------|-------|
| P0 | 2 |
| P1 | 6 |
| P2 | 7 |
| P3 | 17 |

---

## P0 — Data loss / crash / security

### CI publishes macOS desktop builds despite Windows-only policy
- **Location:** `.github/workflows/release.yml:13-21,33-36,66`
- **Current behavior:** The release workflow matrix builds `windows-latest` and `macos-latest` (aarch64-apple-darwin), and the release body advertises a "macOS (Apple Silicon) `.dmg` installer". `entitlements.plist` and `signingIdentity: "-"` in `src-tauri/tauri.conf.json:48-51` are configured to support those macOS builds.
- **Why it's a bug:** CLAUDE.md memory explicitly states "Desktop releases are Windows-only, never macOS." Every tagged release publishes a macOS DMG that the team has committed to never shipping; the user-facing release notes ("macOS (Apple Silicon) `.dmg` installer") promise an artifact the project does not support. Also doubles CI minutes and risks the macOS build silently failing while the Windows artifact slips by unnoticed.
- **Suggested fix:** Drop the `macos-latest` entry from the matrix, the conditional `Add macOS aarch64 target` step, and the macOS line of the release notes table. Either delete `src-tauri/entitlements.plist` and the `macOS` block from `tauri.conf.json` or keep them but add a comment that they are dormant.

### `proxy_fetch` bypasses TLS validation for any local-network URL the renderer asks about
- **Location:** `src-tauri/src/lib.rs:716-775` (especially the `is_private_network` allowlist at `703-714` and the unrestricted `reqwest::Client::builder().danger_accept_invalid_certs(true)` at `730`)
- **Current behavior:** Any code in the WebView (including iframes loaded from `frame-src 'self' blob: http: https:` per `tauri.conf.json:26`) can call `invoke('proxy_fetch', { url })` for any `http(s)://10.x | 172.16-31.x | 192.168.x | 127.x | localhost/...` URL and the Rust backend will fetch it with **all** certificate validation disabled and return the body to the page. There is no per-window origin check, no CSRF token, no allowlist of approved endpoints, and `is_private_network` matches the URL host string before any DNS resolution — so an attacker-controlled remote page (loaded into a frame because `frame-src` is wildcard) that simply resolves a hostname like `internal.attacker.example` to `192.168.1.1` cannot trick this (host parsing is on the literal IP), but the function does happily proxy `http://localhost:<anything>` which on a service tech's laptop may include local dev servers, vendor utilities, or `127.0.0.1:11434`-style local APIs.
- **Why it's a bug:** This is a confused-deputy. The Rust side has full network access and ignores TLS errors; the frontend can be tricked into invoking it by any embedded controller page (the CSP allows `frame-src` from arbitrary `http:`/`https:`). Combined with `danger_accept_invalid_certs(true)`, a hostile or MITM'd response can deliver arbitrary content to the WebView under the controller's UI, defeating the cert pinning a browser normally provides. At minimum the response should never carry executable script attribution back to the original origin, and the command should require an explicit user-affirmed endpoint allowlist (the same pattern the Web Interface page uses for saved endpoints).
- **Suggested fix:** (1) Tighten `is_private_network` to also reject `localhost`/`127.0.0.1` unless the user has explicitly enabled local-loopback proxying. (2) Require the renderer to pass a session token established at startup (Tauri's `app.manage` state) so embedded iframes cannot call the command. (3) Strip Set-Cookie and Authorization headers from the proxied response. (4) Consider re-enabling cert validation by default and allowing the user to "Trust this self-signed cert" per-host with a fingerprint pin instead of a blanket bypass.

---

## P1 — Visible bugs

### `nativeTelnetConnect`'s `timeoutMs` parameter is silently dropped
- **Location:** `src/lib/tauri-bridge.ts:101-109` (declares `timeoutMs: number = 10000` and passes it in the invoke payload) vs. `src-tauri/src/lib.rs:267-313` (the Rust `telnet_connect` command signature only accepts `sessionId`, `host`, `port` — there is no `timeout_ms` parameter, the connect timeout is hardcoded to 15s on line 277).
- **Current behavior:** Frontend callers that pass a custom `timeoutMs` are ignored; every connection always uses the hardcoded 15-second timeout in the Rust command.
- **Why it's a bug:** Callers reading the TS signature will reasonably expect the timeout to take effect. The bug is silent — Tauri's invoke layer ignores extra args without warning, so this drift can sit indefinitely.
- **Suggested fix:** Either (a) remove the `timeoutMs` parameter from `nativeTelnetConnect` in `tauri-bridge.ts` to match reality, or (b) plumb the parameter through the Rust command (`telnet_connect(host, port, timeoutMs)`), defaulting to 15000ms when `None`.

### Tailwind v4 arbitrary viewport-unit values across shell primitives may fail to compile silently
- **Location:** `src/components/ui/dialog.tsx:61` (`max-h-[85vh]`), `src/components/ppcl-editor/ppcl-preview-dialog.tsx:91` (`h-[50vh] min-h-[250px] max-h-[65vh]`), `src/components/notepad/global-notepad.tsx:643` (`max-sm:h-[60vh]`), `src/components/shared/error-boundary.tsx:41` (`min-h-[50vh]`)
- **Current behavior:** Per CLAUDE.md project memory: "Tailwind v4 arbitrary values like `max-h-[90vh]` may NOT compile — use inline styles or CSS for viewport-relative values." All four locations use arbitrary `vh` classes; the `dialog.tsx` site is the **inner wrapper** put in specifically to dodge `base-ui` `Dialog.Popup`'s `style`-prop override, so if `max-h-[85vh]` doesn't compile then every dialog content area in the app silently loses its max-height and can render off-screen on short viewports.
- **Why it's a bug:** The bug is conditional on Tailwind v4 compilation behavior, but the project's own memory and existing dialog.tsx workaround treat this as a known footgun. The risk is highest on `dialog.tsx:61` because (a) it affects every dialog and (b) it's the documented workaround for the `base-ui` style-prop issue, so a regression there cascades widely.
- **Suggested fix:** Replace each `[Nvh]` class with an inline `style={{ maxHeight: '85vh' }}` on the same element. For dialog.tsx specifically, the inner wrapper that holds the workaround should use inline styles for `maxHeight` rather than the Tailwind arbitrary value. Audit script: `rg -n "max-h-\[.*vh\]|min-h-\[.*vh\]|h-\[.*vh\]" src/` should return empty after the fix.

### Nested interactive elements in PPCL tab close button (invalid HTML)
- **Location:** `src/components/ppcl-editor/ppcl-tab-bar.tsx:41-66`
- **Current behavior:** A `<button>` (the tab itself) contains a `<span role="button" tabIndex={0} onClick=...>` (the close X). Nesting interactive content inside a `<button>` is invalid HTML; some browsers will render but break keyboard focus order, and screen readers will skip or duplicate the inner control.
- **Why it's a bug:** Affects accessibility and keyboard navigation; the span is `role="button"` so AT will announce both, but the outer `<button>` swallows the click on the inner element unless `stopPropagation` fires correctly (which it does here, but the structural invalidity remains).
- **Suggested fix:** Convert the outer `<button>` into a `<div role="tab">` with `onClick`/`onKeyDown`, and keep the inner close as a real `<button type="button">`. Or render two sibling buttons inside a styled flex container.

### `next.config.ts` web-mode `font-src` excludes `data:`, breaking any inline-data font
- **Location:** `next.config.ts:23-34`
- **Current behavior:** `font-src 'self'` only. Next.js's font loader (`Inter`, `JetBrains_Mono` configured in `layout.tsx:13-14`) self-hosts the fonts so this works today, but any third-party CSS that references a `url(data:font/...)` (Stripe Elements iframes, some PDF previews) will be blocked.
- **Why it's a bug:** Minor — current usage works. But the next time a dependency emits an inline data font, the CSP will silently break it without obvious cause.
- **Suggested fix:** Add `data:` to `font-src` (low-risk relaxation; Tauri's CSP at `tauri.conf.json:26` already has `font-src 'self'` only — same issue applies there).

### Update notifier never validates the manifest signature path / fallback
- **Location:** `src/lib/updater.ts:38-46` and `tauri.conf.json:30-35`
- **Current behavior:** The `pubkey` in tauri.conf.json verifies the bundle signature, but the manifest URL (`latest.json`) is fetched over HTTPS with no integrity check beyond that. If GitHub Releases is reachable but the latest.json is empty/stale/poisoned, `cachedUpdate` is set even when invalid; `downloadAndInstall` then falls back to a second `check()` on line 93-94 which can return a different `update` than what was shown to the user — the dialog says "v4.9.2" but the install can fetch a newer/different version that landed between dialog open and the click.
- **Why it's a bug:** Race window between "Check" and "Install" if a new release lands in between. Also `cachedUpdate` is module-scoped state with no expiry; if the user leaves the dialog open overnight and clicks install, the update binary may no longer match the description shown.
- **Suggested fix:** When entering `downloadAndInstall`, never re-fetch if `cachedUpdate` is set — fail loudly if it's null instead. Add an expiry on `cachedUpdate` (e.g., 15 minutes) and re-prompt the dialog if the cache is stale.

### Global error boundary references undefined `__next` root in fallback page
- **Location:** `src-tauri/src/lib.rs:837` (`document.getElementById('__next')`)
- **Current behavior:** The SPA-fallback JavaScript injected into the Tauri window looks for `document.getElementById('__next')` to detect "did the page render?" — but Next.js 13+ App Router does **not** create an `#__next` root element. The next-root for App Router is `body > main` or the body itself; there's no `id="__next"`.
- **Why it's a bug:** `hasNextRoot` will always be `false`, which means the `bodyEmpty || !hasNextRoot || isErrorPage` condition triggers on every dynamic-route navigation in Tauri, forcing a redirect to `/projects/_/?_id=...` even when the page already rendered fine. In practice the redirect is harmless because the catch-all fallback re-mounts the same content, but it adds a perceptible flicker, breaks back-button history, and triggers an unnecessary `window.location.replace`.
- **Suggested fix:** Replace `document.getElementById('__next')` with a check that the App Router actually populates, such as `document.querySelector('[data-nextjs-scroll-focus-boundary]')` or simply look for the `<main id="main-content">` from `app-shell.tsx:154`. Even simpler: just check `document.body && document.body.children.length > 0` and drop the `__next` check.

---

## P2 — Inconsistencies

### Two separate `ErrorBoundary` class components with overlapping responsibility
- **Location:** `src/components/layout/error-boundary.tsx:22-67` and `src/components/shared/error-boundary.tsx:19-73`
- **Current behavior:** Both export a `class ErrorBoundary extends Component` with `getDerivedStateFromError`, `componentDidCatch`, and a fallback render. Layout's version takes an optional `section` label and a "Try Again" button; shared's version supports `fallback` and `onError` and offers "Reload App". `layout.tsx:82-84` uses `shared`, but `AppShell` line 163 uses `layout`'s.
- **Why it's a bug:** Drift — bug fixes in one won't apply to the other. Both could be one component with optional `section`/`onError`/`fallback`/`mode: 'retry' | 'reload'`.
- **Suggested fix:** Merge into a single shared `ErrorBoundary` that supports all current props; replace the layout-flavored one with a re-export or thin wrapper.

### `ROUTES` constant table in `src/lib/routes.ts` is dead and drifts from the sidebar
- **Location:** `src/lib/routes.ts:21-41` (exported `ROUTES` is imported nowhere — confirmed `rg "ROUTES\." src/` only matches the unrelated `FULL_PAGE_ROUTES`/`PUBLIC_ROUTES` in `app-shell.tsx`)
- **Current behavior:** The `ROUTES` table is missing `TREND_VIEWER` (which exists in the sidebar as `/trend-viewer` and as an app route), `DESKTOP`, `DONATE`, `KNOWLEDGE_BASE` exists but no `LOGIN`, etc. The sidebar in `src/components/layout/sidebar.tsx:22-65` uses hardcoded string literals for every `href`. The drift is invisible because nothing consumes `ROUTES`.
- **Why it's a bug:** Misleading — the file presents itself as the canonical route registry but isn't one. New routes get added to the sidebar without updating `ROUTES`, and any future code that does import it will get out-of-date data.
- **Suggested fix:** Either delete the `ROUTES` constant outright (the navigation helpers below it are the real contract), or fully populate it and refactor the sidebar to import `ROUTES.PROJECTS` etc.

### `FULL_PAGE_ROUTES` / `PUBLIC_ROUTES` route lists hand-maintained in `app-shell.tsx`
- **Location:** `src/components/layout/app-shell.tsx:20,23`
- **Current behavior:** Two hardcoded string arrays for "renders without sidebar" and "doesn't require auth". `/offline` is in `PUBLIC_ROUTES` only (renders sidebar), `/desktop` and `/donate` are in both. Adding a new public marketing page requires updating both arrays.
- **Why it's a bug:** Easy to miss one and accidentally either gate a public page behind auth or render it with the sidebar. Should be a single source of truth (e.g., per-route export from each `page.tsx`, or a typed config object in `lib/routes.ts`).
- **Suggested fix:** Move both arrays into `lib/routes.ts` as typed constants exported alongside `ROUTES`, and use literal types so missing routes fail at the type level.

### App Router file structure has both `/desktop/page.tsx` and the marketing-page `Desktop App` block in `/page.tsx`
- **Location:** `src/app/page.tsx:519-577` (Desktop App teaser section) vs `src/app/desktop/page.tsx` (dedicated landing page)
- **Current behavior:** Two surfaces marketing the desktop app: the homepage band that says "Available Now" with a `/api/download` link, and a separate `/desktop` page that says "Coming soon — Windows first" then renders Download buttons for `.msi` and `.exe`. Messaging conflicts ("Available Now" on home vs "being built for Windows first" on /desktop).
- **Why it's a bug:** UX inconsistency. A user clicking through from "Available Now" to `/desktop` is greeted with "Coming soon" copy mixed with download buttons.
- **Suggested fix:** Pick one canonical narrative — if the app is available, both pages should say "Available Now" with consistent CTAs; if it's still pre-launch, the home band should match.

### PWA cache version `bau-suite-v6` not auto-bumped with `APP_VERSION`
- **Location:** `public/sw.js:1` (`CACHE_VERSION = 'bau-suite-v6'`) vs. `package.json:3` (`"version": "4.9.1"`)
- **Current behavior:** The service worker cache version is a manual integer (`v6`) decoupled from the app version. After updates, the SW only invalidates if a developer remembers to bump `v6 → v7`. The CLAUDE.md memory explicitly calls out "PWA cache key versioning — version bumping discipline" as a watch item.
- **Why it's a bug:** Easy to ship a release with stale `app-shell` cached entries. The service worker also pre-caches `/`, `/projects`, `/search`, `/offline`, `/settings`, `/network-diagram`, `/ping` (line 9-18) — if any of these change layout, users on the old SW won't see the change until they manually clear or the cache bump happens.
- **Suggested fix:** Make `sw.js` a build-time template or post-build script that stamps `CACHE_VERSION` with `package.json`'s version. Even a simple `sed -i "s/bau-suite-v[0-9]*/bau-suite-v${VERSION}/" public/sw.js` in `scripts/post-static-build.sh` (which is currently dead — see P3) would do it.

### `scripts/post-static-build.sh` is dead — not wired to any npm or Tauri lifecycle
- **Location:** `scripts/post-static-build.sh:1-37`, package.json scripts section (lines 5-17), `tauri.conf.json:10` (`beforeBuildCommand`)
- **Current behavior:** The shell script creates `__fallback` copies of the projects/reports dynamic routes after the static export. No `package.json` script, npm hook, or tauri lifecycle hook invokes it. `tauri.conf.json:10`'s `beforeBuildCommand` is just `npm run build:static`, which runs `scripts/build-static.js` and stops. (`rg "post-static-build" .` returns no matches.)
- **Why it's a bug:** Two possibilities — either the script is dead and the SPA fallback works without it (because of the runtime `checkSpaFallback` in `lib.rs:819-865`), in which case it's pure bloat; or the `__fallback` directories *are* meant to exist and the script being un-wired causes hard-refresh on dynamic routes to 404 in some scenarios.
- **Suggested fix:** Confirm whether the script's `__fallback` copies are needed. If yes, wire it via a `postbuild:static` npm script that `build-static.js` calls on success. If no, delete the script.

### `scripts/generate-icons.mjs` is also dead (no npm script invokes it)
- **Location:** `scripts/generate-icons.mjs:1-372`
- **Current behavior:** No `package.json` script targets `generate-icons`, no docs reference it, but the generated outputs (favicons, OG images, PWA icons) are checked in and the script imports the heaviest devDep in the tree (`sharp`).
- **Why it's a bug:** Discoverability — a future contributor regenerating icons has to find this file manually. Sharp is a 50+ MB native dep being kept solely for occasional regen.
- **Suggested fix:** Add `"icons": "node scripts/generate-icons.mjs"` to `package.json` scripts so it's discoverable. Otherwise consider moving the script + sharp dep out into a separate `tools/` folder.

---

## P3 — Bloat / dead code / polish

### Unused dependencies in `package.json`
- **Location:** `package.json:18-58`
- **Findings (zero non-self imports across `src/` and `scripts/`):**
  - `@codemirror/lang-css` — line 21
  - `@codemirror/lang-html` — line 22
  - `@codemirror/lang-javascript` — line 23
  - `@codemirror/lang-json` — line 24
  - `@codemirror/lang-markdown` — line 25
  - `@codemirror/lang-python` — line 26
  - `@codemirror/lang-xml` — line 27
  - `@uiw/codemirror-extensions-basic-setup` — line 36
  - `@tauri-apps/plugin-notification` — line 32 (only `package.json` itself references; the Rust side has the plugin registered but no frontend code calls it)
  - `next-themes` — line 46 (replaced by custom `ThemeProvider` at `src/components/theme/theme-provider.tsx`)
  - `cmdk` — line 40 (only used by dead `command.tsx`)
- **Suggested fix:** Remove all 11 entries. Net install delta is meaningful (codemirror lang packs alone are several MB). Verify build still works post-removal.

### Unused single-purpose UI primitives (entire files dead — 0 imports outside themselves)
- **Location:**
  - `src/components/ui/scroll-area.tsx:1-55` — exported `ScrollArea`, `ScrollBar`; both have zero importers
  - `src/components/ui/popover.tsx:1-90` — exported `Popover`, `PopoverTrigger`, `PopoverContent`; zero importers
  - `src/components/ui/command.tsx:1-197` — exports `Command`, etc.; only file that imports is `input-group.tsx` (its dependency)
  - `src/components/ui/input-group.tsx:1-158` — only imported by dead `command.tsx`
- **Suggested fix:** Delete all four files. They were probably scaffolded by shadcn during initial setup and never used. Together they remove ~500 LOC.

### Unused exports inside still-used UI primitives
- **Location:**
  - `src/components/ui/avatar.tsx` — `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge` (lines 73-100) — no importers
  - `src/components/ui/card.tsx` — `CardAction` (lines 63-74), `CardFooter` (lines 86-97) — no importers
  - `src/components/ui/select.tsx` — `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` (lines 11-19, 98-109, 139-186) — none imported outside this file
  - `src/components/ui/dropdown-menu.tsx` — `DropdownMenuPortal`, `DropdownMenuGroup`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent`, `DropdownMenuShortcut` — none referenced anywhere outside this file
  - `src/components/ui/sheet.tsx` — `SheetTrigger`, `SheetClose`, `SheetFooter` — only `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` are imported (by `inbox-panel.tsx`)
  - `src/components/ui/progress.tsx` — `ProgressTrack`, `ProgressIndicator`, `ProgressValue` (lines 28-75) — `Progress` and `ProgressLabel` are the only consumed exports
  - `src/components/ui/table.tsx` — `TableFooter`, `TableCaption` — unused
  - `src/components/ui/tabs.tsx` — `tabsListVariants` (CVA factory) — exported on line 82 but never imported
  - `src/components/ui/input.tsx` — `inputVariants` (CVA factory, line 47) — exported but only used internally
  - `src/components/ui/textarea.tsx` — `textareaVariants` (CVA factory) — exported but unused outside
- **Suggested fix:** Remove all dead exports and drop the now-unreachable component bodies. This is fertile bloat hunting per the agent brief; each one is small but the total is several hundred lines.

### Unused icon imports inside in-use files
- **Location:**
  - `src/app/help/page.tsx:8` — `BookmarkPlus` imported, never rendered
  - `src/components/ppcl-editor/ppcl-file-panel.tsx:4` — `Replace` icon imported, never used (the visible text "Replace" is plain text, not the icon)
  - `src/components/layout/update-notifier.tsx:4` — `ExternalLink` imported, never used
- **Suggested fix:** Drop the unused identifiers from each import. ESLint with `no-unused-vars` set to `error` would catch these automatically.

### Unused local import in `src-tauri/src/lib.rs`
- **Location:** `src-tauri/src/lib.rs:766` (`use serde::ser::Error;`)
- **Current behavior:** A `use` statement scoped to the binary-response branch of `proxy_fetch` that does nothing — the imported trait is never referenced.
- **Suggested fix:** Delete the line. Will silence a Rust compile warning.

### `tsconfig.json` strictness gaps
- **Location:** `tsconfig.json:2-24`
- **Current behavior:** `"strict": true` is on but `"noUncheckedIndexedAccess"` and `"exactOptionalPropertyTypes"` are unset. Several files in scope rely on `array[0]!`-style assertions (e.g., `src/lib/ppcl-language.ts:38` returns a value from `m[1]` without checking the regex matched length).
- **Suggested fix:** Enable `noUncheckedIndexedAccess` and address the type errors it raises. `exactOptionalPropertyTypes` is more disruptive — defer to a future cleanup if the team agrees.

### `npm_package_version` injection is fragile when not run via npm
- **Location:** `next.config.ts:13-15`
- **Current behavior:** `NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0'` — only set when invoked via `npm run …`. If anyone runs `next build` directly (e.g., docker layer using `pnpm`), the published version label becomes `1.0.0`.
- **Suggested fix:** Read `version` directly from `package.json` via `require('./package.json').version` as a fallback. Already supported in Next.js config files.

### `useKeyboardShortcut` used only once for a single shortcut
- **Location:** `src/hooks/use-keyboard-shortcut.ts:5-31`, single consumer `src/components/layout/top-bar.tsx:46` (`useKeyboardShortcut('k', goToSearch)`)
- **Current behavior:** Hook abstraction exists for one site. The PPCL editor at `src/app/ppcl-editor/page.tsx:231-241` rolls its own `keydown` handler. The notepad in `global-notepad.tsx` has bespoke keyboard handling too.
- **Suggested fix:** Either consolidate the PPCL keydown handling onto `useKeyboardShortcut` (which would require expanding the hook to support multiple shortcuts at once), or inline the Cmd-K listener directly into `top-bar.tsx` and delete the hook. Current state is neither — it's an unused-elsewhere abstraction.

### `lib.rs` SPA fallback JS injection is a 50-line stringly-typed monolith
- **Location:** `src-tauri/src/lib.rs:819-865`
- **Current behavior:** The fallback navigation handler is `window.eval(r#"...50 lines of JS..."#)`. Not testable, not lintable, and depends on the brittle `#__next` check (see P1 above).
- **Suggested fix:** Move the fallback logic into `public/spa-fallback.js` and `window.eval(include_str!(...))` it. Makes the JS lintable/testable and easier to fix when Next.js internals change.

### `src/lib/routes.ts` Tauri-mode detection runs the URL builder twice per navigation
- **Location:** `src/lib/routes.ts:78-84` — `navigateToProject` calls `projectDetailHref` (which checks `isTauri()`) and then immediately checks `isTauri()` again to decide between `window.location.href` and `router.push`.
- **Current behavior:** Two `__TAURI_INTERNALS__` lookups per navigation. Trivial perf cost but the code reads as if a future refactor split them on accident.
- **Suggested fix:** Memoize `isTauri()` (it's a runtime constant) or have `projectDetailHref` return both URL and navigation mode.

### Hardcoded magic-number `lineHeight: '1.05'` and `'1.1'` inline styles on hero copy
- **Location:** `src/app/page.tsx:206`, `src/app/desktop/page.tsx:103`
- **Current behavior:** Inline `style={{ lineHeight: '1.1' }}` and `'1.05'` repeated across hero markup; the rest of the typography uses Tailwind classes.
- **Suggested fix:** Replace with `leading-[1.05]` Tailwind arbitrary value or define `--leading-hero` in `globals.css` `@theme`. Note: as a "small" arbitrary number, it should compile in Tailwind v4 (unlike the `vh` cases).

### Two distinct download endpoints in marketing copy
- **Location:** `src/app/page.tsx:547` (`window.open('/api/download', ...)`) vs `src/app/desktop/page.tsx:221,230` (`/api/download?format=msi`, `/api/download?format=exe`)
- **Current behavior:** The home page button just hits `/api/download`; the desktop page exposes two format-specific buttons. Easy for a CDN cache or analytics report to be confused by the inconsistency.
- **Suggested fix:** Either always pass an explicit `format=` or standardize on a single default. The API route in `src/app/api/download/` is outside slice scope but worth a Handoff to Platform.

### Tour overlay has a 23-step tour that walks past every sidebar item
- **Location:** `src/components/onboarding/tour-steps.ts:11-201`
- **Current behavior:** 23 steps, ~7 of them are repetitive "Click here in the sidebar to see X" with the same `action: 'open-sidebar'` and `placement: 'right'`. By step 8 a new user is fatigued.
- **Suggested fix:** Compress the "sidebar nav-X" steps into one or two grouped steps ("Tools live here", "Workspace lives here") with a "Show me more" expansion, or make sidebar steps skippable as a group. Pure UX call; flagging as P3 polish.

### `tauri.conf.json` frame-src is `'self' blob: http: https: ...` — extremely permissive
- **Location:** `src-tauri/tauri.conf.json:26`
- **Current behavior:** `frame-src 'self' blob: http: https: https://*.stripe.com https://checkout.stripe.com` — the `http:` and `https:` schemes allow embedding **any** site via iframe. This is intentional for the Web Interface tool (`src/app/web-interface/`), but it broadens the attack surface for the `proxy_fetch` confused-deputy in P0.
- **Why it's a bug:** Combined with the P0 finding, an attacker who can get the user to load any HTTP(S) page in an iframe can ride the `proxy_fetch` allowlist. Mitigating P0 reduces the risk; tightening `frame-src` would be defense-in-depth.
- **Suggested fix:** Consider tightening to `frame-src 'self' blob: http://localhost:* http://*.local http://10.* http://172.16.* http://192.168.*` — though CSP doesn't support IP-range matching directly, so this is a limitation of CSP. Document the trade-off.

### Sidebar persists collapsed-group state to localStorage outside Zustand
- **Location:** `src/components/layout/sidebar.tsx:77-91`
- **Current behavior:** A manual `localStorage.getItem('bau-suite-collapsed-groups')` plus `try/catch` block sitting alongside several Zustand stores that also use `persist`. Pattern drift.
- **Suggested fix:** Move `collapsedGroups` into `app-store.ts` (which already uses `persist` under `'bau-suite-app'`) so all sidebar state lives in one place.

### `next.config.ts` uses `process.env.npm_package_version` for the static export but doesn't pass it through to Cargo or tauri.conf.json
- **Location:** `next.config.ts:14`, `src-tauri/Cargo.toml:3`, `src-tauri/tauri.conf.json:4`
- **Current behavior:** All three currently say `4.9.1`, kept in sync by hand. The comment in `version.ts:8` even calls out "Tauri conf and Cargo.toml must be kept in sync manually". A future bump risks divergence.
- **Suggested fix:** Add a `scripts/sync-version.js` (or a single npm version script) that reads package.json and writes the same version to Cargo.toml and tauri.conf.json. Wire it to `npm version` lifecycle.

### Manual cache version vs. APP_VERSION
- See P2 "PWA cache version `bau-suite-v6` not auto-bumped" — also has bloat aspect: every old cache key is left orphaned in `caches.keys()` until the SW activates. Already addressed in `sw.js:38-44` (delete keys not matching current STATIC/DYNAMIC), so this is fine; only the bump-on-build is missing.

---

## Handoffs (issues found outside your slice)

- **> Handoff to: Field Connectivity** — `src-tauri/src/lib.rs:267-313` (`telnet_connect` has no `timeout_ms` parameter despite the frontend passing one). See P1 above.
- **> Handoff to: Field Connectivity** — `proxy_fetch` security model (P0). The Rust command lives in `lib.rs` which is technically Field-Connectivity-owned per the brief; the security boundary across the Tauri IPC affects every page that mounts a WebView frame.
- **> Handoff to: Platform** — `/api/download` route inconsistency (home page calls `/api/download` plain; `/desktop/page.tsx` calls `/api/download?format=msi|exe`).
- **> Handoff to: Sync** — `sync-status.tsx` and `recent-shares-toast.tsx` were not deeply reviewed; both are mounted in the root `layout.tsx` and could affect first-paint latency if `useSyncContext` or `useRecentShares` hit IndexedDB on mount. Worth a perf pass.
- **> Handoff to: Tools (PPCL)** — `src/app/ppcl-editor/page.tsx:204-214` `handleImportFile` calls `file.text()` without size guard — a 500MB .pcl drop would lock the renderer. Out of shell scope but visible from the editor wrapper.
