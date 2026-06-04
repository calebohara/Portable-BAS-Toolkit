# ReviewAgents Findings — BAS Tools — 2026-05-20

**Agent:** BAS Tools Reviewer
**Files reviewed:** 30 (4 pages, 11 register components, 5 psych components, 9 trend components, 8 engine libs, 4 hooks, 4 tests)
**LOC reviewed:** ~6,400 LOC of engine + UI code, ~1,400 LOC of tests

## Summary
| Priority | Count |
|----------|-------|
| P0 | 2 |
| P1 | 9 |
| P2 | 10 |
| P3 | 7 |

---

## P0 — Data loss / crash / security

### Locale-aware CSV value parsing silently corrupts EU-format trend data
- **Location:** `src/lib/trend-csv-parser.ts:298`
- **Current behavior:** Each value cell is parsed with `parseFloat(cell)`. `parseFloat` is locale-blind and only understands `.` as the decimal separator. A European trend export with `1,5` (meaning 1.5) yields `parseFloat("1,5") === 1`. The cell is accepted (not NaN), so the bad value silently enters the dataset, anomaly engine, statistics, and export. There is no scan-pass to detect a comma-decimal column.
- **Why it's a bug:** Field engineers on continental BMS systems (Desigo, Bosch, ABB exports in EU locales) will silently lose decimals across the entire trend. A sensor reading 23,5 °C becomes 23 °C; SHR, anomalies, and PDFs all show wrong numbers. This is the exact "silent unit/format drift" the watch list warns about.
- **Suggested fix:** Detect comma-decimal columns by sampling cells: if a column has rows like `\d+,\d+` and never `\d+\.\d+`, swap separators before `parseFloat`. Surface a "Detected EU decimals — re-parsed with `,` as decimal separator" warning in the preview dialog. Tie this to the existing `timestampFormat: 'eu-locale'` selector so users can force it.
- **Handoff to:** BAS Tools Engineer

### Anomaly threshold inputs accept NaN/null and silently break detection
- **Location:** `src/components/trend-viewer/anomaly-config-sheet.tsx:18-21`
- **Current behavior:** `update()` always coerces empty input to `null` and other inputs through `parseFloat(value)` without an isNaN guard. Six of the seven config fields (`stuckThresholdMinutes`, `stuckTolerance`, `spikeStdDevMultiplier`, `spikeRollingWindowSize`, `oscillationWindowMinutes`, `oscillationMinReversals`, `shortCycleWindowMinutes`, `shortCycleMinTransitions`, `gapThresholdMultiplier`) are typed as `number` (non-nullable) in `AnomalyConfig`. If a user clears a field or types `abc`, the value becomes `null` or `NaN`. Downstream `config.stuckThresholdMinutes * 60_000` → `NaN`, comparisons against `NaN` are always false, and the detector silently returns zero anomalies for that detector. The user sees the panel report "0 anomalies" with no indication anything broke.
- **Why it's a bug:** Hidden detection failure on a field-diagnostic tool — an engineer chasing a hunting loop will believe nothing is wrong. Per watch list: "NaN propagation".
- **Suggested fix:** Branch `update()` by key: nullable keys (`outOfRangeMin`/`Max`) accept empty/null; the rest must clamp to a sensible minimum (e.g., `Math.max(1, parsed)`), reject NaN, and never write null. Add an input-level visual error state when the value is invalid.
- **Handoff to:** BAS Tools Engineer

---

## P1 — Visible bugs

### Coil load Heating/Cooling label is inverted
- **Location:** `src/components/psychrometric/ahu-processes-panel.tsx:271`
- **Current behavior:** Label reads `coilResult.totalLoad > 0 ? 'Heating mode' : 'Cooling mode'`. The engine at `src/lib/psychrometric-engine.ts:424` computes `total = 4.5 * cfm * (entering.enthalpy - leaving.enthalpy)`. Therefore positive total means entering air had more energy than leaving air → energy was removed from the air → **cooling**. The unit test at `src/lib/__tests__/psychrometric-engine.test.ts:467-484` confirms the convention: entering 80°F/50% → leaving 55°F/90% produces a positive sensible load and the test treats it as a cooling coil.
- **Why it's a bug:** A field engineer using the panel sees "Heating mode" for a normal cooling coil on a hot day and the opposite for a heating coil. Will cause real misdiagnoses; also the "tons" calculation just below the label (line 289) compounds the confusion.
- **Suggested fix:** Invert the ternary or, better, decide mode from `entering.dryBulb > leaving.dryBulb` (cooling) vs. `<` (heating). Add a unit test asserting label/mode for one cooling and one heating scenario.
- **Handoff to:** BAS Tools Engineer

