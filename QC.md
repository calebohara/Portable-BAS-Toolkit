# QC.md — Quality Control Checklist

BAU Suite quality control procedures for verifying features across all three build modes (web, static export, desktop/Tauri).

---

## General QC Process

### Pre-Check
- [ ] App builds without errors (`npm run build`)
- [ ] Static export builds without errors (`npm run build:static`)
- [ ] ESLint passes (`npm run lint`)
- [ ] No TypeScript errors
- [ ] App loads in web mode
- [ ] App loads in Tauri dev mode

### Cross-Mode Testing
Every feature must be verified in:
1. **Web mode** (`npm run dev`) — full Next.js with API routes
2. **Desktop mode** (`npm run tauri:dev`) — Tauri wrapper with static export
3. **Offline mode** — disconnect network, verify feature works locally

### Sync Verification
For any feature that writes data:
- [ ] Data saves to IndexedDB when offline
- [ ] Data syncs to Supabase when online
- [ ] Data pulls correctly from Supabase on fresh login
- [ ] Conflicts are detected when editing from two devices
- [ ] Soft-delete propagates correctly

---

## Feature: Bug Reports

### Overview
Users can submit bug reports from any page via the Bug icon button in the TopBar. The current page/tool name is auto-filled into the report. Reports are stored in IndexedDB and synced to Supabase. Admin users can manage reports via the `BugReportsPanel` component.

### Data Layer Checks
- [ ] `BugReport` type exists in `src/types/index.ts`
- [ ] `bugReports` added to `SyncEntityType` union
- [ ] IndexedDB store `bugReports` created in db.ts (version 11)
- [ ] `by-status` and `by-severity` indexes exist
- [ ] CRUD functions: `getAllBugReports`, `getBugReport`, `saveBugReport`, `deleteBugReport`
- [ ] Each write function calls `notifySync()`
- [ ] `field-map.ts` has `bugReports: 'bug_reports'` table mapping
- [ ] `FIELD_OVERRIDES` includes all camelCase → snake_case mappings
- [ ] `bugReports` is in `SYNC_ORDER` (at the end)
- [ ] `bugReports` is NOT in `REQUIRES_PROJECT_ID` (no projectId field)

### UI Checks — TopBar Integration
- [ ] Bug icon button visible in TopBar on every page
- [ ] Clicking bug icon opens the bug report dialog
- [ ] Dialog auto-fills current page name (e.g., "Dashboard (/dashboard)")
- [ ] Title field is required (cannot submit empty)
- [ ] Description field is required
- [ ] Severity dropdown defaults to "medium"
- [ ] Steps to reproduce is optional
- [ ] Auto-captures: app version, device class, OS, current page with title, sync status
- [ ] UUID generated for each report
- [ ] Success toast shown after submission
- [ ] Dialog closes and resets after submission
- [ ] Bug report NOT present in Settings page (removed)

### UI Checks — Admin Panel (`BugReportsPanel`)
- [ ] Panel can be imported and rendered by admin users
- [ ] Shows all reports sorted by newest first
- [ ] Severity badges show correct colors (critical=red, high=orange, medium=yellow, low=blue)
- [ ] Status badges show correct colors (open=blue, in_progress=yellow, resolved=green, closed=gray)
- [ ] Can expand report to see full details (description, steps, device info)
- [ ] Can change report status via dropdown
- [ ] Can delete a report with confirmation
- [ ] Empty state shown when no reports exist

### Sync Checks
- [ ] Submitting a bug report while offline queues it in syncQueue
- [ ] Report syncs to Supabase `bug_reports` table when online
- [ ] Report appears in admin panel after pull sync on another device
- [ ] Deleting a report triggers soft-delete in Supabase
- [ ] Full sync includes bug reports

### Cross-Mode Checks
- [ ] Bug report button visible in TopBar in web mode
- [ ] Bug report button visible in TopBar in Tauri desktop mode
- [ ] Dialog auto-fills correct page context in each mode
- [ ] Device context captured correctly (web shows "desktop"/"mobile", Tauri shows OS)
- [ ] Page title auto-fills correctly on each tool page

### Edge Cases
- [ ] Very long title/description doesn't break layout
- [ ] Rapid multiple submissions don't create duplicates (dedup via sync queue)
- [ ] Report with all optional fields empty saves correctly
- [ ] IndexedDB upgrade from v10 to v11 works (existing data preserved)

