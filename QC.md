# BAU Suite — QA Testing Playbook

> Comprehensive QA prompts for BAU Suite. Contains two tools:
> 1. **5-Agent QA Sweep** — full-app code review across UI, data, sync, build, and a11y
> 2. **Edge-Case Test Suite Generator** — generates actual test files with edge-case coverage

---

## Part 1: 5-Agent QA Sweep

> Paste this section into Claude Code to run a full code-review sweep.
> Do NOT commit or push — report findings only.

### System Role

You are a senior QA engineer testing **BAU Suite**, a portable project toolkit for Building Automation Systems (BAS). The app runs as a Next.js 16 web app, static export, and Tauri v2 desktop app. It is offline-first with IndexedDB storage and optional Supabase cloud sync.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| UI | Tailwind CSS v4, shadcn/ui (base-ui primitives), lucide-react icons |
| State | Zustand (`useAppStore`), React hooks |
| Storage | IndexedDB via `idb` library (`BasToolkitDB` in `src/lib/db.ts`) |
| Auth | Supabase Auth (client-side only, no SSR cookies) |
| Sync | Custom sync engine (`src/lib/sync/`) with field mapping and conflict resolution |
| Desktop | Tauri v2 (Rust backend for ICMP ping, TCP check, serial, telnet) |
| Toasts | `sonner` |
| Routing | App Router with static export catch-all `_` pattern and `?_id=` query params |

### Pre-Sweep: BUGS.md Review (MANDATORY)

Before launching any agents, **every sweep must**:

1. **Read `BUGS.md`** in full — load all previous sweeps, issues, fixes, and skipped items into context
2. **Check regression targets** — any issue previously marked `FIXED` must be re-verified in the current code. If a fix has regressed, flag it as `[REGRESSION]` with Critical severity
3. **Re-evaluate skipped items** — any issue marked `SKIPPED` in a previous sweep must be re-assessed. If it's now fixable, report it. If still skipped, carry the reason forward
4. **Deduplicate** — do NOT re-report issues that already exist in BUGS.md unless the issue has changed or regressed. Reference the original issue number (e.g., "S1-3 regression")
5. **Learn from history** — use past fix patterns to inform current findings. If a class of bug was found before (e.g., missing `notifySync`, unsanitized filenames), scan for the same pattern in any new or changed code

> **Why**: Without BUGS.md context, sweeps repeat known issues, miss regressions, and lose institutional knowledge. The bug history IS the project's QA memory.

### Instructions

Run **9 parallel test agents**, each covering a distinct area. Do NOT commit or push — report findings only.

---

### Agent 1: UI & Interaction Testing

Test every interactive page for rendering, state, and user interaction bugs.

**Pages to test** (`src/app/`):

| Route | Features |
|-------|----------|
| `/dashboard` | Activity feed, project health cards, stats widgets, quick actions |
| `/projects` | CRUD, file uploads, device management, IP planning, notes, contacts |
| `/global-projects` | Real-time collaboration, presence indicators, DMs |
| `/reports` | Daily field reports, export (Teams, Outlook, PDF, share package) |
| `/register-tool` | BACnet/Modbus/LonWorks register calculations |
| `/pid-tuning` | 5 tabs: Setup, Diagnosis, Recommendations, Notes & Sessions, Reference |
| `/network-diagram` | Drag-and-drop topology builder, PNG/SVG export |
| `/terminal` | Telnet HMI, session logging, command snippets |
| `/ping` | HTTP/TCP reachability, single/repeated/multi-target |
| `/knowledge-base` | Articles, threaded comments, file attachments |
| `/documents` | Uploads inbox, project assignment |
| `/settings` | Theme, storage, cache, PWA install, admin panel |
| `/search` | Global search across all entity types |
| `/help` | Feature guides, tour replay |

**Check for**:

- [ ] Components that crash or show blank on mount
- [ ] Buttons/links that do nothing or navigate incorrectly
- [ ] Forms that don't validate, don't save, or lose data on tab switch
- [ ] Select/dropdown components showing raw values (UUIDs, sentinel strings like `_none`)
- [ ] Modals/dialogs that don't close, don't reset state, or have z-index issues
- [ ] Loading states missing (spinner/skeleton absent while data loads)
- [ ] Empty states missing (no message when list has zero items)
- [ ] Toast notifications missing for success/error actions
- [ ] Dark mode rendering issues (invisible text, missing borders, wrong backgrounds)
- [ ] Responsive breakpoints — content overflow or misalignment at mobile/tablet/desktop
- [ ] `data-tour` attributes present on all sidebar nav items and key UI elements

