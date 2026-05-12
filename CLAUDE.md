# BAU Suite — Claude Code Project Rules

## BASAgents Fix Documentation Rule

**Whenever BASAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/BASAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `BASAgents-fixes-2026-05-09-2.md`.

### Required sections in every fix log

1. **Header block** — date, agent count, files changed, insertions/deletions
2. **Audit Phase** — table of agents, ownership areas, and files read
3. **Fixes Applied** — grouped by priority (P0 / P1 / P2 / P3), each with:
   - File path
   - Issue description (what was wrong and why it mattered)
   - Fix description (what changed and how)
4. **Housekeeping** — any cleanup tasks done outside the fix scope
5. **Verification** — test results, lint output, TypeScript compile status

### Reference

- Agent team definition: `.claude/BASAgents.md`
- Fix log archive: `docs/BASAgents-fixes-*.md`

---

## DesignAgents Fix Documentation Rule

**Whenever DesignAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/DesignAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `DesignAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/DesignAgents.md`
- Fix log archive: `docs/DesignAgents-fixes-*.md`

---

## DxrAgents Fix Documentation Rule

**Whenever DxrAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/DxrAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `DxrAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/DxrAgents.md`
- Fix log archive: `docs/DxrAgents-fixes-*.md`
