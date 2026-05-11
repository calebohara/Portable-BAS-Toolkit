# LandingAgents Fixes — 2026-05-10

**Date:** 2026-05-10
**Team:** LandingAgents (Vega · Iris · Onyx · Cyra · Pax)
**Files changed:** 3 (`src/app/page.tsx`, `src/app/globals.css`, `.claude/LandingAgents.md` [new])
**Diff:** +135 / -66 across landing surface (`page.tsx` 157 changed lines, `globals.css` +44)
**Companion doc:** `docs/LandingAgents-audit-2026-05-10.md`

---

## Audit Phase

| Agent | Lens                                    | Files Read                                                                                                       |
|-------|-----------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Vega  | Hero & Above-the-Fold                   | page.tsx (131–314), globals.css (hp-* classes), ui/button.tsx, icon-small.svg                                    |
| Iris  | Visual System & Aesthetic               | page.tsx (full), globals.css (tokens + hp-*), theme-provider, theme-switcher, lib/utils.ts                       |
| Onyx  | Content, Copy & Information Architecture | page.tsx (all string content), README.md, lib/version.ts                                                         |
| Cyra  | Conversion & CTA Strategy               | page.tsx (all CTAs, auth-state branches), lib/paywall.ts, providers/auth-provider.tsx, login/page, donate/page   |
| Pax   | Performance, A11y & Responsive          | page.tsx (full), globals.css (motion + focus), use-scroll-reveal, supabase/client, next.config                   |

---

## Fixes Applied

### P0 — Critical

**`src/app/page.tsx:198–208` — Hero headline rebuild (Vega)**
Issue: three `<br />` tags forced a rigid staircase that broke at every breakpoint and wasted vertical space.
Fix: collapsed into a single wrapping h1 with `text-balance` + `whitespace-nowrap` on the accent phrase ("five apps" stays atomic, the rest wraps naturally). Tightened `lineHeight` to 1.05.

**`src/app/page.tsx:327–392` — Social proof section now conditional (Cyra)**
Issue: empty-state full-bleed band immediately after hero shouted "no one uses this."
Fix: wrapped the entire section in `{(reviews.length > 0 || isAuthed) && (…)}`. Unauthed visitors with zero reviews now skip hero → workflow. Authed users still see the soft "leave a review" prompt.

**`src/app/page.tsx:164` — Nav CTA label parity (Cyra)**
Issue: header said "Get Started", hero said "Get Started Free." The "Free" word is the conversion lever.
Fix: nav button → "Get Started Free" everywhere.

**`src/app/page.tsx:89` — Numerical claim consistency (Onyx)**
Issue: "ten apps" in `fieldBenefits[0]` conflicted with the headline's "five apps" and stats' "19+".
Fix: "One platform, not ten apps" → "One workspace, not a stack of tools" (drops the dueling number).

**`src/app/globals.css:445–490` — Reduced-motion safety net (Pax)**
Issue: hero text used inline `style={{ opacity: 0, animation: 'hp-fade-up …' }}` — under `prefers-reduced-motion: reduce` the animation was cancelled but text stayed invisible. WCAG 2.3.3 / 2.2.2 risk.
Fix: added `[style*="hp-fade-up"], [style*="hp-fade-in"] { opacity: 1 !important; animation: none !important; }` inside the reduce-motion block. Also forced `html { scroll-behavior: auto }` and disabled `.animate-pulse` and the `hp-grid-bg` animation under reduced motion.

**`src/app/page.tsx:410` — Heading order fix (Pax)**
Issue: workflow section h2 → h4 skipped a level (every other section is h2 → h3 → h4).
Fix: promoted workflow card heading from `<h4>` to `<h3>`. Linear outline restored.

**`src/app/page.tsx:775–801` — Footer focus + tap target (Pax)**
Issue: raw `<button>` elements had only `hover:text-foreground` — no focus-visible state, ~16px tap height. WCAG 2.4.7 + 2.5.5/2.5.8.
Fix: added `hp-link-btn block py-1.5 -my-1.5` to every footer button. Negative margin keeps layout pixel-identical while doubling vertical hit area; new `.hp-link-btn` utility (in globals.css) delivers a 2px focus-visible outline with 3px offset.

---

### P1 — High