---

## Feature: Cloud Sync Paywall

### Overview
Cloud sync, direct messaging, Global Projects, and Knowledge Base are gated behind paid tiers (Pro and Team) when `NEXT_PUBLIC_SYNC_PAYWALL=true`. All local features remain free. The gate is invisible when the flag is off.

### Flag OFF (Regression)
- [ ] `NEXT_PUBLIC_SYNC_PAYWALL` is unset or `false`
- [ ] Sync works for all authenticated users
- [ ] Settings Cloud & Sync section renders normally
- [ ] Global Projects accessible to all authenticated users
- [ ] Knowledge Base accessible to all authenticated users
- [ ] Inbox/mail visible in TopBar for all authenticated users
- [ ] Dashboard shows no upgrade banner
- [ ] Homepage shows donation section (not pricing)
- [ ] No "upgrade" UI visible anywhere
- [ ] `npm run build` succeeds
- [ ] `npm run build:static` succeeds

### Flag ON — Free Tier
- [ ] Sync does not start, status shows 'disabled'
- [ ] Settings shows upgrade CTA (Pro/Team cards) instead of sync controls
- [ ] Dashboard shows upgrade banner with "View Plans" button
- [ ] Homepage shows pricing tiers (Free / Pro / Team) instead of donation CTA
- [ ] Global Projects shows upgrade required page
- [ ] Knowledge Base shows upgrade required page
- [ ] Inbox/mail button hidden in TopBar
- [ ] All local features work normally (projects, tools, etc.)
- [ ] Local backup/restore works

### Flag ON — Pro Tier
- [ ] Sync starts and works normally
- [ ] Settings shows normal sync controls (no upgrade CTA)
- [ ] Dashboard shows no upgrade banner
- [ ] Inbox/mail visible in TopBar
- [ ] Global Projects shows upgrade required (needs Team)
- [ ] Knowledge Base shows upgrade required (needs Team)

### Flag ON — Team Tier
- [ ] Everything in Pro works
- [ ] Global Projects accessible
- [ ] Knowledge Base accessible

### Stripe Integration
- [ ] Checkout creates subscription (not one-time payment)
- [ ] Webhook updates `subscription_tier` in profiles table
- [ ] Cancellation resets tier to 'free'
- [ ] Customer Portal accessible for active subscribers
- [ ] Grace period works (7 days of sync after expiry)

---

## Adding New Features to QC

When adding a new feature, create a new section following this template:

### Template
```
## Feature: [Feature Name]

### Overview
[1-2 sentence description]

### Data Layer Checks
- [ ] Types defined
- [ ] IndexedDB store/migration
- [ ] CRUD functions with notifySync()
- [ ] Sync field mappings

### UI Checks
- [ ] Component renders correctly
- [ ] Form validation works
- [ ] Error states handled
- [ ] Loading states shown

### Sync Checks
- [ ] Offline write → queue → sync
- [ ] Pull sync populates data
- [ ] Delete propagates

### Cross-Mode Checks
- [ ] Web mode
- [ ] Desktop mode
- [ ] Offline mode

### Edge Cases
- [ ] [Feature-specific edge cases]
```

---
---

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
- [ ] `deleteProject` transaction includes ALL related stores
- [ ] `clearAllData` covers ALL stores including `syncConflicts`, `syncMeta`
- [ ] `purgeOrphanedRecords` handles all entity types
- [ ] DB version upgrade path is sequential and non-breaking (check all `if (oldVersion < N)` blocks)
- [ ] Index definitions match query patterns (e.g., `by-project` index on `projectId`)
- [ ] `notifySync` is called after every write operation for entities that sync
- [ ] No mutation of function arguments (always spread/clone before modifying)
- [ ] Timestamps use ISO 8601 format consistently (`new Date().toISOString()`)
- [ ] UUID generation uses `uuid` v4 or `crypto.randomUUID()`

---

### Agent 3: Sync & Field Mapping Testing

Test the cloud sync layer for correctness and completeness.

**Key files**:
- `src/lib/sync/field-map.ts` — entity-to-table mapping, field name overrides
- `src/lib/sync/sync-manager.ts` — push/pull logic, conflict resolution
- `src/lib/sync/sync-bridge.ts` — notification bridge