### Multi-file CSV drop silently drops every file after the first
- **Location:** `src/components/trend-viewer/csv-upload-panel.tsx:44-48`
- **Current behavior:** `handleFiles` loops through the FileList, but the first file unconditionally hits `if (results.length === 0 && loadedFiles.length === 0) { setPendingFile(...); setIsProcessing(false); return; }`. Subsequent files in the same drop are never parsed. The preview confirm callback only loads the one file from `pendingFile`. The user sees "loaded one file" with no warning about the others.
- **Why it's a bug:** Engineers commonly drop multiple CSV exports from a BMS at once (per-AHU files). The data they think they loaded is missing. No toast, no warning.
- **Suggested fix:** Continue parsing the remaining files into a queue, then either (a) show the preview dialog for the first and auto-load the rest after confirm, or (b) only show preview when a single file is dropped; show a multi-file confirmation summary instead.
- **Handoff to:** BAS Tools Engineer

### Binary-series runtimeHours never accumulates (broken statistic, pinned by test)
- **Location:** `src/lib/trend-anomaly-engine.ts:68-78`
- **Current behavior:** Inside the loop, `prevTs` is assigned `point.timestamp` on line 67 BEFORE the runtime block runs. The runtime block then does `data.find(p => p.timestamp === prevTs)` — which finds the **current** point, not the previous one. So `prevVal === val` always, but more importantly the intent (looking at the prior sample's value) is broken. Test at `src/lib/__tests__/trend-anomaly-engine.test.ts:214-221` documents the broken behavior with a literal comment: *"runtimeMs never accumulates — this tests the actual observable behaviour of the implementation"*.
- **Why it's a bug:** "Runtime (hr)" column in Statistics panel is always `—` for binary equipment runtime — one of the most-requested BAS reporting features. Pinned test will *prevent* future fixes from being accepted.
- **Suggested fix:** Track `prevPrevTs` and the prior value explicitly (e.g., `let lastVal: number|null = null; let lastTs = 0` updated AFTER the runtime block). Then `if (val >= 0.5 && lastVal !== null && lastVal >= 0.5) runtimeMs += point.timestamp - lastTs;`. Update the test at line 214 to assert correct accumulation, not the bug.
- **Handoff to:** BAS Tools Engineer

### Trend session "Save" dialog never attaches the session to a project
- **Location:** `src/components/trend-viewer/session-dialogs.tsx:30`
- **Current behavior:** `handleSave` hardcodes `projectId: ''` in the metadata passed to `onSave`. There is no project picker in the dialog and no way to set it from the parent. So every saved trend session has `projectId: ''`, which means `getProjectTrendSessions(projectId)` will never return it, the project detail page's Trends list is permanently empty, and the activity log entry in `use-trend-sessions.ts:41` is skipped because `data.projectId` is falsy.
- **Why it's a bug:** Feature gap that breaks the per-project storage contract every other tool honours (PID, Psych, Register all expose project pickers). Sessions are findable only via the global "Open" dialog.
- **Suggested fix:** Add a project Select to `SessionSaveDialog`, plumb it through, and persist. Mirror the patterns already in `src/components/psychrometric/sessions-panel.tsx:122-146` and `src/components/register-tool/save-dialog.tsx:79-91`.
- **Handoff to:** BAS Tools Engineer

### Register-tool SaveDialog stores no inputs and no result
- **Location:** `src/components/register-tool/save-dialog.tsx:36-37`
- **Current behavior:** `addCalculation({ ..., inputs: {}, result: {}, ... })` — `inputs` and `result` are always empty. The hooks and DB layer accept and persist them, the `CalculationHistory` panel renders `Object.entries(calc.result)`, but it'll always be empty because the dialog never captures the active module's actual data.
- **Why it's a bug:** Saved Calculations panel shows date/label/notes only — there's no actual calculation to re-open or reference. The whole "Save" feature is effectively a label-only bookmark. The slice 2 file `src/components/register-tool/calculation-history.tsx:52` renders `Object.entries(calc.result).slice(0, 4)` which is always empty.
- **Suggested fix:** Either remove the broken Save button entirely (preferable until the feature is real) OR have each module expose a `getSnapshot(): { inputs, result }` callback that the SaveDialog calls. The latter is the right path — wire up at least QuickConverter, FloatDecoder, ScalingCalculator first.
- **Handoff to:** BAS Tools Engineer

### CSV `parseTimestamp` mixes locale time and UTC silently
- **Location:** `src/lib/trend-csv-parser.ts:121`
- **Current behavior:** `new Date(year, month - 1, day, hour, min, sec, ms)` constructs a Date in the browser's **local** timezone. But the ISO branch (line 71) calls `new Date(trimmed)` which honours the `Z` suffix or offset (UTC). So a CSV with ISO timestamps from a server in UTC and another CSV with `MM/DD/YYYY` exported locally are placed on the same chart with an undeclared offset.
- **Why it's a bug:** Trend lines from two BMS exports of the same physical time window drift by the local UTC offset. Misleading anomaly times, wrong overlay alignment, broken "Jump to anomaly" on multi-source mixes.
- **Suggested fix:** Document the assumption ("times are interpreted in local timezone") in the preview dialog. Allow the user to pick "UTC" vs. "Local" for non-ISO formats. For ISO without offset, treat as local (current behavior is wrong — `new Date("2026-05-20T12:00:00")` parses as local, which is fine; but `2026-05-20T12:00:00Z` is UTC. If both formats coexist in a multi-file merge, normalize before merging).
- **Handoff to:** BAS Tools Engineer

### Psychrometric `db-h` (enthalpy) input has no upper clamp on humidity ratio
- **Location:** `src/lib/psychrometric-engine.ts:108-115` and `src/lib/psychrometric-engine.ts:218-219`
- **Current behavior:** `humidityRatioFromEnthalpy` solves `W = (h - 0.240 * T_db) / (1061 + 0.444 * T_db)`. For unphysical input pairs (e.g., T=75°F, h=80 BTU/lb → W ~0.058 lb/lb, well above saturation) it returns the math result with no clamp. The master solver `computeAllProperties` then clamps `W = Math.max(0, W)` at line 226 (lower bound only) and computes downstream properties from this supersaturated W. RH gets clipped to 100%, but enthalpy and dew point will be nonsensical.
- **Why it's a bug:** Unlike `humidityRatioFromRH` / `humidityRatioFromDewPoint` which clamp at 0.03 lb/lb with a console.warn, the enthalpy path has no upper clamp. Inconsistent validation behavior.
- **Suggested fix:** Add the same `> 0.03` clamp + console.warn pattern to `humidityRatioFromEnthalpy`. Or move the clamping out of the `*FromRH/DP` functions and centralize it in `computeAllProperties`.
- **Handoff to:** BAS Tools Engineer

### `extractBitfield` returns 0 when `length === 32` (JS 32-bit shift wraparound)
- **Location:** `src/lib/register-utils.ts:466-473`
- **Current behavior:** `const mask = (1 << length) - 1`. JavaScript bitwise operators are 32-bit; `1 << 32` evaluates to `1` (the shift count is `32 & 31 = 0`). So `mask = 0`, and the function returns 0 for any 32-bit field width. There is no width parameter or length check.
- **Why it's a bug:** Bitmask Tool offers 32-bit width. If anyone tries to extract a 32-bit field (e.g., a full status word read from a 32-bit holding register pair), they silently get 0. Not exposed in the UI today but the engine is callable.
- **Suggested fix:** Use `length >= 32 ? 0xffffffff : (1 << length) - 1` or `Number((1n << BigInt(length)) - 1n)`. Add a test for length=32.
- **Handoff to:** BAS Tools Engineer

### `parseTimestamp` fallback to `new Date(trimmed)` accepts ambiguous text and silently fills in year
- **Location:** `src/lib/trend-csv-parser.ts:96-98`
- **Current behavior:** When all other branches fail in 'auto' mode, the code does `const d = new Date(trimmed); if (!isNaN(d.getTime())) return d.getTime();`. `new Date("May 20")` returns a Date in the current year (2026) at midnight local time. `new Date("12:30")` returns a valid Date today. So a row whose timestamp column happens to contain text that V8 parses (even nonsensical formats) gets a fabricated timestamp.
- **Why it's a bug:** Bad timestamps silently slip through, producing data points placed at "now" or in the wrong year. The user sees the data on the chart with no warning.
- **Suggested fix:** Drop the silent fallback; if no format matched, return null. Or require year + day + month all present. Aggregate failed-row counts and surface in the preview's warnings panel (the count already exists at line 315 but it's a single bucket — break out "ambiguous date" separately).
- **Handoff to:** BAS Tools Engineer

