# DesignAgents Fixes — 2026-06-06

**Trigger:** User request — add a tool tile to the Dashboard that opens the external "PPCL Simulator" (https://ppclsimulator.app), built by the user's friend Samuel Henderson, with "Built by Samuel Henderson" credited as small text within the button.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 |
| Agents | 2 — integration scout (Explore, read-only) + Luma (Experience & Page-UX designer) |
| Files changed | 1 (`src/app/dashboard/page.tsx`) |
| Insertions / deletions | ~29 / 0 |
| TypeScript | Clean for the changed file (only pre-existing `xlsx`/DXR module errors remain) |
| Lint | `eslint src/app/dashboard/page.tsx` clean |
| Visual QA | Rendered at 1440px; tile geometry verified (1317px wide, full content column, dark-mode theme tokens, all attribution text present) |

## Audit Phase

| Agent | Role | Output |
|-------|------|--------|
| Integration scout (Explore) | Read-only — locate the Dashboard, the existing quick-action/card pattern, the canonical external-link helper, and icon/styling conventions | Identified `src/app/dashboard/page.tsx` (monolithic, inline sub-components), the Quick Actions + PWSL card patterns, and `openUrl()` in `src/lib/tauri-bridge.ts` as the cross-platform external-link helper. |
| Luma (Designer) | Implemented the new external-tool tile | Added an "External Tools" section + PPCL Simulator tile. |

## Fixes Applied

### Feature — Dashboard "External Tools" tile: PPCL Simulator

- **`src/app/dashboard/page.tsx`** — Added a new labeled **"External Tools"** `<section>` directly after the Quick Actions section (matching the dashboard's section-header rhythm), containing a single full-width tile for the **PPCL Simulator**:
  - Icon (`FlaskConical`) in the app's `bg-primary/10 text-primary` treatment; an `ExternalLink` icon next to the title and an "Open" pill to signal it leaves the app.
  - Title **"PPCL Simulator"**, description "Interactive Siemens PPCL simulator — opens in your browser.", and the attribution **"Built by Samuel Henderson"** as small muted text (`text-[11px] text-muted-foreground`) — subtle but legible, exactly as requested.
  - Opens **https://ppclsimulator.app** via `openUrl()` from `@/lib/tauri-bridge` (the canonical helper that uses the Tauri shell plugin on desktop and `window.open(_, '_blank', 'noopener,noreferrer')` on web, with protocol validation) — so the link works in the installed desktop app, not just the browser.
  - **Imports added:** `ExternalLink, FlaskConical` appended to the existing lucide-react import; `import { openUrl } from '@/lib/tauri-bridge';`.
  - **Accessibility:** real `<button type="button">`, `aria-label="Open PPCL Simulator (external site, built by Samuel Henderson)"`, section labeled via `aria-labelledby`, all icons `aria-hidden`, existing focus-ring classes. Theme-token colors only (light/dark safe). Responsive (`min-w-0`/`truncate`/`shrink-0`) so it fits 375px and scales on desktop.
  - Placed it as its own section (rather than a tiny quick-action button) so the attribution has room and so more partner/external tools can be added later. No existing `data-tour` attributes or functionality were touched.

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries. Harmless; retained.

## Verification

- **TypeScript:** `npx tsc --noEmit` — no errors in `src/app/dashboard/page.tsx` (only pre-existing `xlsx`/DXR errors remain, out of scope).
- **Lint:** `eslint src/app/dashboard/page.tsx` — clean.
- **Live render QA (preview server, 1440×900):** `/dashboard` rendered; the External Tools section + PPCL Simulator tile present. Verified via DOM geometry — tile is 1317px wide filling the 1365px content column, `display` visible, dark-mode theme-token background/border, and all three text lines render (title, description, "Built by Samuel Henderson"). `aria-label` and `openUrl('https://ppclsimulator.app')` wiring confirmed. (Screenshot captures were downscaled by the preview tool, so geometry/DOM checks were used as the source of truth.)
