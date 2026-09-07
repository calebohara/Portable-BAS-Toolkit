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
**Review date:** 2026-09-07
**Deterministic check (`npm run check:readme`):** ✅ PASS — all **19** canonical tools are
referenced (coverage ✅) and the "What's New" top entry **v4.43.0** matches `package.json`.

All four findings from 2026-08-10 are **still unfixed** and carry forward (the version pointers and
the macOS phantom have now been carried since 2026-06-08; the DXRs gap since 2026-08-10). Every code
claim was re-verified this run: the terminal still exposes serial mode
(`connectionMode: 'serial'`, `nativeSerialListPorts` in `src/app/terminal/page.tsx`), and
`.github/workflows/release.yml` is still a `windows-latest`-only matrix. **One new finding this
run:** the README's "Command palette" bullet describes a UI that does not exist (below, phantom #2).
Line numbers below are against the current README (shifted from the last report by the v4.43.0
changelog entry).

### (a) Missing — tools in code/landing-content not documented in README
1. **DXRs project tab is undocumented.** *(carried from 2026-08-10)* Both the local and the global
   project pages ship a first-class **DXRs** tab (`src/app/projects/[...slug]/client-page.tsx` and
   `src/app/global-projects/[...slug]/client-page.tsx`) backed by eight components under
   `src/components/dxrs/` — a wide Siemens DXR schema plus **smart paste**, import/export dialogs,
   a row-detail dialog, and an analysis panel. The README's **Features → Project Management**
   section (lines 187–191) lists "devices, IP entries, contacts, notes, and project metadata" but
   never mentions DXRs; the only occurrence of the term in the whole README is incidental, inside
   the v4.11.0 consistency-check enumeration (line 71).
   → *Correction:* add a DXR bullet to **Features → Project Management** (or to Network & Device
   Tools), e.g. "**DXR schedules** — Siemens DXR room-controller tables with smart paste,
   import/export, per-row detail, and an analysis panel; available on local and Global Projects."
   Not a `toolGroups` entry, so the deterministic check cannot catch this.

   *(Re-checked and **not** gaps: Command Snippets — real, via `useCommandSnippets` in the terminal
   page, documented at line 227; Global notepad — real, `src/components/notepad/global-notepad.tsx`;
   Message Board — real, `src/components/global-projects/message-board.tsx`, documented at line 200.)*

### (b) Stale — README descriptions inaccurate vs the real tool
1. **Version badge + Versioning section still read v4.11.0.** *(carried since 2026-06-08)* The
   "What's New" changelog is current, but two version pointers were never bumped with it:
   - **Line 9** — `[![Version](https://img.shields.io/badge/Version-4.11.0-...)]` still shows **4.11.0**.
   - **Line 355** — the **Versioning** section reads "**Current: v4.11.0**".
   The real version is **v4.43.0** (`package.json`). Note the irony of line 355's own wording —
   "synchronized across `package.json`, `tauri.conf.json`, `Cargo.toml`, and the app UI" — while
   the line itself is four minor versions behind.
   → *Correction:* bump both the badge (`Version-4.43.0`) and the "Current:" line to **v4.43.0**.
   Worth considering a permanent fix: point the badge at a shields.io dynamic JSON source reading
   `package.json`, so this can't drift again.
2. **Telnet HMI bullet is wrong on two counts — "browser-based", and no Serial.** *(carried,
   expanded)* Line 226 describes it as a "browser-based Telnet terminal with session tabs, logging,
   and command history."
   - **Serial is missing.** The tool supports **two connection modes — Telnet (TCP) and Serial**
     (`connectionMode: 'serial' | 'telnet'` with baud-rate selection, `src/app/terminal/page.tsx:234`,
     `:509`, `:522`; native port enumeration via `nativeSerialListPorts`). The Desktop App table
     already lists "Serial port / Telnet" (line 314), so the bullet contradicts its own README.
   - **"Browser-based" is misleading.** In the browser the terminal falls back to a WebSocket bridge,
     and with none configured it tells the user verbatim: *"web browsers cannot make raw TCP/Telnet
     connections … Use the BAU Suite desktop app for live Telnet sessions"*
     (`src/app/terminal/page.tsx:1229`). Live Telnet is effectively a desktop capability — which is
     what the Desktop App table says (line 314: Serial port / Telnet — Browser **No**, Desktop **Yes**).
   → *Correction:* rewrite line 226 to name both modes and to place live connections on the desktop
   app, e.g. "**Telnet HMI** — terminal with Telnet (TCP) and serial-port connection modes, session
   tabs, logging, ANSI/256-color rendering, and command history; live connections require the
   desktop app (browsers cannot open raw TCP or serial)." The landing-content entry (line 54,
   "Direct terminal access with session logging & ANSI") could likewise note serial — landing copy,
   not README.

### (c) Phantom — features described in README that don't exist in code
1. **macOS desktop app.** *(carried since 2026-06-08)* The README still claims macOS desktop support
   in three places:
   - Desktop App table (**line 317**): "Platform — **Windows + macOS**".
   - Download line (**line 320**): "Windows .msi / **macOS .dmg**".
   - **What's New v4.9.1** (**line 93**): "**macOS Desktop App** … native macOS app (.dmg) …
     CI/CD pipeline updated with a full macOS aarch64 build matrix."

   The release pipeline (`.github/workflows/release.yml`) builds **only `windows-latest`** (matrix
   line 17), and the release notes text offers only a Windows installer. There is no macOS runner,
   no `aarch64-apple-darwin` target, and no `.dmg` artifact. This matches the standing project rule
   that **desktop releases are Windows-only**.
   → *Correction:* set Platform to "Windows" and drop the `macOS .dmg` download claim; strike or
   correct the v4.9.1 "macOS Desktop App" changelog entry, which describes a build matrix not in CI.
2. **"Command palette" does not exist.** *(new this run)* README **line 250**, under Platform, reads
   "**Command palette** — quick-access command menu for fast navigation." There is no command
   palette in the codebase: no `cmdk` dependency, no `CommandDialog`/`CommandPalette` component, and
   the only `palette` matches in `src/` are the CSS/theme color palette in `globals.css` and
   `settings/page.tsx`. The ⌘K/Ctrl+K handler in `src/components/layout/top-bar.tsx:55-58` calls
   `goToSearch()`, which is `router.push('/search')` (line 33) — it navigates to the Global Search
   page, it does not open a command menu.
   → *Correction:* either delete the "Command palette" bullet, or fold it into the existing "Global
   search" bullet (line 248) as the shortcut it actually is, e.g. "**Global search** — search across
   all projects, files, devices, IP entries, and notes; ⌘K / Ctrl+K from anywhere."

### Out of scope / aside (not a README finding)
- `src/app/landing-content.ts` (line 43) still describes the Register Tool as decoding "BACnet,
  Modbus & **LonWorks** values," but the tool's nine tabs are Converter, Register, Byte Order,
  Float, Bitmask, Scaling, Modbus, Saved, and Help (`src/app/register-tool/page.tsx:25-33`) — no
  LonWorks handling. The README's register-tool description (line 219) does **not** make this claim,
  so the README is fine — the drift is in the *landing page copy* and is worth a human glance.
  (Carried from 2026-08-10.)

**Summary:** deterministic ✅ PASS · missing **1** · stale **2** · phantom **2**. Four items carried
over unfixed (two since 2026-06-08); the "Command palette" phantom is new this run.
<!-- WEEKLY-AI-REVIEW:END -->