**`src/app/page.tsx:272, 286, 297` — Hero card float timing (Vega)**
Issue: positive `animationDelay` on `hp-hero-card` left cards 2–4 frozen for up to 2s.
Fix: flipped to negative delays (-2.6s / -1.3s / -3.4s on a 4s loop). All four cards float immediately at offset phases — same organic stagger, zero dead frames.

**`src/app/page.tsx:238` — Stats row honesty (Vega)**
Issue: "19+" hedged a count that's exactly 19 (5+8+3+3 across `toolGroups`).
Fix: "19+" → "19" with `tabular-nums` so the three stat numerals share a baseline grid.

**`src/app/globals.css:58–71` — Terminal & brand tokens (Iris)**
Issue: `#0d1117` / `#30363d` and raw `text-green-400/500` bypassed the design system; brand gradient was duplicated verbatim at two locations.
Fix: added `--color-terminal-bg`, `--color-terminal-border`, `--color-terminal-prompt`, `--color-terminal-text`, `--gradient-brand`, `--pattern-brand-grid` to `@theme inline`.

**`src/app/page.tsx:281–293` — Terminal card consumes tokens (Iris)**
Fix: terminal card now consumes the four `--color-terminal-*` tokens; killed the four raw `text-green-400/500` classes.

**`src/app/page.tsx:514, 517, 699, 702` — Brand gradient tokenized (Iris)**
Fix: Desktop App banner + final CTA both consume `var(--gradient-brand)` and `var(--pattern-brand-grid)`. The book-end is now token-locked.

**`src/app/page.tsx:497` — Section heading deconfliction (Onyx)**
Issue: "Built for the field" used as both section h2 (line 486) and footer byline (line 797).
Fix: section h2 renamed → "Made for site work". Footer byline preserved as the brand line.

**`src/app/page.tsx:368–376` — Empty-state demoted (Onyx)**
Issue: full h2 + apologetic body for "no reviews yet" state ate hero-grade real estate.
Fix: removed h2 + apologetic body; replaced with one-line invitation, smaller icon (h-12/h-6 vs h-14/h-7).

**`src/app/page.tsx:393` — Workflow subhead diversified (Onyx)**
Issue: identical "real constraints/rhythm…" phrasing in workflow + Built-for-Field sections.
Fix: workflow subhead rewritten to a distinct phrasing.

**`src/app/page.tsx:686–692` — Pricing CTA route + label fix (Cyra)**
Issue: "Get Started Free" label routed to `/login` (signin tab), not the signup tab.
Fix: split into `user ? () => router.push('/settings') : goSignup`. Authed → "Manage Subscription" with `Zap` icon; unauthed → "Start Free Trial" with `UserPlus` icon. Lands on `?tab=signup` matching the label.

**`src/app/page.tsx:131–137` — Tauri short-circuit (Pax)**
Issue: 800-line landing DOM rendered before the redirect effect fired on desktop launch.
Fix: added `if (isTauri) return null;` immediately after hooks. Desktop app no longer paints the marketing page before redirect to /login.

---

### P2 — Medium

**`src/app/page.tsx:225` — Sign In hierarchy (Vega)**
Switched from `variant="outline"` to `variant="ghost text-muted-foreground hover:text-foreground"`. Hierarchy now reads primary → secondary at a glance.

**`src/app/page.tsx:192–194` — Eyebrow chip mono version (Vega)**
Split into structured spans; version gets `font-mono text-[11px] tabular-nums`; bullet separator marked `aria-hidden`.

**`src/app/page.tsx:395, 465, 491, 546` — Opacity ramp consolidation (Iris)**
`bg-primary/8` and `bg-white/8` → `/10` with `border-primary/15` (matches `toolGroups.accent` convention already present in the data).

**`src/app/page.tsx:273` — Caption rhythm (Iris)**
`text-[9px]` (only `[9px]` on the page) → `text-[10px]` to match siblings.

**`src/app/page.tsx:90` — Field benefit refrain shift (Onyx)**
"Works offline in the field" → "Works without signal" (less repeat of "field").

**`src/app/page.tsx:46` — Trend Viewer description tightened (Onyx)**
~35 words → ~17 words to match group voice.

**`src/app/page.tsx:81–83` — Pillar copy trims (Onyx)**
- `platformPillars[0]`: dropped trailing "Stop switching apps mid-job."
- `platformPillars[1]`: "Offline-first, always" → "Offline-first"; dropped "no excuses" (out-of-tone).
- `platformPillars[2]`: added Oxford comma in diagnostics list.

