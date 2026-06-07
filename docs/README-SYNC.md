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
_Not run yet — the weekly `weekly-readme-review` routine will populate this. Run it on demand from the Claude app → Scheduled → weekly-readme-review → Run now._
<!-- WEEKLY-AI-REVIEW:END -->
