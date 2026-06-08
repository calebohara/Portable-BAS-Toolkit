# BASAgents Fixes — 2026-06-07 (session 2)

**Trigger:** User report — under Projects → DXR tab, clicking a line item opens a popup with all the row's data, but the fields are read-only. They need to be editable.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-07 (2nd session) |
| Agent | Project Manager (DXR is project data) + 1 read-only scout (Explore) |
| Scope | Make the DXR row detail popup editable |
| Files changed | 2 modified, 2 new |
| Insertions / deletions | ~+236 / −21 |
| TypeScript / Lint | clean |
| Tests | **378 passed** (7 new for the coercion helper) |

## Audit Phase

Scout found the plumbing was already mostly in place: `DxrRowDetailDialog` had a `readOnly` flag (default true) and an **unused `onSave` prop**, and `useProjectDxrs` already exposed `updateDxr()` → `db.updateProjectDxr` → `notifySync('update','dxrs',…)`. The dialog just rendered every field as a read-only `<Input>` and never used `onSave`. The Device edit dialog (`device-dialog.tsx`) was the sibling pattern to mirror.

## Fixes Applied

### DXR detail popup is now editable (`src/components/dxrs/dxr-row-detail-dialog.tsx`)
- Added `form` state hydrated from the row on open (mirrors `device-dialog`); `null/undefined → ''` for display. An `editable` flag (`!readOnly && !!onSave`) switches each field between a bound `<Input>` (edit) and the original read-only rendering (so any read-only context still works).
- **Type-safe save:** number columns (`deviceInstanceNumber`, `applicationNumber`, `network`, `macAddress`, `maxManagerAddress`, `baudRate`) use `inputMode="numeric"` and coerce to a number or `null` (never `NaN`); the boolean column (`autoAddressing`) uses a tri-state Select (Yes / No / —unset → `true`/`false`/`null`); string columns trim, blank → `null`.
- **Identity protected:** `guid` stays read-only even in edit mode (it's the Desigo import dedup key — editing it would create duplicate rows on re-import) with a muted "Desigo identity — not editable" note, and is skipped when building the payload. `id`/`projectId`/`createdAt`/`updatedAt`/`importedFromFileId` are never editable.
- **Save UX:** edit mode shows Cancel + Save (read-only mode keeps Close); `handleSave` builds `{ ...dxr, ...coerced }`, awaits `onSave`, closes; Save disabled while saving.
- Coercion logic extracted to a pure helper `src/components/dxrs/dxr-coerce.ts` (`coerceStringField`, `coerceNumberField`, `coerceTriState`) with `dxr-coerce.test.ts` (7 tests).

### Wired the save (`src/components/dxrs/dxrs-view.tsx`)
- Destructured `updateDxr` from `useProjectDxrs` and passed an async `onSave` to the dialog: `await updateDxr(updated)` + `toast.success('DXR updated')` / error toast + close. Sync is automatic via the existing `notifySync` in `db.updateProjectDxr` — no db/sync changes.

### Read-only resolution
- `DxrsView` is used only at `src/app/projects/[...slug]/client-page.tsx` with no `readOnly` prop (defaults false) → the **local project DXR tab is editable** (the request). The global/shared view uses a separate `GlobalDxrsView` component and is unaffected; the dialog's `readOnly` default stays `true` for safety.

## Verification
- `npx tsc --noEmit` — clean. `npx eslint` on the 4 changed/new files — clean.
- `npx vitest run` — **378 passed** (incl. 7 new coercion tests: null↔'' round-trip, number/NaN handling, tri-state mapping).

### Caveat
- The coercion logic is unit-tested, but the editable dialog itself wasn't exercised in a browser (DXR rows require a project with an imported Desigo file in IndexedDB). Worth one manual check: open a DXR row in a local project, edit a field, Save, reopen to confirm it persisted.