---

## P2 — Inconsistencies

### `parseTrendCSV` only treats `null`, `NaN`, and empty as null cells
- **Location:** `src/lib/trend-csv-parser.ts:295`
- **Current behavior:** `cell.trim() === ''` || `=== 'null'` || `=== 'NaN'`. Common BMS export sentinels — `#N/A` (WebCTRL), `?Bad`, `null` upper-cased, `--`, `—`, `(none)` — all reach `parseFloat`. `parseFloat("#N/A")` is NaN so they become null. But `parseFloat("Bad")` is also NaN, OK. However `parseFloat("-")` is NaN, but `parseFloat("- 5")` is -5. Mostly fine due to parseFloat being strict, but the explicit allow-list is incomplete.
- **Suggested fix:** Match case-insensitively (`/^(null|nan|n\/a|#n\/a|bad|none|—|--)$/i`). Surface the count of recognized "bad-quality" cells separately from genuinely missing.
- **Handoff to:** BAS Tools Engineer

### CSV clean export does not escape commas/quotes in series names or units
- **Location:** `src/lib/trend-export.ts:8-21`
- **Current behavior:** `[ts, ...values].join(',')` and `[headers.join(',')]`. If a series name is `Pressure, primary (psi)` or a unit is `"H2O`, the resulting CSV is malformed and re-importing it (e.g., into Excel or back into this tool) will scramble columns.
- **Suggested fix:** Quote cells per RFC 4180: wrap in `"`, escape internal `"` as `""`. Either inline or via PapaParse's `unparse`.
- **Handoff to:** BAS Tools Engineer

