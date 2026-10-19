# LBMesh Editor Extensions — Master Task Roadmap

This document serves as the master tracking board for the implementation of the **LBMesh VS Code, Cursor, and AI Assistant Extensions**.

For execution rules and AI collaboration boundaries, refer to [AI Collaboration Protocol](#ai-collaboration-protocol).

---

## Progress Dashboard

| Phase | Title | Status | Task Spec File |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Foundation, Schema IntelliSense, Snippets & Pre-flight Linting (MVP) | `[ ] Ready` | [`tasks/phase-1-mvp-schema-linting.md`](tasks/phase-1-mvp-schema-linting.md) |
| **Phase 2** | Visual Sidebar & Webview Control Panel | `[ ] Pending Phase 1` | [`tasks/phase-2-sidebar-webview.md`](tasks/phase-2-sidebar-webview.md) |
| **Phase 3** | Conversational AI & Assistant Integrations | `[ ] Pending Phase 2` | [`tasks/phase-3-ai-copilot-bob.md`](tasks/phase-3-ai-copilot-bob.md) |
| **Phase 4** | CI/CD, Packaging & Marketplace Distribution | `[ ] Pending Phase 3` | [`tasks/phase-4-ci-cd-distribution.md`](tasks/phase-4-ci-cd-distribution.md) |

---

## Master Checklist

### Phase 1: Foundation, Schema IntelliSense, Snippets & Pre-flight Linting (MVP)
- [x] **Task 1.1**: Extension Scaffolding & Tooling Setup (`package.json`, `tsconfig.json`, `esbuild`, Mocha test harness)
- [x] **Task 1.2**: JSON/YAML Schema Definition for `recipe.v1.yaml` (`schemas/recipe.v1.json`, YAML Language Server registration)
- [x] **Task 1.3**: Boilerplate Snippets (`snippets/lbmesh-snippets.json` for Postgres, Redis, Services, Recipe headers)
- [ ] **Task 1.4**: Pre-flight Linting & Diagnostic Provider (`src/linter/recipeLinter.ts`, Problems panel integration)
- [ ] **Task 1.5**: Extension Configuration & Command Palette Integration (`lbmesh.binaryPath`, `lbmesh.lintCurrentRecipe`, `lbmesh.version`)

### Phase 2: Visual Sidebar & Webview Control Panel
- [ ] **Task 2.1**: Activity Bar Panel & TreeView Data Providers (`lbmesh-explorer`, Global Services, Project Containers, Port Mappings)
- [ ] **Task 2.2**: CLI & API Bridge for Service Controls (`src/services/lbmeshCli.ts`, inline start/stop/restart buttons)
- [ ] **Task 2.3**: Embedded Dashboard Webview & Log Streaming (`src/views/dashboardWebviewProvider.ts`, Carbon dashboard webview, log viewer)

### Phase 3: Conversational AI & Assistant Integrations
- [ ] **Task 3.1**: VS Code Chat Participant (`@lbmesh`, `/explain`, `/add-service`, `/fix-recipe`, `/doctor`)
- [ ] **Task 3.2**: Code Actions & Quick Fixes (Diagnostics quick fixes, "Deploy Local Stack" CodeLens)
- [ ] **Task 3.3**: IBM Bob & Cursor Integration Assets (`.cursorrules`, SQLite `state.db` diagnostic helpers)

### Phase 4: Packaging, Testing & Distribution
- [ ] **Task 4.1**: Automated CI Workflow (`.github/workflows/ci.yml` across Ubuntu, macOS, Windows)
- [ ] **Task 4.2**: Packaging & Marketplace Distribution Workflow (`.github/workflows/release.yml`, `vsce package`, Open VSX)

---

## AI Collaboration Protocol

Development is executed under a strict two-engine workflow:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          Claude Code            │       │             IBM Bob             │
│   (Builder & Code Writer)       │  ──►  │    (Reviewer & Committer)       │
│                                 │       │                                 │
│ 1. Parse active sub-task        │       │ 1. Code review & architectural  │
│ 2. Implement code & tests       │       │    guidelines check             │
│ 3. Run `npm run compile` & test │       │ 2. Run independent validation   │
│ 4. Hand off (NO git commits)    │       │ 3. Check off task in TASKS.md   │
│                                 │       │ 4. Execute Git commit           │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

1. **Sequential Execution**: Only one sub-task is worked on at a time.
2. **Claude Code Commit Restriction**: Claude Code **never** commits changes to Git. Once code and tests are verified, Claude stops and notifies IBM Bob.
3. **IBM Bob Commit Authority**: IBM Bob reviews code, validates passes, updates `TASKS.md`, and creates the Git commit.
