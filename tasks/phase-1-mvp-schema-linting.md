# Phase 1: Foundation, Schema IntelliSense, Snippets & Pre-flight Linting (MVP)

**Spec File**: `tasks/phase-1-mvp-schema-linting.md`  
**Phase Status**: `[ ] In Progress`  
**Owner / Builder**: Claude Code  
**Reviewer / Committer**: IBM Bob  

---

## Overview & Objective

Phase 1 establishes the extension repository foundation and delivers the core editor experience:
1. VS Code extension scaffold targeting Node 18+ and VS Code API `^1.85.0` with `esbuild`.
2. JSON Schema definition and YAML Language Server mapping for `.lbmesh/recipe.yaml`.
3. Code snippets for rapid recipe definition (PostgreSQL, Redis, services).
4. Real-time pre-flight linting on file save/edit mapping errors to the VS Code Problems panel.
5. User configuration options and Command Palette actions.

---

## Tasks Breakdown

### Task 1.1: Extension Scaffolding & Tooling Setup
- **Status**: `[x] Completed`
- **Goal**: Initialize the project structure, TypeScript configuration, bundler, and test runner.
- **Implementation Steps**:
  1. Create `package.json` with extension manifest:
     - Name: `lbmesh-vscode`
     - Display Name: `LBMesh`
     - Publisher: `lbmesh`
     - Engines: `vscode: ^1.85.0`
     - Categories: `Programming Languages`, `Linters`, `Snippets`
     - Main entry: `./dist/extension.js`
     - Scripts: `compile`, `watch`, `package`, `lint`, `test`, `vscode:prepublish`
  2. Create `tsconfig.json` with strict type checking, `module: Node16`, `moduleResolution: Node16`, `target: ES2022`.
  3. Set up `esbuild` bundling scripts (`scripts/build.js` or `esbuild` CLI script in `package.json`) targeting `node`, cjs format, source maps enabled for development, and minification for production packaging.
  4. Create `.eslintrc.json`, `.prettierrc`, and `.vscodeignore` excluding unnecessary source/test files from final VSIX bundle.
  5. Create `src/extension.ts` with `activate(context: vscode.ExtensionContext)` and `deactivate()` functions, registering an OutputChannel named `"LBMesh"`.
  6. Create `src/test/` directory with Mocha test harness using `@vscode/test-electron`.
- **Target Files**:
  - `package.json`
  - `tsconfig.json`
  - `.eslintrc.json`
  - `.prettierrc`
  - `.vscodeignore`
  - `src/extension.ts`
  - `src/test/runTest.ts`
  - `src/test/suite/index.ts`
  - `src/test/suite/extension.test.ts`
- **Verification Commands**:
  ```bash
  npm install
  npm run compile
  npm test
  ```
- **Acceptance Criteria**: `npm run compile` and `npm test` execute cleanly with 0 errors.

---

### Task 1.2: JSON/YAML Schema for `recipe.v1.yaml`
- **Status**: `[x] Completed`
- **Goal**: Provide schema-driven autocompletion, hover documentation, and syntax validation for `.lbmesh/recipe.yaml`.
- **Implementation Steps**:
  1. Create `schemas/recipe.v1.json` adhering to JSON Schema Draft-07:
     - Root properties: `version` (e.g. `"1"`), `project` (string), `services` (map of service definitions), `networks`, `volumes`.
     - Service schema: `image` (string), `command` (string/array), `ports` (array of `host:container` or port objects), `environment` / `env` (map or string array), `volumes` (array), `resources` (`memory`, `cpus`), `healthcheck` (`test`, `interval`, `timeout`, `retries`), `depends_on` (string array).
  2. Register schema mapping in `package.json`:
     - Under `contributes.jsonValidation`, map `recipe.v1.json` to file patterns:
       - `**/.lbmesh/recipe.yaml`
       - `**/.lbmesh/recipe.yml`
       - `**/recipe.lbmesh.yaml`
       - `**/recipe.lbmesh.yml`
       - `**/lbmesh.yaml`
       - `**/lbmesh.yml`
  3. Create unit tests verifying schema validation against valid and invalid sample recipes.
- **Target Files**:
  - `schemas/recipe.v1.json`
  - `package.json` (contributes.jsonValidation)
  - `src/test/suite/schema.test.ts`
- **Verification Commands**:
  ```bash
  npm test
  ```
- **Acceptance Criteria**: Recipe files show autocompletion suggestions and underline invalid keys when opened in VS Code.

