# BASAgents Fix Log — 2026-05-09 (Session 2)

| Field | Value |
|-------|-------|
| Date | 2026-05-09 |
| Agents | 5 (all BASAgents) |
| Files changed | 2 |
| Insertions / Deletions | +41 / −3 |
| Focus | PPCL Editor navigation lock |

---

## Audit Phase

| Agent | Role | Files Read |
|-------|------|-----------|
| Desktop & Build | Fullscreen z-index fix + Suspense boundary | `src/app/ppcl-editor/page.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`, `src/components/ui/dialog.tsx`, `src/store/ppcl-editor-store.ts` |
| BAS Tools Engineer | CodeMirror event audit + store hardening | `src/components/ppcl-editor/ppcl-editor.tsx`, `src/lib/ppcl-language.ts`, `src/store/ppcl-editor-store.ts`, `src/app/ppcl-editor/page.tsx` |
| Field Connectivity | Tauri/webview layer audit | `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`, `src/lib/tauri-bridge.ts`, `src/lib/routes.ts` |
| Platform Engineer | Global z-index inventory + impact analysis | All fixed/positioned UI components |
| Project Manager | Route/hook navigation consistency | `src/hooks/use-ppcl-documents.ts`, `src/lib/routes.ts`, `src/components/layout/sidebar.tsx:151–158` |

---

## Fixes Applied

### P0 — PPCL Fullscreen Overlay Blocks Sidebar Navigation

**File:** `src/app/ppcl-editor/page.tsx`

**Issue:** When the user clicked the fullscreen/maximize button, the editor container became `fixed inset-0 z-50 bg-background`. The sidebar is also `fixed z-50`. Since the editor `<div>` appears after `<Sidebar>` in DOM order, it won the z-index tie and covered the sidebar with a solid background, making all sidebar navigation links unclickable. The only escape was pressing Escape, F11, or clicking "Exit Fullscreen" — none of which are obvious to a user who didn't intentionally enter fullscreen.

**Fix:** Changed the fullscreen container from `fixed inset-0 z-50 bg-background` to `fixed inset-0 z-30 bg-background` with a sidebar-aware left offset:
- Desktop with sidebar open: `md:left-56`
- Desktop with sidebar collapsed: `md:left-16`
- Mobile: `inset-0` (sidebar slides off-screen on mobile anyway)

The z-index drop to `z-30` puts the overlay below the sidebar (`z-50`), dialogs (`z-50`), and TourOverlay (`z-[9999]`). The sidebar remains visible and clickable in fullscreen mode. Added `sidebarOpen` from `useAppStore` to read the current sidebar width.

---

### P0 — Fullscreen State Could Rehydrate from localStorage

**File:** `src/store/ppcl-editor-store.ts`

**Issue:** The Zustand `persist` middleware had no `version`, no `migrate`, and no custom `merge`. While `isFullscreen` was excluded from `partialize`, Zustand's default merge performs a shallow spread of persisted state over current state. Any pre-existing localStorage entry under `bau-suite-ppcl-editor` from an older build (or a future regression that adds `isFullscreen` to partialize) containing `isFullscreen: true` would rehydrate that flag, mounting the editor in fullscreen and immediately blocking the sidebar.

**Fix:**
- Added `version: 2` to invalidate any prior schema
- Added `migrate` that strips `isFullscreen` from any v0/v1 persisted payload
- Added `merge` that always coerces `isFullscreen` to `false` on hydration — fullscreen requires an explicit user action each session

---

### P1 — Cmd+W preventDefault Unconditionally Blocks Window Close

**File:** `src/app/ppcl-editor/page.tsx`

**Issue:** The keyboard handler called `e.preventDefault()` on `Cmd/Ctrl+W` unconditionally, even when `activeTabId` was null (no PPCL tab open). In the Tauri desktop app, `Cmd+W` is the conventional macOS shortcut to close the window. With `preventDefault` always firing on the PPCL editor page, the user could not close the Tauri window via keyboard — reinforcing the "locked" feeling.

**Fix:** Moved `e.preventDefault()` inside the `activeTabId` guard so it only fires when there is actually a PPCL tab to close.

```ts
// Before
if (mod && e.key === 'w') { e.preventDefault(); if (activeTabId) handleCloseTab(activeTabId); }

// After
if (mod && e.key === 'w' && activeTabId) { e.preventDefault(); handleCloseTab(activeTabId); }
```

---

### P2 — Missing Suspense Boundary for useSearchParams

**File:** `src/app/ppcl-editor/page.tsx`

**Issue:** `useSearchParams()` was called directly inside the page component without a `Suspense` boundary. Next.js 16 App Router requires this for client components that read search params, or the route deopts to fully dynamic rendering and can break static export.

**Fix:** Refactored to a two-component pattern (`PpclEditorPage` wraps `PpclEditorPageInner` in `<Suspense>`). `useSearchParams` is called inside the inner component, consistent with the pattern used across `src/app/projects/page.tsx` and `src/app/login/page.tsx`.

---

## Agents Cleared (No Changes Needed)

| Agent | Finding |
|-------|---------|
| Field Connectivity | Tauri allowlist, CSP, Rust-side navigation handlers, and `tauri-bridge.ts` are all clean. The SPA-fallback injected script only activates for `/projects/` and `/reports/` dynamic routes — not `/ppcl-editor`. |
| Platform Engineer | Global z-index audit completed. The chosen Option B fix (lower PPCL overlay, add sidebar offset) avoids cascading changes to Dialog, Sheet, GlobalNotepad, and other `z-50` components. |
| BAS Tools Engineer | `gotoClickHandler` in `ppcl-language.ts` correctly returns `false` on all non-navigation code paths. No global `window.addEventListener` for clicks in any PPCL component. CodeMirror is not consuming navigation clicks. |
| Project Manager | `use-ppcl-documents.ts` has no navigation guards. Route config is clean. Sidebar active-state detection handles `/ppcl-editor` correctly. |

---

## Housekeeping

None. No cleanup tasks outside fix scope.

---

## Verification

- `npx tsc --noEmit` — zero errors in all touched files. One pre-existing unrelated error in `src/lib/sync/__tests__/sync-manager.test.ts` (not introduced by this session).
- All fixes reviewed for CSS correctness: sidebar-aware left offset uses Tailwind `md:left-56` / `md:left-16`, which matches the sidebar width classes in `sidebar.tsx`.
- Store migration confirmed: `version: 2` invalidates v0/v1 payloads; `merge` override ensures `isFullscreen` starts `false` each session regardless of storage content.