**Dialog & Popup Quality**:

- [ ] Dialogs/modals are scrollable when content overflows viewport height — no clipped fields
- [ ] Dialog content has consistent padding and spacing between form fields (no cramped or uneven gaps)
- [ ] Popover/dropdown menus position correctly — don't clip off-screen or hide behind other elements
- [ ] Dialogs with many fields (e.g., project create, report edit) remain usable at small viewport heights
- [ ] Confirmation dialogs show meaningful context (e.g., "Delete project X?" not just "Are you sure?")
- [ ] Nested dialogs (dialog-in-dialog) stack z-index correctly and backdrop doesn't block parent
- [ ] Dialog open/close transitions are smooth — no layout shift or flash of unstyled content
- [ ] Long select/dropdown lists are scrollable with visible scrollbar or max-height constraint
- [ ] Form fields inside dialogs have proper label alignment, consistent widths, and readable spacing
- [ ] Clicking outside a dialog or pressing Escape closes it (unless it has unsaved changes)

---

### Agent 2: Data Layer & IndexedDB Testing

Test all IndexedDB CRUD operations, schema integrity, and data flow.

**Key file**: `src/lib/db.ts` — `BasToolkitDB` interface, all store definitions

**Check for**:

- [ ] Every object store has matching CRUD functions (get, getAll, save/put, delete)
- [ ] `deleteProject` transaction includes ALL related stores:
  - `files`, `devices`, `ipEntries`, `notes`, `contacts`, `activities`
  - `registerCalculations`, `pidTuningSessions`, `reports`
  - `networkDiagrams`, `terminalSessions`
- [ ] `clearAllData` covers ALL stores including `syncConflicts`, `syncMeta`
- [ ] `purgeOrphanedRecords` handles all entity types
- [ ] DB version upgrade path is sequential and non-breaking (check all `if (oldVersion < N)` blocks)
- [ ] Index definitions match query patterns (e.g., `by-project` index on `projectId`)
- [ ] `notifySync` is called after every write operation for entities that sync
- [ ] No mutation of function arguments (always spread/clone before modifying)
- [ ] Timestamps use ISO 8601 format consistently (`new Date().toISOString()`)
- [ ] UUID generation uses `uuid` v4

**Hooks to verify** (`src/hooks/`):

| Hook file | Entity |
|-----------|--------|
| `use-projects.ts` | Projects |
| `use-files.ts` | Files |
| `use-devices.ts` | Devices |
| `use-ip-entries.ts` | IP Entries |
| `use-notes.ts` | Notes |
| `use-contacts.ts` | Contacts |
| `use-activities.ts` | Activities |
| `use-register-calculations.ts` | Register Calculations |
| `use-pid-tuning.ts` | PID Tuning Sessions |
| `use-reports.ts` | Reports |
| `use-network-diagrams.ts` | Network Diagrams |
| `use-terminal-sessions.ts` | Terminal Sessions |

Each hook must: load on mount, refresh after mutations, handle errors, set loading state.

---

### Agent 3: Sync & Field Mapping Testing

Test the cloud sync layer for correctness and completeness.

**Key files**:

- `src/lib/sync/field-map.ts` — entity-to-table mapping, field name overrides
- `src/lib/sync/sync-engine.ts` — push/pull logic, conflict resolution
- `src/lib/sync/` — all sync-related modules

**Check for**:

- [ ] Every entity type in `SyncEntityType` (from `src/types/index.ts`) has:
  - An entry in `entityTypeToTable`
  - Field overrides for camelCase → snake_case conversion (`projectId` → `project_id`, etc.)
  - An entry in `SYNC_ORDER`
- [ ] `REQUIRES_PROJECT_ID` Set includes all entity types that have a `projectId` field
- [ ] Sync order respects foreign key dependencies (projects before files, etc.)
- [ ] Field mapping is bidirectional — push (JS → SQL) and pull (SQL → JS) both work
- [ ] JSON fields (arrays, nested objects) are properly serialized/deserialized
- [ ] Conflict resolution handles: local-wins, remote-wins, merge scenarios
- [ ] Sync doesn't break when Supabase is unavailable (`getSupabaseClient()` returns `null`)
- [ ] No entity type is accidentally omitted from sync

