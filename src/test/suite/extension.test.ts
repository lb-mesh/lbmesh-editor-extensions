import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'lbmesh.lbmesh-vscode';

suite('Extension', () => {
  test('is present in the extension host', () => {
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID), `${EXTENSION_ID} not found`);
  });

  test('activates without error', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });
});