### Detected header-row logic doesn't account for unit row beneath header
- **Location:** `src/lib/trend-csv-parser.ts:133-160`
- **Current behavior:** `detectHeaderRow` looks for a row of mostly non-numeric, non-timestamp cells, with the **next** row containing numerics or parseable timestamps. Several BMS exports (notably Niagara/Desigo) put a units row (`°F, %, psi, …`) directly below the header. `°F` parses as non-numeric and as a non-timestamp, so `nextNonEmpty / nextNumericOrTs` is low → the heuristic moves the "header" candidate, often picking the units row as the header.
- **Suggested fix:** When the row immediately below the candidate is also mostly non-numeric/non-timestamp but short (1-2 tokens per cell), treat it as a units row and skip it. Or accept a wider gap (header at i, data at i+2).
- **Handoff to:** BAS Tools Engineer

### `relativeHumidityFromW` clamps RH silently to 100% with no signal of supersaturation
- **Location:** `src/lib/psychrometric-engine.ts:118-124`
- **Current behavior:** `return Math.min(Math.max(rh, 0), 100)`. If `W` is above saturation for the given dry bulb (e.g., from `db-w` input with bad value or `humidityRatioFromEnthalpy` overshoot), this silently displays RH=100% rather than flagging an unphysical state.
- **Suggested fix:** Return uncapped RH from the function (or expose an `rhRaw`). The UI layer can clamp for display while displaying a warning ("supersaturated — check inputs").
- **Handoff to:** BAS Tools Engineer

### Anomaly recomputation is split — visibility re-runs anomalies but not stats
- **Location:** `src/app/trend-viewer/page.tsx:139-150` and `:111-124`
- **Current behavior:** Toggling series visibility runs `detectAnomalies` again with only the visible series, but `stats` is computed once from `processData`. The Statistics panel therefore reports stats for hidden series too. Reasonable for "stats over the whole dataset", but the Anomalies count in the tab header shows only-visible anomalies, while Statistics shows all-series — a UX inconsistency.
- **Suggested fix:** Pick one model: either both panels are "all series" or both are "visible series", and label clearly. Recommend "all series" everywhere — hide/show is a chart concern, not a dataset concern.
- **Handoff to:** BAS Tools Engineer

