import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  isRecipePath,
  LintIssue,
  loadSchemaValidator,
  parseCliOutput,
  RecipeLinter,
  toDiagnostic,
  validateRecipeText,
} from '../../linter/recipeLinter';

// Compiled tests run from out/test/suite; resolve paths from the repository root.
const repoRoot = path.resolve(__dirname, '../../../');
const schemaPath = path.join(repoRoot, 'schemas', 'recipe.v1.json');
const fixturesDir = path.join(repoRoot, 'src', 'test', 'fixtures', 'recipes');

function readFixture(kind: 'valid' | 'invalid', name: string): string {
  return fs.readFileSync(path.join(fixturesDir, kind, name), 'utf8');
}

function highlighted(text: string, issue: LintIssue): string {
  const { start, end } = issue.range;
  const line = text.split('\n')[start.line] ?? '';
  return line.slice(start.character, start.line === end.line ? end.character : undefined);
}

function describeIssues(issues: LintIssue[]): string {
  return issues
    .map((i) => `  [${i.code}] ${i.range.start.line}:${i.range.start.character} ${i.message}`)
    .join('\n');
}

suite('Recipe linter', () => {
  suite('isRecipePath', () => {
    for (const p of [
      '/w/.lbmesh/recipe.yaml',
      '/w/.lbmesh/recipe.yml',
      '/w/recipe.lbmesh.yaml',
      '/w/sub/recipe.lbmesh.yml',
      '/w/lbmesh.yaml',
      'C:\\w\\.lbmesh\\recipe.yaml',
    ]) {
      test(`matches ${p}`, () => assert.ok(isRecipePath(p)));
    }
    for (const p of ['/w/recipe.yaml', '/w/my-lbmesh.yaml', '/w/lbmesh.json', '/w/docker.yml']) {
      test(`ignores ${p}`, () => assert.ok(!isRecipePath(p)));
    }
  });

  suite('validateRecipeText (built-in fallback)', () => {
    const validate = loadSchemaValidator(schemaPath);

    for (const name of ['minimal.yaml', 'full-stack.yaml']) {
      test(`valid/${name} has no issues`, () => {
        const issues = validateRecipeText(readFixture('valid', name), validate);
        assert.deepStrictEqual(issues, [], describeIssues(issues));
      });
    }

    const cases: Record<string, { code: string; line: number; text: string }> = {
      'missing-version.yaml': { code: 'required', line: 0, text: 'services:' },
      'unknown-root-key.yaml': { code: 'additionalProperties', line: 1, text: 'servicez' },
      'missing-image.yaml': { code: 'required', line: 2, text: 'web' },
      'bad-port.yaml': { code: 'oneOf', line: 4, text: '"eighty:80"' },
      'bad-memory.yaml': { code: 'pattern', line: 5, text: 'lots' },
      'bad-healthcheck.yaml': { code: 'pattern', line: 6, text: '10 seconds' },
      'unknown-service-key.yaml': {
        code: 'additionalProperties',
        line: 4,
        text: 'restart_policy',
      },
      'empty-services.yaml': { code: 'minProperties', line: 1, text: 'services' },
    };

    for (const [name, expected] of Object.entries(cases)) {
      test(`invalid/${name} is reported at line ${expected.line + 1}`, () => {
        const text = readFixture('invalid', name);
        const issues = validateRecipeText(text, validate);
        const match = issues.find(
          (i) =>
            i.code === expected.code &&
            i.range.start.line === expected.line &&
            highlighted(text, i) === expected.text,
        );
        assert.ok(
          match,
          `Expected [${expected.code}] on "${expected.text}" at line ${expected.line}, got:\n` +
            describeIssues(issues),
        );
        assert.strictEqual(match.severity, 'error');
      });
    }

    test('folds oneOf branch errors into a single diagnostic', () => {
      const issues = validateRecipeText(readFixture('invalid', 'bad-port.yaml'), validate);
      assert.strictEqual(issues.length, 1, describeIssues(issues));
      assert.match(issues[0].message, /^services\.web\.ports\[0\]: /);
    });

    test('names the offending key in additionalProperties messages', () => {
      const issues = validateRecipeText(
        readFixture('invalid', 'unknown-service-key.yaml'),
        validate,
      );
      assert.ok(
        issues.some((i) => i.message === 'services.web: unknown property "restart_policy"'),
      );
    });

    test('reports YAML syntax errors at their position and skips schema checks', () => {
      const text = 'version: "1"\nservices:\n  web:\n    image: [nginx\n';
      const issues = validateRecipeText(text, validate);
      assert.ok(issues.length > 0);
      assert.ok(issues.every((i) => i.severity === 'error'));
      assert.ok(
        issues.every((i) => i.code && i.code === i.code.toUpperCase()),
        `Expected only YAML error codes:\n${describeIssues(issues)}`,
      );
      assert.ok(
        issues.some((i) => i.range.start.line >= 3),
        describeIssues(issues),
      );
    });

    test('reports an empty document as a schema error', () => {
      const issues = validateRecipeText('', validate);
      assert.ok(
        issues.some((i) => i.code === 'type'),
        describeIssues(issues),
      );
    });
  });

  suite('parseCliOutput', () => {
    test('converts 1-based CLI positions to 0-based ranges', () => {
      const [issue] = parseCliOutput(
        JSON.stringify([
          { line: 3, column: 5, endLine: 3, endColumn: 9, message: 'bad', severity: 'error' },
        ]),
      );
      assert.deepStrictEqual(issue.range, {
        start: { line: 2, character: 4 },
        end: { line: 2, character: 8 },
      });
    });

    test('accepts an object wrapper and maps severities', () => {
      const issues = parseCliOutput(
        JSON.stringify({
          diagnostics: [
            { line: 1, column: 1, message: 'a', severity: 'warning', code: 'W1' },
            { line: 1, column: 1, message: 'b', level: 'info', rule: 'R2' },
            { line: 1, column: 1, message: 'c', severity: 'hint' },
            { line: 1, column: 1, message: 'd' },
          ],
        }),
      );
      assert.deepStrictEqual(
        issues.map((i) => [i.severity, i.code]),
        [
          ['warning', 'W1'],
          ['info', 'R2'],
          ['hint', undefined],
          ['error', undefined],
        ],
      );
    });

    test('defaults missing positions to the start of the file', () => {
      const [issue] = parseCliOutput('{"issues":[{"message":"no position"}]}');
      assert.deepStrictEqual(issue.range.start, { line: 0, character: 0 });
    });

    test('rejects output without an issue list', () => {
      assert.throws(() => parseCliOutput('{"ok":true}'));
      assert.throws(() => parseCliOutput('not json'));
    });
  });

  suite('toDiagnostic', () => {
    test('maps severity, source and code', () => {
      const diagnostic = toDiagnostic({
        message: 'm',
        severity: 'warning',
        code: 'X',
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 4 } },
      });
      assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning);
      assert.strictEqual(diagnostic.source, 'lbmesh');
      assert.strictEqual(diagnostic.code, 'X');
      assert.ok(diagnostic.range.isEqual(new vscode.Range(1, 2, 1, 4)));
    });

    test('widens zero-width ranges to the end of the line', async () => {
      const document = await vscode.workspace.openTextDocument({
        language: 'yaml',
        content: 'version: "1"\nservices: {}\n',
      });
      const diagnostic = toDiagnostic(
        {
          message: 'm',
          severity: 'error',
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        },
        document,
      );
      assert.ok(diagnostic.range.isEqual(new vscode.Range(1, 0, 1, 12)));
    });
  });

  suite('RecipeLinter', () => {
    let tmpDir: string;
    let binaryPath: string;
    let linter: RecipeLinter;

    const writeRecipe = async (content: string, name = 'lbmesh.yaml') => {
      const file = path.join(tmpDir, name);
      fs.writeFileSync(file, content);
      return vscode.workspace.openTextDocument(file);
    };

    const writeFakeCli = (stdout: string, exitCode: number) => {
      const script = path.join(tmpDir, 'fake-lbmesh');
      fs.writeFileSync(
        script,
        `#!/bin/sh\necho "$@" > "${tmpDir}/args.txt"\ncat <<'EOF'\n${stdout}\nEOF\nexit ${exitCode}\n`,
      );
      fs.chmodSync(script, 0o755);
      return script;
    };

    setup(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbmesh-linter-'));
      binaryPath = path.join(tmpDir, 'does-not-exist');
      linter = new RecipeLinter({ schemaPath, getSettings: () => ({ binaryPath }) });
    });

    teardown(() => {
      linter.dispose();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('creates the lbmesh-recipe diagnostic collection', () => {
      assert.strictEqual(linter.collection.name, 'lbmesh-recipe');
    });

    test('falls back to schema validation when the CLI is missing', async () => {
      const document = await writeRecipe(readFixture('invalid', 'bad-memory.yaml'));
      const diagnostics = await linter.lint(document);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 'pattern');
      assert.strictEqual(document.getText(diagnostics[0].range), 'lots');
      assert.strictEqual(linter.collection.get(document.uri)?.length, 1);
    });

    test('ignores files that are not recipes', async () => {
      const document = await writeRecipe('not: a recipe\n', 'docker-compose.yaml');
      assert.deepStrictEqual(await linter.lint(document), []);
      assert.deepStrictEqual(linter.collection.get(document.uri) ?? [], []);
    });

    test('uses CLI output when the binary is available', async function () {
      if (process.platform === 'win32') {
        this.skip();
      }
      binaryPath = writeFakeCli(
        JSON.stringify([
          { line: 2, column: 1, endColumn: 9, message: 'from cli', severity: 'warning' },
        ]),
        1,
      );
      const document = await writeRecipe('version: "1"\nservices: {}\n');
      const diagnostics = await linter.lint(document);

      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].message, 'from cli');
      assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Warning);
      assert.ok(diagnostics[0].range.isEqual(new vscode.Range(1, 0, 1, 8)));
      assert.strictEqual(
        fs.readFileSync(path.join(tmpDir, 'args.txt'), 'utf8').trim(),
        `recipe lint --format=json ${document.uri.fsPath}`,
      );
    });

    test('falls back when the CLI emits unparseable output', async function () {
      if (process.platform === 'win32') {
        this.skip();
      }
      binaryPath = writeFakeCli('panic: something broke', 2);
      const document = await writeRecipe(readFixture('invalid', 'bad-memory.yaml'));
      const diagnostics = await linter.lint(document);
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(diagnostics[0].code, 'pattern');
    });

    test('clear removes diagnostics for a document', async () => {
      const document = await writeRecipe(readFixture('invalid', 'bad-memory.yaml'));
      await linter.lint(document);
      linter.clear(document.uri);
      assert.deepStrictEqual(linter.collection.get(document.uri) ?? [], []);
    });

    test('schedule debounces repeated requests into one lint', async () => {
      const document = await writeRecipe(readFixture('invalid', 'bad-memory.yaml'));
      let lints = 0;
      const original = linter.lint.bind(linter);
      linter.lint = (doc) => {
        lints++;
        return original(doc);
      };

      linter.schedule(document, 50);
      linter.schedule(document, 50);
      linter.schedule(document, 50);
      assert.deepStrictEqual(linter.collection.get(document.uri) ?? [], []);

      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.strictEqual(lints, 1);
      assert.strictEqual(linter.collection.get(document.uri)?.length, 1);
    });

    test('clear cancels a pending scheduled lint', async () => {
      const document = await writeRecipe(readFixture('invalid', 'bad-memory.yaml'));
      linter.schedule(document, 50);
      linter.clear(document.uri);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.deepStrictEqual(linter.collection.get(document.uri) ?? [], []);
    });
  });
});
