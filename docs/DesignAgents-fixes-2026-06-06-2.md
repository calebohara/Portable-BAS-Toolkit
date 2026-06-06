# DesignAgents Fixes — 2026-06-06 (session 2)

**Trigger:** User request — the landing page (the public marketing page at **bausuite.com**, `src/app/page.tsx`) "has too much going on." Decided direction: **simplify boldly** but **keep it very informative**; primary goal **mainly inform** with **low-pressure CTAs**.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 (2nd DesignAgents session) |
| Agents | Luma (Experience & Page-UX designer); orchestrator did the audit + scoping question |
| Files changed | 1 rewritten (`src/app/page.tsx`) + 1 new (`src/app/landing-content.ts`) |
| Line count | page.tsx **839 → 613** (−391 / +165); +84 new content module |
| Sections | 11 → 7 content sections |
| TypeScript / Lint | tsc clean; eslint clean (only pre-existing `<img>` LCP warnings) |

## Audit Phase

Orchestrator inventoried the existing page: 9 content sections between hero and footer, of which four (Workflow, Tool Ecosystem, Platform Positioning, Built-for-the-Field) pitched the product's value in overlapping framings — the main source of the "too much going on" feeling. Confirmed direction with the owner via two questions: **primary CTA = "mainly inform"**, **cut depth = "bold consolidation."**

## Fixes Applied

### Bold consolidation of the marketing landing page (`src/app/page.tsx`)

**New structure (11 → 7):**
1. **Nav** — kept; unauthed primary CTA relabeled to the lower-pressure "Open BAU Suite."
2. **Hero** — calmed: one soft centered orb (was two animated orbs + grid bg + pulsing badge dot), centered single-column layout, a clear what-it-*is* headline ("The offline-first toolkit for BAS field techs") + two-sentence subhead, **low-pressure CTAs** ("Open BAU Suite" + a quiet ghost "See what's inside" that smooth-scrolls to `#tools`), a compact stats row, and **one** quiet product-glimpse card (replacing three competing preview cards).
3. **Social Proof** — kept with its exact conditional render (`reviews.length > 0 || isAuthed`) so it never shows empty.
4. **What's inside / the tools** — the big merge (old Workflow + Tool Ecosystem + Platform Positioning → one section). Keeps the full categorized tool list (all 4 groups / 19 tools) as a compact grid with trimmed descriptions; the "one workspace replaces a stack of tools" framing lives in the intro.
5. **Built for the field** — tight 4-item differentiators strip (offline-first, one workspace, built-in diagnostics, data stays local), merged from the old Platform + Field card sections.
6. **Desktop App** — kept (Windows-only preserved, with the Mac/Linux web-app note); removed the decorative grid overlay.
7. **Pricing / Support** — Free/Pro/Team tiers + donate fallback kept intact (incl. `isPaywallEnabled()` branching), just calmer.
8. **Closing CTA** — low-pressure ("Take a look around") on a plain bordered section instead of the big gradient sales banner.
9. **Footer** — kept (all product/account links + attribution).

**Removed (framing/noise, not facts):** standalone Workflow/Platform/Field sections (their facts absorbed above), the second orb, hero + desktop grid backgrounds, the heavy gradient closing banner, hover chevrons, `animate-pulse` dots.

**Preserved functionality:** auth-aware routing (`goApp`/`goSignup`/`goLogin`, Tauri short-circuit + `window.location.assign`, authed-vs-unauthed CTA branching), desktop download (`/api/download?format=msi`), donate route, reviews fetch + conditional render, paywall branching. New `scrollToTools` handler → `#tools` (verified the section carries `id="tools"` + `scroll-mt-16`).

**Tech:** theme tokens only, light/dark safe, responsive; no arbitrary `vh` classes; reused existing `hp-*` CSS. Content extracted to `src/app/landing-content.ts` (`toolGroups` + new `fieldHighlights`).

## Verification

- `npx tsc --noEmit` — clean for changed files (only pre-existing `xlsx`/DXR errors remain).
- `npx eslint src/app/page.tsx` — 0 errors (2 pre-existing `<img>` LCP warnings on brand/footer logos, unchanged).
- Live render (dev server, 1440px): h1 centered (`text-align:center`, equal 614px margins), 8 `<section>`s, `id="tools"` anchor confirmed in source, page height notably reduced. (Preview-tool screenshots were downscaled/flaky on this app, so geometry + source checks were used as source of truth.)

## Judgment call flagged for owner review

- The 6-step **"how a job runs in the field" workflow narrative** was dropped entirely (its content overlapped the tool list; "bold consolidation" was the chosen depth). **If that step-by-step story is considered load-bearing for new visitors, it can return as a compact 3-item strip** — say the word.
- This is the live bausuite.com page: recommend eyeballing a deploy preview before promoting to production.