**`src/app/page.tsx:208` — Hero subhead deduplicated (Onyx)**
Dropped redundant "offline-first" mention (down from 4× to 2× across the page).

**`src/app/page.tsx:485` — Eyebrow normalization (Onyx)**
"Why it matters" (verb-phrase outlier) → "Field-first" (matches noun-phrase eyebrow system).

**`src/app/page.tsx:631 / 657` — Pricing card sublabel parity (Onyx)**
Free / Pro / Team sublabels normalized to consistent description voice.

**`src/app/page.tsx:760` — Final CTA friction killer (Cyra)**
Added "No credit card required." line under the final CTA. Single biggest signup-friction reducer for SaaS-style funnels.

**`src/app/page.tsx:553–556` — Mac/Linux acknowledgement (Cyra)**
Added Mac/Linux note under the Windows download button so non-Windows visitors don't bounce silently.

---

### P3 — Nit

**`src/app/page.tsx:135` — Glass nav double-edge removed (Vega)**
Removed redundant `border-b border-border/50`; rely on `hp-glass-nav` `box-shadow: 0 1px 0` hairline.

**`src/app/page.tsx:712` — Authed CTA accuracy (Onyx)**
Removed "stored locally with secure cloud sync" framing — sync is opt-in, not always-on.

**`src/app/page.tsx:728` — Final CTA tightened (Onyx)**
Trimmed pricing-section echo: "Create a free account in under a minute. Upgrade only when…"

**`src/app/page.tsx:466` — Platform subhead sharpened (Onyx)**
"every day" → "on every job".

**`src/app/page.tsx:757` — Footer brand blurb tightened (Onyx)**
Trimmed redundant "Offline-first. Field-ready." to one clean line that doesn't echo the byline.

**`src/app/globals.css:157` — `scroll-behavior` reduced-motion override (Pax)**
`scroll-smooth` on html now overridden to `auto` under `prefers-reduced-motion: reduce`.

---

## Housekeeping

- Created `.claude/LandingAgents.md` defining the 5-agent team, file scope, and ownership rules.
- Added 6 new design tokens (`--color-terminal-{bg,border,prompt,text}`, `--gradient-brand`, `--pattern-brand-grid`) to `globals.css @theme inline`.
- Added `.hp-link-btn` utility class to `globals.css` (focus-visible outline for inline link-buttons).
- Expanded the existing `@media (prefers-reduced-motion: reduce)` block to cover inline-styled animation patterns.

---

## Verification

| Check                         | Result                                                                                  |
|-------------------------------|-----------------------------------------------------------------------------------------|
| TypeScript (`bunx tsc --noEmit`) | **Pass** for landing-page scope. One pre-existing unrelated error in `src/lib/sync/__tests__/sync-manager.test.ts:63`. |
| Lint (`bun run lint`)         | **Pass** for landing-page scope. Two pre-existing `<img>` warnings (next/image migration is a separate sweep, flagged by Pax). |
| Diff                          | `src/app/page.tsx` +91/-66 · `src/app/globals.css` +44/-0                              |
| Heading hierarchy             | One `<h1>` (hero) → `<h2>` per section → `<h3>` for cards. Linear, screen-reader friendly. |
| Reduced-motion                | All hero fade animations now have a guarded fallback. Scroll behavior honored.          |

### Untested (recommended follow-up)

- Lighthouse / Core Web Vitals run.
- Real screen-reader pass (VoiceOver / NVDA).
- Real-device tap-target verification (`hp-link-btn` hit area on touch).
- `bun run build` bundle-size delta to size up Cyra's open opportunity to dynamic-import `getSupabaseClient()`.
- Visual regression at sm (390), md (768), lg (1280) breakpoints in both light and dark themes.

---

## Open Items (Not Fixed This Run — See Audit Doc for Full List)

- `hp-grid-bg` keyframe ends at `opacity: 0.03`, effectively invisible in light mode.
- Hero md-breakpoint (768–1023) leaves the right column blank but keeps `lg:grid-cols-2` spacing.
- `text-white/60` fine-print on the brand gradient should be contrast-tested.
- Other pages (`donate`, `desktop`, `dashboard`) still use the inline brand gradient and should migrate to `var(--gradient-brand)` in a follow-up sweep.