**Check for**:

- [ ] Every entity type in `SyncEntityType` (from `src/types/index.ts`) has:
  - An entry in `entityTypeToTable`
  - Field overrides for camelCase → snake_case conversion
  - An entry in `SYNC_ORDER`
- [ ] `REQUIRES_PROJECT_ID` Set includes all entity types that have a non-nullable `projectId`
- [ ] Sync order respects foreign key dependencies (projects before files, etc.)
- [ ] Field mapping is bidirectional — push (JS → SQL) and pull (SQL → JS) both work
- [ ] JSON fields (arrays, nested objects) are properly serialized/deserialized
- [ ] Conflict resolution handles: keep local, keep remote, delete both
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

- [ ] No unused imports
- [ ] No unused variables or parameters
- [ ] No `any` types where a specific type exists
- [ ] All types in `src/types/index.ts` are used and exported
- [ ] No circular dependencies between modules
- [ ] `SyncEntityType` union includes all entity types
- [ ] Route constants in `src/lib/routes.ts` match actual page directories
- [ ] No references to removed or renamed files/functions
- [ ] Version consistency across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`

---

### Agent 5: Accessibility, Security & Edge Cases

**Accessibility**:

- [ ] All form inputs have associated `<label>` elements
- [ ] Custom interactive elements have appropriate ARIA roles
- [ ] Focus management: modals trap focus, dialogs return focus on close
- [ ] Keyboard navigation works for all interactive elements
- [ ] Color contrast meets WCAG AA (especially in dark mode)
- [ ] Screen reader announcements for dynamic content

**Security**:

- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] File download filenames are sanitized
- [ ] `URL.revokeObjectURL()` is called after use
- [ ] Clipboard operations wrapped in `try/catch`
- [ ] No secrets or API keys in client-side code
- [ ] CSP headers properly configured in `next.config.ts` and `tauri.conf.json`
- [ ] Supabase RLS policies are not bypassed

**Edge Cases**:

- [ ] Division by zero guards
- [ ] Empty string vs `null` vs `undefined` handling
- [ ] Very long text content doesn't break layout
- [ ] Rapid clicking doesn't create duplicate entries
- [ ] Offline behavior: all features work without network, sync resumes on reconnect

---

### Agent 6: Supabase & Live Database Audit

Verify that every Supabase reference in the codebase has a corresponding live database object.

**Key files**:
- `supabase/schema.sql` — canonical schema definition
- `supabase/migrations/` — SQL scripts for Supabase SQL Editor
- `src/lib/sync/field-map.ts` — `entityTypeToTable`, `SYNC_ORDER`
- `src/types/index.ts` — `SyncEntityType` union

**Check for**:

- [ ] Every table name in `entityTypeToTable` has a matching `CREATE TABLE` in `schema.sql`
- [ ] Every table has: RLS enabled + user policy, `set_updated_at()` trigger, appropriate indexes
- [ ] Every synced table has: `id`, `user_id`, `deleted_at`, `sync_version`, `created_at`, `updated_at`
- [ ] No new entity types added to `SyncEntityType` without a corresponding migration file
- [ ] `REQUIRES_PROJECT_ID` matches tables where `project_id` is `NOT NULL`

**Output**: Generate migration SQL if anything is missing.

---

### Agent 7: Mobile & Responsive Design Testing

**Viewports**: 375px, 428px, 768px, 1024px

**Check for**:

- [ ] Sidebar collapses to hamburger on mobile
- [ ] Top bar actions remain accessible on mobile
- [ ] Cards/grids reflow to single column — no horizontal scroll
- [ ] Tables have horizontal scroll wrapper on mobile
- [ ] Dialogs are full-screen or near-full-screen on mobile
- [ ] Touch targets at least 44x44px
- [ ] Text readable without zooming (minimum 14px on mobile)
- [ ] Long text truncates with ellipsis
- [ ] Tab bars scroll horizontally or wrap
- [ ] No fixed elements overlapping content

**Critical rule**: Mobile fixes must NOT break desktop layout.

---

### Agent 8: Landing Page & Marketing Completeness

Verify `src/app/page.tsx` accurately reflects all current features.

**Check for**:

- [ ] `toolGroups` matches all sidebar tools — nothing missing, nothing stale
- [ ] `heroCards` reflect most important tools
- [ ] `platformPillars` claims match actual capabilities
- [ ] Stats row numbers match real tool count
- [ ] Pricing section (when paywall on) shows correct Free/Pro/Team tiers
- [ ] Footer links valid
- [ ] Version badge displays correctly
- [ ] CTA buttons navigate correctly

---

### Agent 9: README & GitHub Documentation

Verify `README.md` accurately describes the current project.

**Check for**:

- [ ] README exists — generate if missing
- [ ] Feature list matches all sidebar items
- [ ] Tech stack matches `CLAUDE.md`
- [ ] Installation instructions accurate
- [ ] Build commands match `package.json` scripts
- [ ] Version matches `package.json`
- [ ] No references to deprecated features

---

### Reporting Format

Each agent returns findings as:

```
### Agent N: [Area Name]
**Issues Found: X**