### `formatProperty` for humidityRatio is bypassed in three places, formatted inline differently each time
- **Location:** `src/lib/psychrometric-engine.ts:560-564` (the helper), and three inline sites: `src/components/psychrometric/calculator-panel.tsx:213`, `src/components/psychrometric/ahu-processes-panel.tsx:189`, `src/components/psychrometric/sessions-panel.tsx:95`
- **Current behavior:** Each site hand-rolls `unitSystem === 'ip' ? (value*7000).toFixed(1) + ' gr/lb' : value.toFixed(2) + ' g/kg'` with subtle differences (sessions-panel uses string template, ahu uses props). The shared `formatProperty('humidityRatio', ...)` exists but is structurally awkward because the value passed in differs between IP and SI display states (one path passes lb/lb, the other passes g/kg).
- **Suggested fix:** Make `formatProperty` accept *either* (a) always lb/lb input, OR (b) "already in display units" — and pick one consistently. Pull the three inline sites onto the helper.
- **Handoff to:** BAS Tools Engineer

### Psychrometric `validateInputs` uses physical IP-unit thresholds without unit-system awareness
- **Location:** `src/lib/psychrometric-engine.ts:258-313`
- **Current behavior:** `if (input1 < -80 || input1 > 200)` — these are F bounds. The caller always converts to F before validating, so this is correct in practice, but the function is exported and could be called by future callers with SI inputs.
- **Suggested fix:** Either accept a unit-system param, or rename to `validateInputsIP` to make the invariant explicit.
- **Handoff to:** BAS Tools Engineer

### `oscillationMinReversals * 2` threshold for "critical" is computed twice in the same expression
- **Location:** `src/lib/trend-anomaly-engine.ts:301-305`
- **Current behavior:** `reversals >= config.oscillationMinReversals * 2 ? 'critical' : 'warning'`. The first `if (reversals >= config.oscillationMinReversals)` is the trigger; severity branches on the same value `* 2`. Fine, but pulling out a local makes the intent obvious.
- **Suggested fix:** `const criticalThreshold = config.oscillationMinReversals * 2;`. Minor.
- **Handoff to:** BAS Tools Engineer

### `detectGaps` median calc biases high for even-count interval arrays
- **Location:** `src/lib/trend-anomaly-engine.ts:374-375`
- **Current behavior:** `sorted[Math.floor(sorted.length / 2)]` — picks the upper middle for even counts. Compare with `computeSeriesStats` which correctly averages the two middle values (lines 84-86). Inconsistent within the same file.
- **Suggested fix:** Use the same median helper or pattern in both places.
- **Handoff to:** BAS Tools Engineer

### Modbus `0-based` and `1-based` notations always assume Holding Register
- **Location:** `src/lib/register-utils.ts:638-644`
- **Current behavior:** When notation is 0-based or 1-based, the function hardcodes `registerType = "Holding Register"`, `modicon = (40001 + zeroBased).toString()`, function code FC03. Most BAS use cases are holding registers, but inputs/coils/discrete inputs are common too.
- **Suggested fix:** Either expose a register-type override in the ModbusBuilder UI when notation isn't Modicon, or render an explicit "Holding Register assumed — Modicon notation will disambiguate" note in the UI.
- **Handoff to:** BAS Tools Engineer

---

## P3 — Bloat / dead code / polish

### `exportChartAsPng` leaks the SVG blob URL on error
- **Location:** `src/lib/trend-export.ts:30-69`
- **Current behavior:** `URL.revokeObjectURL(url)` runs only inside `img.onload`. The `img.onerror` path rejects without revoking. Memory leak per failed export, not actually big but trivially avoidable.
- **Suggested fix:** Move `URL.revokeObjectURL(url)` into a `finally` (i.e., revoke in both onload and onerror).
- **Handoff to:** BAS Tools Engineer

