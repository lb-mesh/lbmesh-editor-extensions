# Phase 4: CI/CD, Packaging & Marketplace Distribution

**Spec File**: `tasks/phase-4-ci-cd-distribution.md`  
**Phase Status**: `[ ] Blocked — awaiting Phase 3 completion`  
**Owner / Builder**: Claude Code  
**Reviewer / Committer**: IBM Bob  

---

## Prerequisites

Before beginning Phase 4, confirm:
- [ ] Phase 1, Phase 2, and Phase 3 tasks are checked off in `TASKS.md`.
- [ ] Extension builds and all unit/integration tests pass.
- [ ] IBM Bob has reviewed and committed Phase 3.

---

## Overview & Objective

Phase 4 completes the development lifecycle by configuring:
1. Automated **GitHub Actions CI** running tests and linting on every commit/PR across macOS, Linux, and Windows.
2. A **Release Workflow** automating VSIX packaging and publishing to VS Code Marketplace and Open VSX.
3. Polished documentation, `README.md`, `CHANGELOG.md`, and license headers.

---

## Tasks Breakdown

### Task 4.1: Automated CI Workflow
- **Status**: `[ ] Pending`
- **Goal**: Ensure every pull request and push is validated automatically.
- **Implementation Steps**:
  1. Create `.github/workflows/ci.yml`:
     - Triggers on: `push` to `main`, `pull_request` to `main`.
     - Matrix strategy: `os: [ubuntu-latest, macos-latest, windows-latest]`, `node-version: [18.x, 20.x]`.
     - Steps:
       1. Checkout repository.
       2. Setup Node.js with cache: `npm`.
       3. `npm ci` (or `npm install`).
       4. `npm run lint` (ESLint check).
       5. `npm run compile` (TypeScript/esbuild build).
       6. `npm test` (Mocha / VS Code test runner).
  2. Verify workflow syntax and local runnability.
- **Target Files**:
  - `.github/workflows/ci.yml`
- **Acceptance Criteria**: CI workflow runs and passes cleanly across operating systems.

---

### Task 4.2: Packaging & Release Workflow
- **Status**: `[ ] Pending`
- **Goal**: Package the extension as a `.vsix` file and automate marketplace release.
- **Implementation Steps**:
  1. Add `@vscode/vsce` and `ovsx` dev dependencies to `package.json`.
  2. Configure `package.json` publishing metadata:
     - `publisher`: `"lbmesh"`
     - `repository`: `https://github.com/lb-mesh/lbmesh-editor-extensions`
     - `icon`: `"assets/icons/lbmesh-icon.png"`
     - `galleryBanner`: `{ "color": "#0a0e1a", "theme": "dark" }`
  3. Create `.github/workflows/release.yml`:
     - Triggered on tag push (`v*.*.*`).
     - Steps:
       1. Checkout and setup Node.
       2. Run tests and compilation.
       3. Run `npx vsce package --out lbmesh-${{ github.ref_name }}.vsix`.
       4. Publish release asset to GitHub Releases.
       5. (Optional conditional step) Publish to VS Code Marketplace via `VSCE_PAT` secret and Open VSX via `OVSX_PAT` secret.
  4. Finalize project documentation:
     - Create `README.md` following blueprint in `editor-plugins-plan.md`.
     - Create `CHANGELOG.md` with initial `v0.1.0` release notes.
     - Ensure `LICENSE` (Apache 2.0) is present and correct.
- **Target Files**:
  - `.github/workflows/release.yml`
  - `README.md`
  - `CHANGELOG.md`
  - `package.json`
- **Verification Commands**:
  ```bash
  npx vsce package
  ```
- **Acceptance Criteria**: `vsce package` generates a valid `.vsix` bundle without packaging warnings.

---

## Phase 4 Completion Handoff

When all Task 4.1–4.2 items pass build and test suites:
1. Verify `vsce package` produces a working `.vsix` file.
2. Ensure no git commits were made.
3. Notify **IBM Bob** for final code review and release tagging.