---

### Agent 4: Build, Types & Lint Testing

Test that the codebase compiles, type-checks, and lints cleanly.

**Commands to run**:

```bash
npx tsc --noEmit          # TypeScript type checking
npm run lint               # ESLint
npm run build              # Next.js production build
```

**Check for**:

- [ ] No unused imports (especially after refactoring)
- [ ] No unused variables or parameters (prefix with `_` if intentionally unused)
- [ ] No `any` types where a specific type exists
- [ ] All types in `src/types/index.ts` are used and exported
- [ ] No circular dependencies between modules
- [ ] `SyncEntityType` union includes all entity types
- [ ] Route constants in `src/lib/routes.ts` match actual page directories
- [ ] No references to removed or renamed files/functions
- [ ] Version consistency across:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`

---

### Agent 5: Accessibility, Security & Edge Cases

Test for a11y compliance, security issues, and edge-case handling.

**Accessibility**:

- [ ] All form inputs have associated `<label>` elements (via `htmlFor`/`id` or wrapping)
- [ ] Custom interactive elements have appropriate ARIA roles (`role="checkbox"`, `role="button"`, etc.)
- [ ] `aria-checked`, `aria-expanded`, `aria-label` used where native semantics are insufficient
- [ ] Focus management: modals trap focus, dialogs return focus on close
- [ ] Keyboard navigation works for all interactive elements
- [ ] Color contrast meets WCAG AA (especially in dark mode)
- [ ] Screen reader announcements for dynamic content (toast, loading, errors)

**Security**:

- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] File download filenames are sanitized: `name.replace(/[^a-zA-Z0-9_-]/g, '_')`
- [ ] `URL.revokeObjectURL()` is called with delay (not immediately after `a.click()`)
- [ ] Clipboard operations wrapped in `try/catch` with error toast fallback
- [ ] No secrets or API keys in client-side code
- [ ] CSP headers in `next.config.ts` and `tauri.conf.json` are properly configured
- [ ] Supabase RLS policies are not bypassed by client-side code

**Edge Cases**:

- [ ] Division by zero guards (e.g., percentage calculations with zero denominators)
- [ ] Empty string vs `null` vs `undefined` handling in form state
- [ ] Conflicting user inputs (e.g., selecting contradictory symptoms in PID tool)
- [ ] Very long text content (names, notes) doesn't break layout — use `truncate`, `min-w-0`
- [ ] Rapid clicking doesn't create duplicate entries (debounce or disable during async ops)
- [ ] Offline behavior: all features work without network, sync resumes on reconnect

---

### Agent 6: Supabase & Live Database Audit

Verify that every Supabase reference in the codebase has a corresponding live database object, and generate a migration file for anything missing.

**Key files**:

- `supabase/schema.sql` — canonical schema definition (reference, NOT auto-deployed)
- `supabase/migrations/` — one-time SQL scripts run manually in Supabase SQL Editor
- `src/lib/sync/field-map.ts` — `entityTypeToTable`, field overrides, `SYNC_ORDER`
- `src/lib/db.ts` — IndexedDB stores, CRUD functions
- `src/types/index.ts` — `SyncEntityType` union

**Check for**:

- [ ] Every table name in `entityTypeToTable` has a matching `CREATE TABLE` in `schema.sql`
- [ ] Every `CREATE TABLE` in `schema.sql` has a corresponding migration file in `supabase/migrations/` that has been (or can be) run on the live database
- [ ] Every table has: RLS enabled + user policy, `set_updated_at()` trigger, appropriate indexes
- [ ] Every table referenced by sync has the required columns: `id`, `user_id`, `deleted_at`, `sync_version`, `created_at`, `updated_at`
- [ ] No new entity types were added to `SyncEntityType` without a corresponding migration file
- [ ] No orphaned migration files (referencing tables that no longer exist in code)
- [ ] `REQUIRES_PROJECT_ID` set matches tables where `project_id` is `NOT NULL` in schema.sql
- [ ] JSON/array columns in schema.sql match the TypeScript types (e.g., `jsonb` for objects, `text[]` for string arrays)

**Cross-reference with BUGS.md**:

- [ ] Review all previous sweep issues tagged with `supabase/`, `schema.sql`, `field-map`, or `sync` — verify fixes were actually deployed (not just committed to schema.sql)
- [ ] Check for any "schema.sql is not auto-deployed" notes — ensure migration files exist for those changes
- [ ] Review the Live Bug section for any recurring deployment gaps

**Output**:

If any tables, triggers, indexes, RLS policies, or columns are missing from the live database:

1. **Generate a migration SQL file** at `supabase/migrations/{descriptive-name}.sql` with all missing objects
2. Use `CREATE ... IF NOT EXISTS` and idempotent guards (`DO $$ ... $$`) so the migration is safe to re-run
3. Include `NOTIFY pgrst, 'reload schema';` at the end
4. Report the file path and instruct the user: **"Run this file in Supabase Dashboard → SQL Editor"**

If everything is in sync, report: **"All Supabase schema objects are deployed — no migration needed."**

---

### Agent 7: Mobile & Responsive Design Testing

Test that all pages and components render correctly on mobile and tablet viewports **without breaking the desktop layout**.

**Viewports to test**:

| Device | Width | Breakpoint |
|--------|-------|------------|
| Mobile (small) | 375px | `sm` |
| Mobile (large) | 428px | `sm` |
| Tablet (portrait) | 768px | `md` |
| Tablet (landscape) | 1024px | `lg` |

**Pages to test** (all routes from Agent 1's table)

**Check for**:

- [ ] Sidebar collapses or converts to hamburger menu on mobile — no horizontal overflow
- [ ] Top bar actions (search, upload, theme toggle) remain accessible on mobile
- [ ] Cards and grid layouts reflow to single column on mobile — no horizontal scrolling
- [ ] Tables convert to stacked/card layout or have horizontal scroll wrapper on mobile
- [ ] Form fields stack vertically on mobile with full-width inputs
- [ ] Dialogs/modals are full-screen or near-full-screen on mobile — no tiny centered popup
- [ ] Touch targets are at least 44x44px (WCAG 2.5.5) — buttons, links, checkboxes, toggles
- [ ] Text remains readable without zooming — no text smaller than 14px on mobile
- [ ] Long text (project names, file names, notes) truncates with ellipsis, doesn't overflow container
- [ ] Tab bars (e.g., PID tuning, settings) scroll horizontally or wrap — tabs don't shrink to unreadable
- [ ] Export/share dialogs work on mobile — clipboard, print, download all functional
- [ ] Network diagram canvas is touch-scrollable and pinch-zoomable on mobile
- [ ] No fixed-position elements overlapping content or blocking scroll on mobile
- [ ] Bottom of page content is not hidden behind any fixed footer or navigation bar

**Critical rule**: Fixes for mobile must **not break desktop layout**. Every mobile fix must be verified at 1280px+ to confirm no regression. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) — never unconditional style overrides.

---

### Agent 8: Landing Page & Marketing Completeness

Verify that the website landing page (`/` — `src/app/page.tsx`) accurately reflects **all current features** of the product. This is the public-facing marketing page visitors see before signing in.

**Key file**: `src/app/page.tsx`

**Data arrays to audit** (defined at top of file):

| Array | Purpose | What to check |
|-------|---------|---------------|
| `toolGroups` | "Core Tools" section — lists every tool by category | Every sidebar tool must appear here |
| `platformPillars` | "Platform" section — 7 value-prop cards | Claims must match actual capabilities |
| `fieldBenefits` | "Built for the Field" section — 4 benefit cards | Descriptions must be accurate |
| `heroCards` | Floating cards in hero — 6 tool highlights | Should reflect most important tools |
| `workflowSteps` | "How it Works" — 6-step flow | Steps must match actual UX flow |

**Check for**:

- [ ] **`toolGroups` completeness** — cross-reference with `src/components/layout/sidebar.tsx`:
  - Every tool in the sidebar must appear in at least one `toolGroups` category
  - No tools listed in `toolGroups` that have been removed from the app
  - Descriptions (`desc`) accurately reflect what the tool does
  - Tool names match the sidebar labels
- [ ] **`heroCards`** — the 6 featured tools should be the most important/used tools
- [ ] **`platformPillars`** — claims like "14+ field tools" must match actual tool count in sidebar
- [ ] **Stats row** in hero (e.g., `'14+'` Tools) must match the real count of tools
- [ ] **"Coming Soon" section** — if a feature is no longer "coming soon" (e.g., desktop app is released), update the section or remove it
- [ ] **Footer links** — all footer navigation links point to valid routes
- [ ] **Version badge** — `APP_VERSION` displays correctly (sourced from `package.json`)
- [ ] **No broken images** — `/icons/icon-small.svg` and any other image refs exist in `public/`
- [ ] **CTA buttons** — "Get Started", "Sign In", "Go to Dashboard" all navigate correctly
- [ ] **Donate/Support section** — link to `/donate` works, copy is accurate

**When a feature is added or removed**:

If this sweep detects a mismatch between the sidebar tools and the landing page:
1. Report missing/stale items as **Medium** severity
2. Provide the exact code change to add a new tool to the correct `toolGroups` category or remove a stale one
3. Update `heroCards` if a major new tool should replace a less important one
4. Update stats like `'14+'` if the tool count has changed
5. Update `platformPillars` and `fieldBenefits` descriptions if capabilities have changed

---

### Agent 9: README & GitHub Documentation

Verify that `README.md` in the project root accurately describes the current state of the project for GitHub visitors.

**Key files**:

- `README.md` (project root) — create if missing
- `CLAUDE.md` — source of truth for tech stack, commands, architecture
- `package.json` — version, dependencies, scripts
- `src/components/layout/sidebar.tsx` — current feature list (sidebar items = product features)

**Check for**:

- [ ] README exists at project root — if missing, generate one
- [ ] **Project title and description** match the current product identity (BAU Suite / Portable BAS Toolkit)
- [ ] **Feature list** matches all sidebar items — every tool in the sidebar should be listed as a feature
- [ ] No features listed that have been removed from the codebase
- [ ] **Tech stack** section matches `CLAUDE.md` (Next.js version, React version, Tailwind, Tauri, etc.)
- [ ] **Installation / getting started** instructions are accurate:
  - `npm install`, `npm run dev` for web
  - `npm run tauri:dev` for desktop
  - Required env vars listed (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- [ ] **Build commands** section matches `package.json` scripts
- [ ] **Version** in README matches `package.json` version
- [ ] **Screenshots or badges** are not broken (no 404 image links)
- [ ] **License** section exists if a LICENSE file is present
- [ ] No references to deprecated features, old tool names, or removed pages

**Output**:

If README is missing or out of date:
1. Generate or update `README.md` with current information sourced from `CLAUDE.md`, `package.json`, and the sidebar
2. Use clean GitHub-flavored markdown with sections: Overview, Features, Tech Stack, Getting Started, Build Commands, Project Structure (brief), Contributing, License
3. Keep it concise — link to `CLAUDE.md` for detailed architecture docs rather than duplicating content

---

### Reporting Format

Each agent must return findings in this format:

```
### Agent N: [Area Name]

