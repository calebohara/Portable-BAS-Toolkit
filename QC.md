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
