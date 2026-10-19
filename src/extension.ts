import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('LBMesh');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine(`LBMesh extension activated (v${context.extension.packageJSON.version}).`);
}

export function deactivate(): void {
  outputChannel = undefined;
}