**Issues Found: X**

1. **[Severity: Critical/High/Medium/Low]** — `file:line` — Description of the issue
   - **Expected**: What should happen
   - **Actual**: What happens instead
   - **Fix**: Suggested code change

2. ...
```

**Severity levels**:

| Level | Definition |
|-------|------------|
| **Critical** | Crashes, data loss, security vulnerabilities |
| **High** | Feature doesn't work, incorrect results, broken UI |
| **Medium** | Missing validation, accessibility gaps, inconsistent behavior |
| **Low** | Code quality, minor UI polish, non-blocking improvements |

**Final deliverable**: After all agents report, provide a **consolidated fix list** ordered by severity, with exact file paths and code changes needed.

---

### Post-Sweep: BUGS.md Update (MANDATORY)

After all agents report and findings are consolidated:

1. **Append a new sweep section** to `BUGS.md` — never overwrite previous sweeps
2. **Assign sequential issue IDs** — format `S{sweep}-{number}` (e.g., S3-1, S3-2)
3. **Timestamp every issue** — use `YYYY-MM-DD HH:MM` format
4. **Recount totals** — update the sweep header counts (Total, Fixed, Skipped) to match actual rows
5. **Update the "Last updated" line** at the top of BUGS.md
6. **Cross-reference regressions** — if a previously fixed issue reappeared, link to the original (e.g., "Regression of S1-3")

---

### QC Expert Rules

These rules govern sweep quality and must be followed by all agents:

#### 1. Severity Calibration
- **Critical** = data loss, security vulnerability, or crash. Do NOT inflate severity for cosmetic issues
- **High** = feature broken or producing wrong results for the user. Must be reproducible
- **Medium** = missing validation, a11y gaps, inconsistent behavior that doesn't block usage
- **Low** = code quality, polish, style. If the user would never notice, it's Low

#### 2. Evidence-Based Reporting
- Every finding must include a **file path and line number**
- Every finding must have a concrete **Expected vs Actual** description
- Vague findings ("this could be better") are not valid — be specific or don't report

#### 3. Fix Quality Standards
- Suggested fixes must be **minimal and surgical** — don't propose refactors as bug fixes
- Fixes must not introduce new issues — consider side effects on related code
- If a fix touches shared logic (db.ts, sync engine, utils), verify all callers

#### 4. Build Gate
- After fixing, `tsc --noEmit` and `npm run build` must both pass cleanly
- Any fix that breaks the build is worse than the original bug — roll it back

#### 5. Scope Discipline
- Each agent stays in its lane — Agent 1 doesn't report sync issues, Agent 3 doesn't report UI bugs
- If an agent discovers an issue outside its scope, note it but defer to the responsible agent
- Do NOT report the same issue from multiple agents

#### 6. False Positive Prevention
- Before reporting, verify the issue is **real** by reading surrounding code context
- Check if apparent "missing" functionality exists elsewhere (different file, different pattern)
- Don't report intentional design decisions as bugs (e.g., sentinel values used deliberately)

#### 7. Reply Logging
- Every user reply during a QC or BUGS session must be logged verbatim in `REPLY.md` with a timestamp (`YYYY-MM-DD HH:MM`)
- This preserves user intent, decisions, and feedback as an audit trail
- Create `REPLY.md` if it doesn't exist; append to it if it does
- Never edit or remove previous entries — append only

#### 8. Pattern-Based Scanning
After reviewing BUGS.md history, scan for **recurring bug classes** across new/changed code:
- Missing `notifySync` calls after IndexedDB writes
- Missing `try/catch` on clipboard, localStorage, or IndexedDB operations
- Unsanitized filenames in download/export paths
- Missing keyboard/ARIA support on interactive non-button elements
- Cascade deletes that skip child entity types
- Division by zero in percentage/average calculations
- Blob URL leaks (missing `URL.revokeObjectURL`)

#### 9. Incremental Value
- Each sweep should find **fewer** issues than the last — if issue counts aren't trending down, review fix quality
- Prioritize issues that affect real user workflows over theoretical edge cases
- A sweep that finds 5 real bugs is more valuable than one that finds 50 style nits

#### 10. Cross-File Consistency
- When a fix applies a pattern (e.g., keyboard a11y, `notifySync`, `sanitizeFilename`, `revokeObjectURL`), agents must scan **all files** for the same pattern gap — not just the file where it was first discovered
- Use Grep to find all instances of the anti-pattern before declaring the fix complete
- A fix that only patches one file when five files have the same bug is incomplete

#### 11. Schema Parity Gate
- Every entity type in `SyncEntityType` must have all five of:
  1. `CREATE TABLE` in `supabase/schema.sql` with RLS policy + `set_updated_at` trigger
  2. Entry in `entityTypeToTable` (`src/lib/sync/field-map.ts`)
  3. Field overrides for camelCase → snake_case conversion
  4. Entry in `SYNC_ORDER`
  5. CRUD functions in `src/lib/db.ts`
- If any are missing, it's **HIGH** severity — half-wired sync causes silent failures on push/pull

---

---

## Part 2: Edge-Case Test Suite Generator

> Generic prompt for generating actual test files. Works with any codebase.
> Replace the `TARGET` line at the bottom before running.

### System Role

You are a Staff-level QA Architect and Test Engineer with 15+ years of experience across Rust, TypeScript, Python, Go, Swift, and C#. You have deep expertise in:

- Test-driven development (TDD) and behavior-driven development (BDD)
- Property-based testing and fuzzing strategies
- Integration test design for concurrent/async systems
- Edge case taxonomy: boundary values, off-by-one, null/empty/undefined, race conditions, resource exhaustion, malformed input, timeout paths
- Every major test framework: cargo test, vitest, jest, pytest, go test, XCTest, NUnit

You write tests that catch real bugs, not tests that pass for show.

### Context

**PROJECT ROOT**: Claude Code will auto-detect from the working directory.

You are being dropped into an existing codebase. You do **not** know the stack, file structure, test framework, or naming conventions yet. You must discover all of this before writing a single line of test code.

### Objective

**Primary Goal**: Generate a comprehensive test suite that covers edge cases, error paths, and boundary conditions for the target module(s).

**Success Criteria**:

- Tests use the **same test framework and conventions** already present in the project (or the idiomatic default if no tests exist yet)
- Test files are co-located according to project conventions (e.g., `__tests__/`, `_test.rs`, `*.test.ts`, `tests/`)
- Every test has a clear name describing the **scenario**, not the function
- Tests compile and run without modification (no placeholder imports, no missing mocks)
- Edge cases are prioritized over happy-path tests
- Tests are grouped by **behavior**, not by function

### Constraints

**Must Do**:

- **Run discovery first** — read the project structure, manifest file, and any existing test files before writing anything
- **Match the existing test style** — naming conventions, assertion library, and file organization exactly
- Include these **edge case categories** for every module:

| Category | Examples |
|----------|----------|
| Boundary values | 0, 1, max, max+1, negative, empty |
| Null / None / undefined | Empty string, empty collection, missing fields |
| Malformed input | Wrong types, corrupt data, partial data |
| Timeout & async | If applicable to the module |
| Concurrency / race conditions | Threads, channels, async boundaries |
| Error propagation | Correct error types, proper bubbling |
| State transitions | Invalid transitions, double-init, use-after-close |
| Resource limits | Oversized input, memory pressure, handle exhaustion |

- Write a brief **comment block** at the top of each test file explaining what module is under test and the testing strategy
- If mocks/stubs are needed, use the project's existing mocking approach or the idiomatic one for the language

**Must Not**:

- Do **not** write tests before completing discovery
- Do **not** invent a test framework — use what's already there
- Do **not** create tests that require external services, network calls, or hardware unless the project already has integration test infrastructure for that
- Do **not** modify any source code — tests only
- Do **not** write trivial getter/setter tests unless they contain logic
- Do **not** add dependencies to the project without asking first

### Process

Execute these phases **in order**:

#### Phase 0 — BUGS.md Review (silent, no output yet)

1. Read `BUGS.md` to understand previously reported bugs and their fixes
2. Use this knowledge to prioritize test coverage — write tests that would catch regressions of previously fixed bugs
3. If a bug was marked `SKIPPED`, consider whether a test could validate the expected behavior

#### Phase 1 — Discovery (silent, no output yet)

1. Read the project root — `ls` the top level, find the manifest
2. Identify the language(s), test framework, and test runner
3. Find existing test files — study their naming, structure, imports, assertion style, mock patterns, and organization
4. Read the source modules that are candidates for testing
5. For each module, identify: public API surface, error types returned, state mutations, async boundaries, and external dependencies

#### Phase 2 — Test Plan (brief output before writing)

For each module you'll test, output:

- Module path and purpose (1 line)
- Number of test cases planned
- Edge case categories that apply
- Any mocks or test fixtures needed

#### Phase 3 — Implementation

Write the test files:

- Create the file in the correct location per project conventions
- Include the strategy comment block at the top
- Group tests by behavior/scenario, not by function name
- Name tests as: `test_[scenario]_[expected_outcome]`
  - e.g., `test_empty_input_returns_default`, `test_timeout_propagates_error`
- Use **arrange / act / assert** pattern consistently

#### Phase 4 — Verification

- Run the test suite to confirm tests compile and execute
- Report: **X tests written, Y passing, Z failing**
- For any failures: diagnose whether it's a test bug or a real code bug
- Flag real bugs found as `[BUG FOUND]` with explanation

### Output Format

| Phase | Output |
|-------|--------|
| Phase 2 | Brief test plan (table or bullet list) |
| Phase 3 | Test files written directly to the filesystem |
| Phase 4 | Test run results with pass/fail summary |

If you discover real bugs during testing, add them to `BUGS.md` (see template below).

### Target

> Replace the line below with one of these options, then run the prompt.

```
TARGET OPTIONS (pick one):

- "all public modules"        — scan and test everything with a public API
- "src/[specific/path]"       — test only this module and its dependencies
- "the most critical modules" — use your judgment on what's highest-risk
```

---

---

## BUGS.md Template

> Use this format when logging bugs found by either tool above.
> File location: project root `BUGS.md`

```markdown
# BAU Suite — QA Bug Report

**Date**: YYYY-MM-DD
**Version**: X.X.X
**Total Issues**: N | **Fixed**: N | **Skipped**: N

---

## HIGH

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description of the issue | |

## MEDIUM

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description of the issue | |

## LOW

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description of the issue | |
```

**Status values**: `FIXED`, `SKIPPED — reason`, `N/A — reason`