---

### Task 1.3: Recipe Boilerplate Snippets
- **Status**: `[x] Completed`
- **Goal**: Supply convenient boilerplate templates for fast recipe authoring.
- **Implementation Steps**:
  1. Create `snippets/lbmesh-snippets.json` with snippets:
     - `lbmesh-recipe`: Full recipe scaffold (version, project, initial service).
     - `lbmesh-postgres`: PostgreSQL container configuration with standard environment variables (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) and volume mounts.
     - `lbmesh-redis`: Redis service with port `6379`, memory limit, and health check.
     - `lbmesh-service`: Generic service block with resource bounds (`memory: 256M`, `cpus: 0.5`).
  2. Register snippets in `package.json` under `contributes.snippets` for language `yaml`.
- **Target Files**:
  - `snippets/lbmesh-snippets.json`
  - `package.json` (contributes.snippets)
- **Acceptance Criteria**: Typing `lbmesh-postgres` or `lbmesh-recipe` in a YAML file triggers snippet expansion.

---

### Task 1.4: Pre-flight Linting & Diagnostic Provider
- **Status**: `[x] Completed`
- **Goal**: Run background linting and surface issues in the VS Code "Problems" panel.
- **Implementation Steps**:
  1. Create `src/linter/recipeLinter.ts`:
     - Create a `vscode.DiagnosticCollection` named `lbmesh-recipe`.
     - Implement linting logic:
       - Check if active document matches recipe pattern.
       - If `lbmesh` CLI binary exists (configured via `lbmesh.binaryPath`), execute `lbmesh recipe lint --format=json <file>`.
       - If binary does not exist, execute embedded JSON Schema validation using `ajv` or `yaml` parser to extract syntax/schema errors.
       - Parse line, column, error message, and severity (`Error` vs `Warning`).
       - Set diagnostics on the `DiagnosticCollection`.
  2. Wire lifecycle listeners in `src/extension.ts`:
     - `vscode.workspace.onDidSaveTextDocument`: Trigger lint if `lbmesh.lintOnSave` is true.
     - `vscode.workspace.onDidChangeTextDocument`: Debounced lint (e.g. 500ms delay).
     - `vscode.workspace.onDidCloseTextDocument`: Clear diagnostics for closed file.
  3. Write unit tests for diagnostic parser and error translation.
- **Target Files**:
  - `src/linter/recipeLinter.ts`
  - `src/extension.ts`
  - `src/test/suite/linter.test.ts`
- **Verification Commands**:
  ```bash
  npm test
  ```
- **Acceptance Criteria**: Syntax errors or failed recipe constraints appear in Problems panel and highlight offending lines.

---

### Task 1.5: Extension Configuration & Command Palette Integration
- **Status**: `[ ] Pending`
- **Goal**: Expose user settings and commands in the VS Code Command Palette.
- **Implementation Steps**:
  1. Add configuration section to `package.json` under `contributes.configuration`:
     - `lbmesh.binaryPath`: Path to `lbmesh` binary (default: `"lbmesh"`).
     - `lbmesh.enablePreflightLint`: Enable live linting (default: `true`).
     - `lbmesh.lintOnSave`: Run linting on file save (default: `true`).
     - `lbmesh.logLevel`: Logger verbosity (`"debug" | "info" | "warn" | "error"`, default: `"info"`).
  2. Add commands to `contributes.commands`:
     - `lbmesh.lintCurrentRecipe`: "LBMesh: Lint Current Recipe"
     - `lbmesh.showOutputChannel`: "LBMesh: Show Output Channel"
     - `lbmesh.version`: "LBMesh: Show Installed CLI Version"
  3. Implement command handlers in `src/commands/`:
     - `src/commands/lintRecipeCommand.ts`
     - `src/commands/versionCommand.ts`
  4. Register commands in `src/extension.ts`.
- **Target Files**:
  - `package.json`
  - `src/commands/lintRecipeCommand.ts`
  - `src/commands/versionCommand.ts`
  - `src/extension.ts`
- **Verification Commands**:
  ```bash
  npm run compile
  npm test
  ```
- **Acceptance Criteria**: Commands execute from Command Palette and reflect user settings.

---

## Phase 1 Completion Handoff

When all Task 1.1–1.5 items pass build and test suites:
1. Verify `npm run compile` and `npm test` pass with 0 errors.
2. Ensure no git commits were made.
3. Notify **IBM Bob** for code review and commit.
