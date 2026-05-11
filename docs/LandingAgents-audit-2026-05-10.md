# LandingAgents Audit — 2026-05-10

**Team:** LandingAgents (5 specialists, parallel run)
**Scope:** `src/app/page.tsx` + dependencies
**Date:** 2026-05-10
**Mode:** Audit + apply ALL fixes

| Agent | Lens                                    | Files Read                                                                                                       |
|-------|-----------------------------------------|------------------------------------------------------------------------------------------------------------------|
| Vega  | Hero & Above-the-Fold                   | page.tsx (131–314), globals.css (hp-* classes), ui/button.tsx, icon-small.svg                                    |
| Iris  | Visual System & Aesthetic               | page.tsx (full), globals.css (tokens + hp-*), theme-provider, theme-switcher, lib/utils.ts                       |
| Onyx  | Content, Copy & Information Architecture | page.tsx (all string content), README.md, lib/version.ts                                                         |
| Cyra  | Conversion & CTA Strategy               | page.tsx (all CTAs, auth-state branches), lib/paywall.ts, providers/auth-provider.tsx, login/page, donate/page   |
| Pax   | Performance, A11y & Responsive          | page.tsx (full), globals.css (motion + focus), use-scroll-reveal, supabase/client, next.config                   |

---

## Findings by Priority

### P0 — Critical

| # | Agent | Finding | Location |
|---|-------|---------|----------|
| 1 | Vega  | Headline broken across 3 forced lines; rigid `<br />` staircase fought responsive sizing. `lineHeight: 1.1` too tall for tight hero. | page.tsx:199–202 |
| 2 | Cyra  | Empty social-proof section nuked conversion — "no one uses this" signal directly after hero on a brand-new product. | page.tsx:327–390 |
| 3 | Cyra  | Nav CTA label "Get Started" inconsistent with hero "Get Started Free" — "Free" is the conversion lever and must appear on every primary CTA. | page.tsx:164 |
| 4 | Onyx  | Numerical inconsistency: hero says "five apps", `fieldBenefits[0]` said "ten apps", stats say "19+". | page.tsx:89, 199 |
| 5 | Pax   | Inline `opacity:0` + `animation: hp-fade-up …` left hero text invisible under `prefers-reduced-motion` (existing reduce-motion CSS did not target inline-styled elements). WCAG 2.3.3 / 2.2.2. | page.tsx:189,197,206,214,235,253 |
| 6 | Pax   | Heading-order skip: workflow section jumped `<h2>` → `<h4>`. WCAG 1.3.1 / 2.4.6. | page.tsx:410 |
| 7 | Pax   | Footer link-buttons had no visible focus indicator (only `hover:text-foreground`). WCAG 2.4.7. | page.tsx:775–799 |

### P1 — High

| # | Agent | Finding | Location |
|---|-------|---------|----------|
| 8  | Vega | Hero card float animations stalled up to 2s — positive `animationDelay` only delayed the float keyframe, leaving cards 2–4 frozen on first paint. | page.tsx:272,286,297 |
| 9  | Vega | Stats row hedged with "19+" — actual integrated tool count is exactly 19 (5+8+3+3); the "+" reads as fudging. | page.tsx:238 |
| 10 | Iris | Hardcoded terminal palette (`#0d1117` / `#30363d`) and raw `text-green-400/500` bypassing the design system. | page.tsx:283 |
| 11 | Iris | Brand gradient (`teal → petrol`) duplicated verbatim at Desktop App banner + final CTA, with the same white-grid pattern. | page.tsx:510, 695 |
| 12 | Onyx | "Built for the field" used twice — once as a section h2 and once as the footer byline. | page.tsx:486, 797 |
| 13 | Onyx | Empty-state copy occupied hero-grade real estate with apologetic placeholder ("User Reviews Coming Soon. We're collecting feedback…"). | page.tsx:371–376 |
| 14 | Onyx | Workflow + Built-for-Field sections shared the same "real constraints/rhythm of BAS commissioning, service, and troubleshooting" subhead. | page.tsx:393, 484 |
| 15 | Cyra | Pricing-card primary CTA label was "Get Started Free" but route was `/login` (signin tab) — click intent ≠ landing tab. | page.tsx:679 |
| 16 | Cyra | Authed pricing CTA "View Plans" was a generic verb; "Manage Subscription" describes the actual action. | page.tsx:679 |
| 17 | Pax  | Tauri renders the entire 800-line landing DOM (orbs, fades, Supabase fetch) before the redirect effect fires. | page.tsx:104–111 |
| 18 | Pax  | Footer button tap targets ~16px tall, well below WCAG 2.5.5 / 2.5.8 guidance. | page.tsx:775–799 |

### P2 — Medium

