# Phase 3: Conversational AI & Assistant Integrations

**Spec File**: `tasks/phase-3-ai-copilot-bob.md`  
**Phase Status**: `[ ] Blocked — awaiting Phase 2 completion`  
**Owner / Builder**: Claude Code  
**Reviewer / Committer**: IBM Bob  

---

## Prerequisites

Before beginning Phase 3, confirm:
- [ ] Phase 1 and Phase 2 tasks are checked off in `TASKS.md`.
- [ ] `npm run compile` and `npm test` pass cleanly.
- [ ] IBM Bob has reviewed and committed Phase 2.

---

## Overview & Objective

Phase 3 introduces AI copilot and assistant integration layers:
1. A **VS Code Chat Participant** (`@lbmesh`) that answers architecture questions and writes/patches recipes.
2. **Code Actions & Quick Fixes** directly in the editor for recipe errors and a CodeLens "Deploy Local Stack" button.
3. **IBM Bob and Cursor AI Integration Assets** (`.cursorrules`, SQLite `~/.lbmesh/state.db` diagnostic helpers, MCP server descriptors).

---

## Tasks Breakdown

### Task 3.1: VS Code Chat Participant (`@lbmesh`)
- **Status**: `[ ] Pending`
- **Goal**: Allow developers to interact with LBMesh via the VS Code Chat sidebar.
- **Implementation Steps**:
  1. Register Chat Participant in `package.json`:
     - Under `contributes.chatParticipants`:
       - `id: "lbmesh.chatParticipant"`, `name: "lbmesh"`, `fullName: "LBMesh Assistant"`.
       - Slash commands:
         - `/explain`: "Explain recipe architecture and resource allocation."
         - `/add-service`: "Scaffold and append a new container service to recipe."
         - `/fix-recipe`: "Analyze and fix syntax/lint errors in recipe."
         - `/doctor`: "Diagnose local Podman / Docker VM resource constraints."
  2. Implement `src/ai/chatParticipant.ts`:
     - Use `vscode.chat.createChatParticipant("lbmesh.chatParticipant", handler)`.
     - Request active workspace `.lbmesh/recipe.yaml` context to inject into prompt context.
     - Select language model using `vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' })`.
     - Format and stream responses using `vscode.ChatResponseStream`:
       - `stream.markdown()` for explanation text.
       - `stream.code()` for YAML patches.
       - `stream.button()` for actionable triggers (e.g. "Apply Patch").
  3. Implement slash command routing:
     - `/explain`: Parses active recipe, generates markdown architectural breakdown.
     - `/add-service`: Prompts user or parses arguments (`redis`, `postgres`, `kafka`) and outputs valid YAML block.
     - `/doctor`: Runs local check via `lbmesh doctor --json` and formats health summary.
  4. Write unit tests for prompt formatting and argument parsing.
- **Target Files**:
  - `src/ai/chatParticipant.ts`
  - `src/ai/prompts.ts`
  - `src/test/suite/chatParticipant.test.ts`
  - `package.json`
- **Acceptance Criteria**: In VS Code Chat, typing `@lbmesh /add-service redis` streams formatted recipe output.

---

### Task 3.2: Code Actions & Quick Fixes
- **Status**: `[ ] Pending`
- **Goal**: Surface editor-level quick fixes and CodeLens actions directly on `.lbmesh/recipe.yaml` files.
- **Implementation Steps**:
  1. Implement `src/providers/codeActionProvider.ts` (`vscode.CodeActionProvider`):
     - Inspects diagnostics on document.
     - Provides quick fixes:
       - Fix missing required keys (`version`, `services`, `image`).
       - Fix invalid port format (e.g. converting `80` to `"80:80"`).
       - Fix missing memory units (e.g. converting `512` to `"512MB"`).
     - Returns `vscode.CodeAction` with `WorkspaceEdit`.
  2. Implement `src/providers/codeLensProvider.ts` (`vscode.CodeLensProvider`):
     - Displays a CodeLens over line 1 of any `.lbmesh/recipe.yaml`:
       - `"▶ Deploy Local Stack (LBMesh)"` → triggers `lbmesh.deployStack`.
       - `"🔍 Lint Recipe"` → triggers `lbmesh.lintCurrentRecipe`.
  3. Register providers in `src/extension.ts` for language `yaml` matching recipe files.
- **Target Files**:
  - `src/providers/codeActionProvider.ts`
  - `src/providers/codeLensProvider.ts`
  - `src/test/suite/codeActionProvider.test.ts`
  - `src/extension.ts`
- **Acceptance Criteria**: Lightbulb quick fix resolves common recipe errors; CodeLens appears at top of recipe files.

---

### Task 3.3: IBM Bob & Cursor Integration Assets
- **Status**: `[ ] Pending`
- **Goal**: Supply system integration configs and prompt templates for IBM Bob and Cursor AI assistant environments.
- **Implementation Steps**:
  1. Create `.cursorrules` in repository root with rules for LBMesh stack generation:
     - Enforces resource limits (`memory`, `cpus`) on all container recipes.
     - Recommends using `lbmesh recipe lint` before saving.
     - Standard port assignment rules avoiding local host conflicts.
  2. Create `ai/bob/` directory with integration tools:
     - `ai/bob/prompts/state_diagnostics.md`: Workspace prompt template teaching IBM Bob how to read and interpret `~/.lbmesh/state.db`.
     - `ai/bob/scripts/inspect_state.py` (or Node.js script `ai/bob/scripts/inspect_state.js`): Standalone utility to query SQLite `state.db` and output structured JSON for AI consumption.
  3. Create documentation in `docs/ai-integration.md` detailing how to use LBMesh with both Cursor and IBM Bob.
- **Target Files**:
  - `.cursorrules`
  - `ai/bob/prompts/state_diagnostics.md`
  - `ai/bob/scripts/inspect_state.js`
  - `docs/ai-integration.md`
- **Acceptance Criteria**: Cursor AI and IBM Bob prompt files are documented and functional.

---

## Phase 3 Completion Handoff

When all Task 3.1–3.3 items pass build and test suites:
1. Verify `npm run compile` and `npm test` pass with 0 errors.
2. Ensure no git commits were made.
3. Notify **IBM Bob** for code review and commit.
