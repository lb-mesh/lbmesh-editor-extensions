import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { parse } from 'yaml';

// Compiled tests run from out/test/suite; resolve paths from the repository root.
const repoRoot = path.resolve(__dirname, '../../../');
const schemaPath = path.join(repoRoot, 'schemas', 'recipe.v1.json');
const fixturesDir = path.join(repoRoot, 'src', 'test', 'fixtures', 'recipes');

const RECIPE_FILE_PATTERNS = [
  '**/.lbmesh/recipe.yaml',
  '**/.lbmesh/recipe.yml',
  '**/recipe.lbmesh.yaml',
  '**/recipe.lbmesh.yml',
  '**/lbmesh.yaml',
  '**/lbmesh.yml',
];

function loadValidator(): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  // VS Code's editor-only annotation; not part of Draft-07.
  ajv.addKeyword('markdownDescription');
  return ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
}

function loadFixture(kind: 'valid' | 'invalid', name: string): unknown {
  return parse(fs.readFileSync(path.join(fixturesDir, kind, name), 'utf8'));
}

function listFixtures(kind: 'valid' | 'invalid'): string[] {
  return fs.readdirSync(path.join(fixturesDir, kind)).filter((f) => f.endsWith('.yaml'));
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('\n');
}

suite('Recipe schema (recipe.v1.json)', () => {
  const validate = loadValidator();

  suite('accepts valid recipes', () => {
    for (const name of listFixtures('valid')) {
      test(name, () => {
        const ok = validate(loadFixture('valid', name));
        assert.ok(ok, `Expected ${name} to be valid:\n${formatErrors(validate.errors)}`);
      });
    }
  });

  suite('rejects invalid recipes', () => {
    const cases: Record<string, { instancePath: string; keyword: string }> = {
      'missing-version.yaml': { instancePath: '', keyword: 'required' },
      'unknown-root-key.yaml': { instancePath: '', keyword: 'additionalProperties' },
      'missing-image.yaml': { instancePath: '/services/web', keyword: 'required' },
      'bad-port.yaml': { instancePath: '/services/web/ports/0', keyword: 'oneOf' },
      'bad-memory.yaml': { instancePath: '/services/web/resources/memory', keyword: 'pattern' },
      'bad-healthcheck.yaml': {
        instancePath: '/services/web/healthcheck/interval',
        keyword: 'pattern',
      },
      'unknown-service-key.yaml': {
        instancePath: '/services/web',
        keyword: 'additionalProperties',
      },
      'empty-services.yaml': { instancePath: '/services', keyword: 'minProperties' },
    };

    test('every invalid fixture has an expectation', () => {
      assert.deepStrictEqual(listFixtures('invalid').sort(), Object.keys(cases).sort());
    });

    for (const [name, expected] of Object.entries(cases)) {
      test(name, () => {
        assert.strictEqual(validate(loadFixture('invalid', name)), false, `${name} should fail`);
        const match = (validate.errors ?? []).some(
          (e) => e.instancePath === expected.instancePath && e.keyword === expected.keyword,
        );
        assert.ok(
          match,
          `Expected a "${expected.keyword}" error at "${expected.instancePath}", got:\n` +
            formatErrors(validate.errors),
        );
      });
    }
  });

  suite('package.json registration', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

    for (const contribution of ['jsonValidation', 'yamlValidation']) {
      test(`${contribution} maps every recipe file pattern to the schema`, () => {
        const entries: { fileMatch: string; url: string }[] =
          manifest.contributes[contribution] ?? [];
        for (const pattern of RECIPE_FILE_PATTERNS) {
          const entry = entries.find((e) => e.fileMatch === pattern);
          assert.ok(entry, `${contribution} is missing ${pattern}`);
          assert.strictEqual(entry.url, './schemas/recipe.v1.json');
        }
      });
    }
  });
});