| # | Agent | Finding | Location |
|---|-------|---------|----------|
| 19 | Vega | Sign In CTA at `variant="outline" size="lg"` competed visually with primary "Get Started Free". | page.tsx:225 |
| 20 | Vega | Eyebrow chip used proportional digits for `v{APP_VERSION}` next to a bullet separator — sloppy alignment. | page.tsx:192 |
| 21 | Iris | Non-canonical `bg-primary/8` and `bg-white/8` opacity slugs (Tailwind ramp jumps 5→10→15→20). | page.tsx:395, 465, 491, 546 |
| 22 | Iris | Outlier `text-[9px]` on IP-Plan label among `text-[10px]` siblings. | page.tsx:273 |
| 23 | Onyx | "offline-first" appeared 4× across the page (hero, pillar, benefit, footer). | page.tsx:209, 82, 90, 757 |
| 24 | Onyx | "Stop switching apps" duplicated in headline + `platformPillars[0]` + `fieldBenefits[0]`. | page.tsx:81, 89 |
| 25 | Onyx | Eyebrow "Why it matters" broke the noun-phrase system used by other section eyebrows. | page.tsx:485 |
| 26 | Onyx | Trend Viewer description ran ~35 words vs ~15-word group average. | page.tsx:46 |
| 27 | Onyx | Pricing card sublabels inconsistent (sentence vs noun vs verb). | page.tsx:608, 627, 649 |
| 28 | Onyx | "no excuses" slipped into marketing voice — out of tone. | page.tsx:82 |
| 29 | Cyra | Final CTA missed the highest-impact friction killer ("No credit card required"). | page.tsx:748 |
| 30 | Cyra | Desktop-app banner was a Windows-only dead end — Mac/Linux visitors had no acknowledgement. | page.tsx:545–552 |
| 31 | Pax  | Hero CTAs `size="lg"` (~36px) below WCAG AAA 44×44 tap target. | page.tsx:222–226 |
| 32 | Pax  | `getSupabaseClient()` eagerly imported on landing — adds ~70KB gz to every visitor's bundle. | page.tsx:17 |

### P3 — Nit

| # | Agent | Finding | Location |
|---|-------|---------|----------|
| 33 | Vega | Glass nav had a redundant `border-b border-border/50` fighting the `hp-glass-nav` shadow hairline. | page.tsx:135 |
| 34 | Onyx | Authed final-CTA copy implied always-on cloud sync (it's opt-in). | page.tsx:712 |
| 35 | Onyx | Final CTA echoed pricing-section narrative. | page.tsx:728 |
| 36 | Onyx | Platform section "every day" was soft. | page.tsx:466 |
| 37 | Onyx | Footer brand blurb redundant with byline ("Offline-first. Field-ready." + "Built for the field."). | page.tsx:757 |
| 38 | Pax  | `scroll-smooth` on `html` ignored reduced-motion preference. | globals.css:157 |

**Total findings:** 38 (7 P0 · 11 P1 · 14 P2 · 6 P3)

---

## Cross-Team Flags Resolved In-Run

- **Iris ↔ Onyx**: Empty-state h2 demoted to body copy (Onyx) coordinated with icon resize (Iris) — both consistent.
- **Cyra ↔ Onyx**: CTA labels handed back to Cyra; Onyx flagged "Get Started Free" appearing 3× and `Open App` vs `Go to Dashboard` duality. Partially addressed: nav now consistent ("Get Started Free"); pricing CTA is now "Start Free Trial" / "Manage Subscription" (differentiation achieved).
- **Pax ↔ Onyx**: Empty-state heading removal flagged; Pax accepted it (placeholder shouldn't carry section-heading weight).
- **Vega ↔ Iris**: `hp-grid-bg` opacity issue noted by Vega; Iris did not change it (out of token-system scope). **Open follow-up.**

---

## Open Cross-Team Flags (Not Fixed This Run)

| From → To | Issue | Where |
|-----------|-------|-------|
| Vega → Iris | `hp-grid-bg` keyframe ends at `opacity: 0.03` — invisible against light-mode background. | globals.css |
| Vega → Cyra | At md (768–1023px) hero right column hides but `lg:grid-cols-2` keeps the empty space. Needs an md-condensed preview card. | page.tsx:183, 252 |
| Iris → (other pages) | `donate/page.tsx`, `desktop/page.tsx`, `dashboard/page.tsx` still use inline brand gradient — should migrate to `var(--gradient-brand)`. | follow-up |
| Iris → Vega | Hero badge at page.tsx:188 is a 4th glass flavor (`bg-card/60 backdrop-blur-sm`). Acceptable as one-off; consider `hp-pill` if reused. | page.tsx:188 |
| Cyra → Iris | New fine-print lines use `text-white/60 text-xs` on the gradient — confirm canonical "fine-print on dark gradient" token. | page.tsx:759, 569 |
| Cyra → Pax | `text-white/60` fine-print on teal→petrol gradient may fail AA contrast at the lighter stop. | page.tsx:759, 569 |
| Pax → Vega | Mobile nav has no Sign In path (`hidden sm:inline-flex`) — only Get Started → toggle to signup. Intentional? | page.tsx:160 |
| Pax → Iris | `text-[9px]` / `text-[10px]` on muted-foreground close to legibility floor. | various preview cards |
| Onyx → Cyra | `Open App` (header) vs `Go to Dashboard` (hero) — two labels for one destination. Pick one. | page.tsx:154, 225 |

---

## Verification

- **TypeScript:** pass for all modified files. Single pre-existing error in `src/lib/sync/__tests__/sync-manager.test.ts:63` (unrelated, present before this audit).
- **Lint:** zero new errors/warnings in `src/app/page.tsx` or `src/app/globals.css`. Two pre-existing `<img>` warnings (next/image migration is a separate sweep, flagged by Pax as out-of-scope).
- **Diff:** `src/app/page.tsx` +91/-66 (157 lines changed). `src/app/globals.css` +44 lines added (terminal tokens, brand gradient token, expanded reduced-motion block, `hp-link-btn` utility).
- **Untested (recommended next steps):** Lighthouse run, real screen-reader (VoiceOver/NVDA), real-device tap-target check, `bun run build` bundle-size delta after Supabase dynamic-import opportunity, visual regression at sm/md/lg breakpoints in both themes.

See `docs/LandingAgents-fixes-2026-05-10.md` for the full applied-changes log.
