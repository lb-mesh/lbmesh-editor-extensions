# Phase 2: Visual Sidebar & Webview Control Panel

**Spec File**: `tasks/phase-2-sidebar-webview.md`  
**Phase Status**: `[ ] Blocked — awaiting Phase 1 completion`  
**Owner / Builder**: Claude Code  
**Reviewer / Committer**: IBM Bob  

---

## Prerequisites

Before beginning Phase 2, confirm:
- [ ] All Phase 1 tasks are checked off in `TASKS.md`.
- [ ] `npm run compile` and `npm test` pass cleanly on the Phase 1 codebase.
- [ ] IBM Bob has reviewed and committed Phase 1.

---

## Overview & Objective

Phase 2 introduces the visual interactive layer of the extension:
1. A custom **LBMesh Activity Bar panel** with a tree view of running services, containers, and port mappings.
2. An **API/CLI bridge** enabling one-click Start, Stop, and Restart operations on individual services.
3. An **embedded webview** that renders the LBMesh Carbon dashboard and streams container logs inside VS Code.

---

## Tasks Breakdown

### Task 2.1: Activity Bar Panel & TreeView Data Providers
- **Status**: `[ ] Pending`
- **Goal**: Create an LBMesh-branded sidebar panel showing live service state.
- **Implementation Steps**:
  1. Design and add a custom monochrome SVG icon to `assets/icons/lbmesh-activity-bar.svg`.
  2. Register a custom view container in `package.json`:
     - `id: "lbmesh-explorer"`, icon pointing to SVG icon, title: `"LBMesh"`.
  3. Register views inside the container:
     - `lbmesh-services`: Service and container status tree.
     - `lbmesh-ports`: Active port mapping list.
  4. Create `src/views/servicesTreeProvider.ts` implementing `vscode.TreeDataProvider<ServiceTreeItem>`:
     - Root items: **Global System Services**, **Project Containers**, **Port Mappings**.
     - Tree item model `ServiceTreeItem` with fields: `name`, `status`, `port`, `image`, `contextValue` (used to wire inline action buttons).
     - Status-specific icons: 🟢 running, 🔴 stopped, 🟡 starting, ⚪ unknown (SVG icon files preferred).
     - Implement `getChildren()` and `getTreeItem()` from `vscode.TreeDataProvider`.
  5. Create `src/views/portMappingTreeProvider.ts` listing active TCP port remaps from `lbmesh ps --json`.
  6. Register a refresh command (`lbmesh.refreshServices`):
     - Command implementation calls `_onDidChangeTreeData.fire()` to re-render.
  7. Wire polling via `setInterval` (configurable interval, e.g. 5s) to auto-refresh tree data.
- **Target Files**:
  - `assets/icons/lbmesh-activity-bar.svg`
  - `assets/icons/status-running.svg`
  - `assets/icons/status-stopped.svg`
  - `assets/icons/status-starting.svg`
  - `package.json` (viewsContainers, views, commands)
  - `src/views/servicesTreeProvider.ts`
  - `src/views/portMappingTreeProvider.ts`
  - `src/extension.ts` (register tree providers)
- **Acceptance Criteria**: LBMesh icon visible in Activity Bar; tree view lists all services with correct status icons; refresh re-polls state.

---

### Task 2.2: CLI & API Bridge for Service Controls
- **Status**: `[ ] Pending`
- **Goal**: Implement the bridge between tree view actions and the running LBMesh daemon or CLI.
- **Implementation Steps**:
  1. Create `src/services/lbmeshCli.ts`:
     - Low-level wrapper around `child_process.spawn()` / `exec()` for:
       - `lbmesh ps --json` → returns `ServiceStatus[]` (name, state, ports, image, uptime).
       - `lbmesh up <service>` → starts a named service.
       - `lbmesh down <service>` → stops a named service.
       - `lbmesh restart <service>` → restarts a named service.
       - `lbmesh logs <service> --follow` → streams log lines to a callback.
     - Respect `lbmesh.binaryPath` configuration.
     - Return typed promises and handle non-zero exit codes as rejected `Error`.
  2. Create `src/services/lbmeshClient.ts` as the high-level service controller:
     - Wraps `lbmeshCli.ts` with VS Code progress notifications and error notification toasts.
     - Emits events for tree view refresh after state changes.
  3. Register inline item commands in `package.json` (via `menus.view/item/context` with `when: viewItem == 'service'`):
     - `lbmesh.startService`: "Start Service" (icon: play)
     - `lbmesh.stopService`: "Stop Service" (icon: stop)
     - `lbmesh.restartService`: "Restart Service" (icon: refresh)
  4. Implement command handlers in `src/commands/serviceCommands.ts` that call `lbmeshClient.start/stop/restart`.
- **Target Files**:
  - `src/services/lbmeshCli.ts`
  - `src/services/lbmeshClient.ts`
  - `src/commands/serviceCommands.ts`
  - `src/test/suite/lbmeshCli.test.ts`
  - `package.json` (commands, menus)
- **Acceptance Criteria**: Clicking play/stop/restart icons in the tree view triggers CLI calls; service tree refreshes to reflect new state.

---

### Task 2.3: Embedded Dashboard Webview & Log Streaming
- **Status**: `[ ] Pending`
- **Goal**: Render the LBMesh Carbon dashboard inside an editor pane and stream container logs.
- **Implementation Steps**:
  1. Create `src/views/dashboardWebviewProvider.ts` implementing `vscode.WebviewViewProvider`:
     - Use `vscode.window.createWebviewPanel` to open a panel titled `"LBMesh Dashboard"`.
     - Load the Carbon React dashboard via an embedded webview HTML page:
       - If LBMesh local server is running (e.g. `http://localhost:5555`), set `src` to local URL.
       - Alternatively, embed static compiled dashboard bundle from `media/dashboard/` assets.
     - Configure webview options: `enableScripts: true`, `localResourceRoots: [...]`, `retainContextWhenHidden: true`.
     - Implement message passing:
       - Webview → Extension: `{ command: "startService", service: "postgres" }`.
       - Extension → Webview: `{ command: "statusUpdate", services: [...] }`.
  2. Register command `lbmesh.openDashboard` in `package.json` and in `src/extension.ts`.
  3. Create `src/views/logsWebviewProvider.ts` for container log streaming:
     - Opens a `vscode.WebviewPanel` titled `"LBMesh Logs: <service>"`.
     - Calls `lbmeshCli.streamLogs(service, (line) => webview.postMessage({ type: 'log', line }))`.
     - Auto-scrolls terminal-styled HTML view.
  4. Register command `lbmesh.viewLogs` that prompts user to select a service (via `vscode.window.showQuickPick`) then opens the log panel.
- **Target Files**:
  - `src/views/dashboardWebviewProvider.ts`
  - `src/views/logsWebviewProvider.ts`
  - `src/commands/dashboardCommands.ts`
  - `media/dashboard/index.html`
  - `package.json` (commands)
- **Acceptance Criteria**: `LBMesh: Open Dashboard` command opens embedded webview; `LBMesh: View Logs` opens a streaming log panel.

---

## Phase 2 Completion Handoff

When all Task 2.1–2.3 items pass build and test suites:
1. Verify `npm run compile` and `npm test` pass with 0 errors.
2. Ensure no git commits were made.
3. Notify **IBM Bob** for code review and commit.
