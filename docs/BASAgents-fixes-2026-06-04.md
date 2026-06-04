# BASAgents Fixes — 2026-06-04

**Trigger:** User request — add a "Copy to clipboard" action to the PPCL preview dialog, and fix PPCL downloads saving as `.pcl.txt` instead of `.pcl` everywhere it's used.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-04 |
| Agents | 1 (Desktop & Build) + 1 read-only scout (Explore) |
| Files changed | 2 |
| Insertions / deletions | ~43 / ~6 |
| TypeScript | Clean for changed files (only pre-existing `xlsx`/DXR module errors remain) |

## Audit Phase

| Agent | Role | Files read |
|-------|------|-----------|
| Explore (scout) | Locate every PPCL preview render + download/filename site | `ppcl-preview-dialog.tsx`, `app/ppcl-editor/page.tsx`, `projects/[...]/client-page.tsx`, `global-projects/[...]/client-page.tsx`, `types/index.ts` |
| Desktop & Build | Owns `src/components/ppcl-editor/` + `src/app/ppcl-editor/`; implemented both changes | same as above |

**Key finding:** the PPCL preview dialog (`src/components/ppcl-editor/ppcl-preview-dialog.tsx`) is the **shared** component rendered by both the Projects PPCL tab and the Global Projects PPCL tab. Fixing it once fixes both surfaces — no edits to the projects/global-projects client pages were needed. A second, independent download path exists in the PPCL editor's own TopBar (`src/app/ppcl-editor/page.tsx` `handleExportDocument`).

## Fixes Applied

### P2 — Feature: Copy-to-clipboard in PPCL preview dialog

- **`src/components/ppcl-editor/ppcl-preview-dialog.tsx`** — Added a **Copy** button to the dialog footer (order: Close · Copy · Download · Open in Editor) that copies the entire program (`doc.content`) to the clipboard. Reuses the app's existing `copyToClipboard` helper from `@/lib/utils` (the same util used by `ip-plan-view.tsx`, `pid-tuning/page.tsx`, `sessions-panel.tsx`), which already handles the modern `navigator.clipboard.writeText` path plus a textarea/`execCommand` fallback for non-HTTPS / desktop-webview contexts. Sonner `toast.success('Copied to clipboard')` / `toast.error('Copy failed')` feedback; the button briefly swaps to a `Check` icon + "Copied" label for 1.5s (state cleared on unmount/re-click via a `useRef` timer to avoid leaks). `variant="outline"` to match Download; `aria-label="Copy <name> to clipboard"`.

### P1 — Bug: PPCL download saves as `.pcl.txt` instead of `.pcl`

- **Root cause:** the filename was already built correctly as `name.pcl`; the browser (Safari/Chromium) appended `.txt` at save time because the Blob's MIME type was `text/plain;charset=utf-8` and `.pcl` is not a registered extension for `text/plain`. String-stripping `.txt` would not have fixed it.
- **`src/components/ppcl-editor/ppcl-preview-dialog.tsx`** — `downloadPpcl()`: Blob MIME type changed `text/plain;charset=utf-8` → `application/octet-stream`, so the browser honors the `download` filename verbatim → `name.pcl`. Also hardened `ensurePclExtension()` to strip a trailing `.txt` before ensuring `.pcl` (belt-and-suspenders for a doc literally named `foo.pcl.txt`).
- **`src/app/ppcl-editor/page.tsx`** — `handleExportDocument()`: same Blob MIME type change `text/plain;charset=utf-8` → `application/octet-stream`. Existing `.pcl` append + `sanitizeFilename` logic untouched.
- **Coverage:** both the shared preview-dialog download (Projects + Global Projects PPCL tabs) and the editor TopBar download are fixed — i.e. every PPCL download site in the app.

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries from the agent. Harmless; retained.

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for both changed files. Only pre-existing `xlsx` module-resolution errors in DXR files remain (out of scope).
- **Hooks safety:** the new `useState`/`useRef`/`useEffect` are called unconditionally at the top of the component (the dialog gates content with `{doc && ...}` inside JSX, not an early `return`), so there is no conditional-hook-order violation.
- **Scope check:** Projects and Global-Projects client pages were intentionally not edited — they consume the shared `PpclPreviewDialog` and inherit both changes.