1. **[Severity: Critical/High/Medium/Low]** — `file:line` — Description
   - **Expected**: What should happen
   - **Actual**: What happens instead
   - **Fix**: Suggested code change
```

| Level | Definition |
|-------|------------|
| **Critical** | Crashes, data loss, security vulnerabilities |
| **High** | Feature doesn't work, incorrect results, broken UI |
| **Medium** | Missing validation, accessibility gaps, inconsistent behavior |
| **Low** | Code quality, minor UI polish, non-blocking improvements |

---

### Post-Sweep: BUGS.md Update (MANDATORY)

After all agents report:

1. Append a new sweep section to `BUGS.md` — never overwrite previous sweeps
2. Assign sequential issue IDs — format `S{sweep}-{number}`
3. Timestamp every issue
4. Update totals
5. Cross-reference regressions

---

### QC Expert Rules

1. **Severity Calibration** — Critical = data loss/crash. Don't inflate cosmetic issues.
2. **Evidence-Based** — Every finding needs file path, line number, Expected vs Actual.
3. **Minimal Fixes** — Don't propose refactors as bug fixes.
4. **Build Gate** — `tsc --noEmit` and `npm run build` must pass after fixes.
5. **Scope Discipline** — Each agent stays in its lane.
6. **False Positive Prevention** — Verify issues are real before reporting.
7. **Reply Logging** — Log user replies in `REPLY.md` with timestamps.
8. **Pattern-Based Scanning** — Check for recurring bug classes (missing `notifySync`, unsanitized filenames, etc.).
9. **Incremental Value** — Each sweep should find fewer issues than the last.
10. **Cross-File Consistency** — When fixing a pattern, scan all files for the same gap.
11. **Schema Parity Gate** — Every `SyncEntityType` must have all five: CREATE TABLE, entityTypeToTable entry, field overrides, SYNC_ORDER entry, CRUD functions.

---
---

## Part 2: Edge-Case Test Suite Generator

> Generic prompt for generating actual test files. Works with any codebase.

### System Role

You are a Staff-level QA Architect and Test Engineer. You write tests that catch real bugs, not tests that pass for show.

### Objective

Generate a comprehensive test suite covering edge cases, error paths, and boundary conditions.

### Edge Case Categories

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

### Process

1. **Phase 0** — Read `BUGS.md` for regression targets
2. **Phase 1** — Discovery: read project structure, find test framework, study existing tests
3. **Phase 2** — Test Plan: list modules, test count, edge case categories
4. **Phase 3** — Implementation: write test files co-located per project conventions
5. **Phase 4** — Verification: run tests, report pass/fail, flag real bugs as `[BUG FOUND]`

### Target Options

```
- "all public modules"        — scan and test everything with a public API
- "src/[specific/path]"       — test only this module
- "the most critical modules" — use judgment on highest-risk
```

---

## BUGS.md Template

```markdown
# BAU Suite — QA Bug Report

**Date**: YYYY-MM-DD
**Version**: X.X.X
**Total Issues**: N | **Fixed**: N | **Skipped**: N

---

## HIGH

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description | |

## MEDIUM

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description | |

## LOW

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/path/file.tsx:line` | Description | |
```

**Status values**: `FIXED`, `SKIPPED — reason`, `N/A — reason`
