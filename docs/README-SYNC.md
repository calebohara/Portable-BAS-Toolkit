# README ↔ Tools Sync Report

Tracks whether `README.md` accurately describes the actual tools/features in the
codebase. Two layers keep it honest:

- **Deterministic (CI):** `.github/workflows/readme-sync-check.yml` runs
  `scripts/check-readme-sync.mjs` on every push that touches docs/tool files
  (plus a weekly backstop). It asserts every tool in the canonical list
  (`src/app/landing-content.ts` `toolGroups`) is referenced in the README and
  that the "What's New" version matches `package.json`. Run locally:
  `npm run check:readme`.
- **Semantic (weekly AI):** the `weekly-readme-review` scheduled Claude routine
  reads the README against the real tool implementations and judges whether the
  *descriptions* are still accurate (not just present). It overwrites the
  "Latest semantic review" section below each week.

---

## Latest semantic review

<!-- WEEKLY-AI-REVIEW:START -->
**Review date:** 2026-06-08
**Deterministic check (`npm run check:readme`):** ⚠️ WARN — all 19 canonical tools are
referenced (coverage ✅), but the README "What's New" tops out at **v4.21.0** while
`package.json` is **v4.31.1** (non-blocking changelog lag).

Tool *coverage* is fine. The substantive drift this week is **version/release metadata**,
not the tool set. Three stale items and one phantom feature found.

### (a) Missing — tools in code/landing-content not documented in README
✅ None. Every `toolGroups` entry and every sidebar tool is documented. (Command Snippets,
which lives inside the Telnet HMI / terminal page via `useCommandSnippets`, *is* documented
under "Access & Diagnostics" — not a phantom.)

### (b) Stale — README descriptions inaccurate vs the real tool
1. **Version metadata (3 places).** The version badge (line 9, `Version-4.11.0`), the
   **Versioning** section (line 318, "Current: **v4.11.0**"), and the **What's New** heading
   (line 22, "v4.12.0 – v4.21.0") all lag the real version **v4.31.1** (`package.json`).
   → *Correction:* bump the badge and "Current:" to `v4.31.1` and add a changelog block for
   v4.22.0–v4.31.1 (notably the multi-phase **sync hardening** work — Phases 2–4 + the
   v4.31.1 spurious-conflict hotfix — visible in recent git history but absent from the README).
2. **Telnet HMI omits Serial mode.** Line 189 describes it as a "browser-based Telnet terminal
   with session tabs, logging, and command history." The actual tool (`src/app/terminal/page.tsx`)
   supports **two connection modes — Telnet (TCP) and Serial** (`connectionMode: 'serial' | 'telnet'`,
   baud-rate selection, native serial port enumeration). The Desktop App table already references
   "Serial port / Telnet" (line 278), so the tool bullet is internally inconsistent with it.
   → *Correction:* mention serial-port connections (with baud rate) alongside Telnet in the
   Telnet HMI bullet.

### (c) Phantom — features described in README that don't exist in code
1. **macOS desktop app.** The README claims macOS desktop support in two places:
   - Desktop App table (line 280): "Platform — **Windows + macOS**" and line 283
     "Download from GitHub Releases (Windows .msi / **macOS .dmg**)".
   - **What's New v4.9.1** (line 56): "**macOS Desktop App** — BAU Suite is now available as a
     native macOS app (.dmg) … CI/CD pipeline updated with a full macOS aarch64 build matrix."

   The release pipeline (`.github/workflows/release.yml`) builds **only `windows-latest` → `.msi`**;
   there is no macOS runner, no `aarch64-apple-darwin` target, and no `.dmg` artifact. This matches
   the standing project rule that **desktop releases are Windows-only**.
   → *Correction:* remove the macOS `.dmg` / "Windows + macOS" claims from the Desktop App
   section (set Platform to "Windows") and strike or correct the v4.9.1 "macOS Desktop App"
   changelog entry, which describes a build matrix that isn't in CI.

### Out of scope / aside (not a README finding)
- `src/app/landing-content.ts` describes the Register Tool as decoding "BACnet, Modbus & **LonWorks**
  values," but no LonWorks handling exists in the register-tool code. The README's register-tool
  description does **not** make this claim, so the README is fine — but the *landing page copy*
  has its own minor drift worth a human glance.

**Summary:** deterministic ⚠️ WARN (changelog lag) · missing **0** · stale **2** · phantom **1**.
<!-- WEEKLY-AI-REVIEW:END -->
