import * as vscode from 'vscode';
import { RecipeLinter } from './linter/recipeLinter';

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('LBMesh');
  context.subscriptions.push(outputChannel);

  const linter = new RecipeLinter({
    schemaPath: vscode.Uri.joinPath(context.extensionUri, 'schemas', 'recipe.v1.json').fsPath,
    log: (message) => outputChannel?.appendLine(message),
  });
  context.subscriptions.push(linter);

  const config = () => vscode.workspace.getConfiguration('lbmesh');

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void linter.lint(document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (config().get<boolean>('lintOnSave', true)) {
        void linter.lint(document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length > 0 && config().get<boolean>('enablePreflightLint', true)) {
        linter.schedule(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => linter.clear(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('lbmesh.binaryPath')) {
        linter.resetBinaryCache();
      }
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    void linter.lint(document);
  }

  outputChannel.appendLine(
    `LBMesh extension activated (v${context.extension.packageJSON.version}).`,
  );
}

export function deactivate(): void {
  outputChannel = undefined;
}