### `getValueRangeWarnings` warns "Value is not an integer" for every parseable float
- **Location:** `src/lib/register-utils.ts:199-201`
- **Current behavior:** QuickConverter accepts floats (line 134 of register-utils) and emits a warning. The FloatDecoder doesn't use this — only QuickConverter. The warning will fire constantly when an engineer tests `3.14` or `72.5` in the converter, training them to ignore warnings.
- **Suggested fix:** Either drop the non-integer warning entirely or relocate it so it only fires when the user has selected an integer-typed view (uint16/int16/etc.).
- **Handoff to:** BAS Tools Engineer

### `PID generateRecommendation` `recIntegral` is mutated even in P-only mode
- **Location:** `src/lib/pid-tuning-engine.ts:374-386`
- **Current behavior:** The "long dead time" adjustment block (lines 380-386) runs regardless of `controlMode`. For P-only, `recIntegral` starts at `defaults.integralTime` and may get reassigned to `responseData.deadTimeSeconds * 4` before line 421 nulls it out. Result is correct (final returned integralTime is null for P-only), but the intermediate explanation string still appears in `explanations.integralTime`. The UI then renders a misleading "Integral Time" explanation for a P-only loop.
- **Suggested fix:** Wrap the block in `if (controlMode !== 'p')`.
- **Handoff to:** BAS Tools Engineer

### `relativeHumidity` and `degreeOfSaturation` formatted differently in `formatProperty`
- **Location:** `src/lib/psychrometric-engine.ts:558-573`
- **Current behavior:** RH formatted as `value.toFixed(1)` (already a percentage 0-100); degreeOfSaturation formatted as `(value * 100).toFixed(1)` (the stored value is 0-1). Subtle. Anyone reading the function for the first time has to scan both branches to realise these two visually-identical properties use different storage scales.
- **Suggested fix:** Pick one storage convention (0-1 or 0-100) for both and document. Or unify into a single helper that takes "internal" form and produces "display" form.
- **Handoff to:** BAS Tools Engineer

### PID page redundantly recomputes `gainToProportionalBand` for echo string
- **Location:** `src/app/pid-tuning/page.tsx:892-895`
- **Current behavior:** While `currentValues.proportionalBand` already exists (kept in sync by `updateGainValue`), the small echo string at line 892 calls `gainToProportionalBand(currentValues.gain)` again. Always computes the same value already stored.
- **Suggested fix:** Reference `currentValues.proportionalBand` directly. Trivial.

### OA fraction input collapses empty to 0 silently
- **Location:** `src/components/psychrometric/ahu-processes-panel.tsx:159`
- **Current behavior:** `parseFloat(e.target.value) || 0`. Clearing the field forces the value to 0 (full RA, no OA) which is rarely what the user wants.
- **Suggested fix:** Default to last valid value on empty, or skip update when empty so the user can mid-edit.

### `useCalcAs('enter')` helper handles three cases with a stringly-typed switch
- **Location:** `src/components/psychrometric/ahu-processes-panel.tsx:82-90`
- **Current behavior:** Function takes `'oa' | 'ra' | 'enter'` and dispatches to one of three setter pairs. Light bloat; readable enough as-is. Worth flagging only because future setter additions invite copy-paste drift.
- **Suggested fix:** Optional: refactor to take the setter pair directly.

---

## Handoffs (issues found outside your slice)

- **Sync / DB layer:** Saved register calculations always store `inputs: {}, result: {}` — the underlying schema accepts arbitrary `Record<string, unknown>` per `src/lib/db.ts` repository definition. The breakage is at the UI level (see P1 above), but the schema would benefit from being narrowed or documented. `> Handoff to: Sync Engineer`

- **Activity log:** All four tool hooks (`use-pid-tuning.ts:41`, `use-psychrometric-sessions.ts:41`, `use-trend-sessions.ts:41`) hardcode `user: 'User'`. Outside scope but worth noting for the Identity/Auth reviewer. `> Handoff to: Identity reviewer`

- **Global mode session adapters:** `src/app/pid-tuning/page.tsx:382-435` and `src/app/trend-viewer/page.tsx:82-106` reimplement near-identical local-vs-global session adapter logic. Each call site has a slightly different selection of `data.*` fields. Refactor target if global mode evolves. `> Handoff to: Global Projects reviewer`
