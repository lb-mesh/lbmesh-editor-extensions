import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // Prevent parent process environment from forcing Electron into node mode
    delete process.env.ELECTRON_RUN_AS_NODE;

    // Folder containing the extension manifest (package.json).
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    // Compiled Mocha suite entry point.
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
      extensionTestsEnv: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: undefined,
      },
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

void main();
