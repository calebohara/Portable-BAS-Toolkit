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
**Review date:** 2026-07-06
**Deterministic check (`npm run check:readme`):** ✅ PASS — all **19** canonical tools are
referenced (coverage ✅) and the "What's New" top entry **v4.42.0** matches `package.json`.

No change since 2026-06-22: the **two stale version pointers** and the **macOS desktop phantom**
remain unaddressed (all three carried over from 2026-06-08). Tool *coverage* and *descriptions*
are otherwise accurate. Both code claims re-verified this run: the terminal still supports serial
mode (`connectionMode: 'serial'` + baud rate in `src/app/terminal/page.tsx`), and the release
matrix in `.github/workflows/release.yml` is still `windows-latest`-only (`.msi` only, no macOS
runner).

### (a) Missing — tools in code/landing-content not documented in README
✅ None. Every `toolGroups` entry and every sidebar tool is documented. (Command Snippets,
which lives inside the Telnet HMI / terminal page via `useCommandSnippets`, *is* documented
under "Access & Diagnostics" — not a phantom.)

### (b) Stale — README descriptions inaccurate vs the real tool
1. **Version badge + Versioning section still read v4.11.0.** The "What's New" changelog is now
   current, but two version pointers were not bumped with it:
   - **Line 9** — `[![Version](https://img.shields.io/badge/Version-4.11.0-...)]` still shows **4.11.0**.
   - **Line 339** — the **Versioning** section reads "**Current: v4.11.0**".
   The real version is **v4.42.0** (`package.json`).
   → *Correction:* bump both the badge (`Version-4.42.0`) and the "Current:" line to **v4.42.0**.
2. **Telnet HMI bullet omits Serial mode.** Line 210 still describes it as a "browser-based Telnet
   terminal with session tabs, logging, and command history." The actual tool
   (`src/app/terminal/page.tsx`) supports **two connection modes — Telnet (TCP) and Serial**
   (`connectionMode: 'serial' | 'telnet'`, baud-rate selection at line 156/498, native serial port
   enumeration via `nativeSerialListPorts`). The Desktop App table already lists "Serial port / Telnet"
   (line 298), so the tool bullet is internally inconsistent with it.
   → *Correction:* mention serial-port connections (with baud rate) alongside Telnet in the
   Telnet HMI bullet (line 210). The landing-content entry (line 54, "Direct terminal access with
   session logging & ANSI") could likewise note serial, though that's landing copy, not the README.

### (c) Phantom — features described in README that don't exist in code
1. **macOS desktop app.** The README still claims macOS desktop support in three places:
   - Desktop App table (**line 301**): "Platform — **Windows + macOS**".
   - Download line (**line 304**): "Windows .msi / **macOS .dmg**".
   - **What's New v4.9.1** (**line 77**): "**macOS Desktop App** … native macOS app (.dmg) …
     CI/CD pipeline updated with a full macOS aarch64 build matrix."

   The release pipeline (`.github/workflows/release.yml`) builds **only `windows-latest`** (matrix
   line 17), and the release notes table offers only a Windows `.msi` (line 59). There is no macOS
   runner, no `aarch64-apple-darwin` target, and no `.dmg` artifact. This matches the standing
   project rule that **desktop releases are Windows-only**.
   → *Correction:* set Platform to "Windows" and drop the `macOS .dmg` download claim; strike or
   correct the v4.9.1 "macOS Desktop App" changelog entry, which describes a build matrix not in CI.

### Out of scope / aside (not a README finding)
- `src/app/landing-content.ts` (line 43) still describes the Register Tool as decoding "BACnet,
  Modbus & **LonWorks** values," but no LonWorks handling exists in the register-tool code. The
  README's register-tool description (line 203) does **not** make this claim, so the README is fine
  — the drift is in the *landing page copy* and is worth a human glance.

**Summary:** deterministic ✅ PASS · missing **0** · stale **2** · phantom **1** (all three carried
over from 2026-06-08 and still unfixed; only the changelog-lag warning has been resolved).
<!-- WEEKLY-AI-REVIEW:END -->
