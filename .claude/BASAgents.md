# BASAgents — BAU Suite Agent Team

**Team:** BASAgents
**Project:** Portable-BAS-Toolkit (BAU Suite)
**Agents:** 5
**Purpose:** Specialized AI agents for parallel development on the BAU Suite BAS field toolkit.
**Fix log rule:** After every audit + fix session, create `docs/BASAgents-fixes-YYYY-MM-DD.md`. See `CLAUDE.md` for full spec.

---

## Team Roster

### 1. BAS Tools Engineer
**Role:** Owns all engineering calculation and analysis tools — the technical heart of the BAS toolkit.
**Traits:** technical · analytical · systematic
**Color:** #4ECDC4
**Voice:** James (`ZQe5CZNOzWyzPSCn5a3c`)
**Voice Settings:** stability: 0.5 · similarity_boost: 0.75 · style: 0 · speed: 1.0

**File Ownership:**
```
src/app/pid-tuning/
src/app/psychrometric/
src/app/register-tool/
src/app/trend-viewer/
src/components/register-tool/
src/components/psychrometric/
src/components/trend-viewer/
src/lib/pid-tuning-engine.ts
src/lib/psychrometric-engine.ts
src/lib/register-utils.ts
src/lib/trend-anomaly-engine.ts
src/lib/trend-colors.ts
src/lib/trend-csv-parser.ts
src/lib/trend-downsample.ts
src/lib/trend-export.ts
src/hooks/use-pid-tuning.ts
src/hooks/use-psychrometric-sessions.ts
src/hooks/use-register-calculations.ts
src/hooks/use-trend-sessions.ts
src/lib/__tests__/pid-tuning-engine.test.ts
src/lib/__tests__/psychrometric-engine.test.ts
src/lib/__tests__/register-utils.test.ts
src/lib/__tests__/trend-anomaly-engine.test.ts
```

**Spawn Command:**
```bash
bun run ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "technical,analytical,systematic" --task "BAS engineering tools task here"
```

---

### 2. Field Connectivity
**Role:** Owns all BAS field connectivity tools — terminal sessions, network discovery, ping, and web interface.
**Traits:** technical · enthusiastic · rapid
**Color:** #2ECC71
**Voice:** James (`ZQe5CZNOzWyzPSCn5a3c`)
**Voice Settings:** stability: 0.5 · similarity_boost: 0.75 · style: 0 · speed: 1.0

**File Ownership:**
```
src/app/terminal/
src/app/ping/
src/app/web-interface/
src/app/network-diagram/
src/components/web-interface/
src/components/network-diagram/
src/lib/hmi/
src/store/terminal-store.ts
src/store/web-interface-store.ts
src-tauri/src/main.rs          (ICMP ping, TCP check, serial, telnet commands)
src-tauri/capabilities/
```

**Spawn Command:**
```bash
bun run ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "technical,enthusiastic,rapid" --task "Field connectivity task here"
```

---

### 3. Project Manager
**Role:** Owns project lifecycle management, global collaboration, reports, documents, and knowledge base.
**Traits:** research · analytical · systematic
**Color:** #3498DB
**Voice:** Rachel (`21m00Tcm4TlvDq8ikWAM`)
**Voice Settings:** stability: 0.55 · similarity_boost: 0.75 · style: 0.15 · speed: 1.0

**File Ownership:**
```
src/app/projects/
src/app/global-projects/
src/app/reports/
src/app/documents/
src/app/knowledge-base/
src/app/search/
src/components/projects/
src/components/global-projects/
src/components/reports/
src/components/files/
src/components/notes/
src/components/inbox/
src/components/share/
src/hooks/use-projects.ts
src/hooks/use-global-projects.ts
src/hooks/use-knowledge-base.ts
src/hooks/use-inbox.ts
src/lib/global-projects/
src/lib/knowledge-base/
src/lib/global-search.ts
src/types/global-projects.ts
src/types/index.ts
src/types/knowledge-base.ts
```

**Spawn Command:**
```bash
bun run ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "research,analytical,systematic" --task "Project management task here"
```

---

### 4. Platform Engineer
**Role:** Owns auth, cloud sync, payments, API routes, and settings — the platform layer that everything else relies on.
**Traits:** security · analytical · thorough
**Color:** #9B59B6
**Voice:** Daniel (`onwK4e9ZLuTAKqWW03F9`)
**Voice Settings:** stability: 0.7 · similarity_boost: 0.85 · style: 0.05 · speed: 0.95

**File Ownership:**
```
src/app/api/
src/app/login/
src/app/register-tool/
src/app/forgot-password/
src/app/reset-password/
src/app/pending-approval/
src/app/donate/
src/app/settings/
src/components/settings/
src/providers/auth-provider.tsx
src/providers/sync-provider.tsx
src/hooks/use-auth-gate.ts
src/hooks/use-online-users.ts
src/lib/supabase/
src/lib/sync/
src/lib/paywall.ts
src/lib/stripe-config.ts
src/lib/rate-limit.ts
src/lib/maintenance.ts
src/lib/error-reporting.ts
src/lib/storage.ts
src/lib/db.ts
src/lib/__tests__/db.test.ts
src/lib/sync/__tests__/sync-manager.test.ts
src/store/app-store.ts
src/store/notepad-store.ts
supabase/
```

**Spawn Command:**
```bash
bun run ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "security,analytical,thorough" --task "Platform/auth/sync task here"
```

---

### 5. Desktop & Build
**Role:** Owns the Tauri desktop wrapper, tri-mode build system, CI/CD, UI shell, PPCL editor, and app-wide layout.
**Traits:** technical · skeptical · thorough
**Color:** #E74C3C
**Voice:** James (`ZQe5CZNOzWyzPSCn5a3c`)
**Voice Settings:** stability: 0.5 · similarity_boost: 0.75 · style: 0 · speed: 1.0

**File Ownership:**
```
src-tauri/                         (except main.rs ICMP commands → Field Connectivity)
src/app/layout.tsx
src/app/globals.css
src/app/desktop/
src/app/offline/
src/app/help/
src/app/ppcl-editor/
src/components/layout/
src/components/ui/
src/components/shared/
src/components/theme/
src/components/onboarding/
src/components/ppcl-editor/
src/components/pwa/
src/components/maintenance/
src/components/notepad/
src/hooks/use-device-class.ts
src/hooks/use-keyboard-shortcut.ts
src/hooks/use-scroll-reveal.ts
src/hooks/use-ppcl-documents.ts
src/lib/ppcl-language.ts
src/lib/tauri-bridge.ts
src/lib/routes.ts
src/lib/updater.ts
src/lib/version.ts
src/lib/utils.ts
src/store/ppcl-editor-store.ts
scripts/
next.config.ts
next-env.d.ts
tsconfig.json
vitest.config.ts
eslint.config.mjs
postcss.config.mjs
components.json
.github/workflows/
```

**Spawn Command:**
```bash
bun run ~/.claude/skills/Agents/Tools/ComposeAgent.ts --traits "technical,skeptical,thorough" --task "Desktop/build/UI task here"
```

---

## Spawn All Agents (Parallel)

To launch all 5 agents simultaneously on independent tasks, pass them to the Agent tool in a single message with separate `subagent_type: "general-purpose"` calls and inject the composed prompt as the system prompt context.

## Ownership Rules

1. **Cross-cutting changes** (e.g., adding a new Supabase table used by multiple tools) — Platform Engineer leads, other agents contribute.
2. **New tool pages** — BAS Tools Engineer or Field Connectivity leads the feature, Desktop & Build owns the route wiring and sidebar entry.
3. **Conflicts** — The agent whose ownership list is more specific wins.
4. **Shared lib utilities** (`src/lib/utils.ts`, `src/types/index.ts`) — Desktop & Build or Platform Engineer owns, others may PR.

## Quick Reference

| Agent | Color | Voice | Traits |
|-------|-------|-------|--------|
| BAS Tools Engineer | #4ECDC4 | James | technical · analytical · systematic |
| Field Connectivity | #2ECC71 | James | technical · enthusiastic · rapid |
| Project Manager | #3498DB | Rachel | research · analytical · systematic |
| Platform Engineer | #9B59B6 | Daniel | security · analytical · thorough |
| Desktop & Build | #E74C3C | James | technical · skeptical · thorough |
