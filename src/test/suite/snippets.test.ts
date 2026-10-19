import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv, { ErrorObject } from 'ajv';
import { parse } from 'yaml';

// Compiled tests run from out/test/suite; resolve paths from the repository root.
const repoRoot = path.resolve(__dirname, '../../../');
const snippetsRelPath = './snippets/lbmesh-snippets.json';
const snippetsPath = path.join(repoRoot, snippetsRelPath);
const schemaPath = path.join(repoRoot, 'schemas', 'recipe.v1.json');

interface Snippet {
  prefix: string | string[];
  body: string | string[];
  description?: string;
}

// Snippets that expand to a full recipe; the rest expand to a single service entry.
const RECIPE_SNIPPETS = ['lbmesh-recipe'];
const SERVICE_SNIPPETS = ['lbmesh-postgres', 'lbmesh-redis', 'lbmesh-service'];

function loadSnippets(): Record<string, Snippet> {
  return JSON.parse(fs.readFileSync(snippetsPath, 'utf8'));
}

function findByPrefix(snippets: Record<string, Snippet>, prefix: string): Snippet | undefined {
  return Object.values(snippets).find((s) => [s.prefix].flat().includes(prefix));
}

/** Expands a snippet body as if the user accepted every default. */
function expand(body: string | string[]): string {
  return [body]
    .flat()
    .join('\n')
    .replace(/\$\{\d+\|([^,|]*)[^|]*\|\}/g, '$1') // ${1|first,second|} -> first
    .replace(/\$\{\d+:([^}]*)\}/g, '$1') // ${1:default} -> default
    .replace(/\$\d+/g, ''); // $1, $0 -> ''
}

/** Wraps an expanded service snippet in a minimal recipe, nested under `services`. */
function asRecipe(snippet: Snippet): unknown {
  const service = expand(snippet.body).replace(/^(?=.)/gm, '  ');
  return parse(`version: "1"\nservices:\n${service}`);
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('\n');
}

suite('Recipe snippets (lbmesh-snippets.json)', () => {
  const snippets = loadSnippets();
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  ajv.addKeyword('markdownDescription');
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));

  test('every snippet has a prefix, body, and description', () => {
    for (const [name, snippet] of Object.entries(snippets)) {
      assert.ok(snippet.prefix, `${name} has no prefix`);
      assert.ok([snippet.body].flat().length > 0, `${name} has no body`);
      assert.ok(snippet.description, `${name} has no description`);
    }
  });

  test('prefixes are unique', () => {
    const prefixes = Object.values(snippets).flatMap((s) => [s.prefix].flat());
    assert.deepStrictEqual(prefixes, [...new Set(prefixes)]);
  });

  test('bodies use spaces, not tabs, for YAML indentation', () => {
    for (const [name, snippet] of Object.entries(snippets)) {
      assert.ok(!expand(snippet.body).includes('\t'), `${name} contains a tab`);
    }
  });

  for (const prefix of RECIPE_SNIPPETS) {
    test(`${prefix} expands to a valid recipe`, () => {
      const snippet = findByPrefix(snippets, prefix);
      assert.ok(snippet, `No snippet with prefix ${prefix}`);
      const ok = validate(parse(expand(snippet.body)));
      assert.ok(ok, `${prefix} expansion is invalid:\n${formatErrors(validate.errors)}`);
    });
  }

  for (const prefix of SERVICE_SNIPPETS) {
    test(`${prefix} expands to a valid service`, () => {
      const snippet = findByPrefix(snippets, prefix);
      assert.ok(snippet, `No snippet with prefix ${prefix}`);
      const ok = validate(asRecipe(snippet));
      assert.ok(ok, `${prefix} expansion is invalid:\n${formatErrors(validate.errors)}`);
    });
  }

  test('lbmesh-postgres sets the standard environment variables', () => {
    const snippet = findByPrefix(snippets, 'lbmesh-postgres');
    assert.ok(snippet);
    const recipe = asRecipe(snippet) as {
      services: Record<string, { environment: Record<string, unknown> }>;
    };
    const env = Object.values(recipe.services)[0].environment;
    for (const key of ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']) {
      assert.ok(key in env, `missing ${key}`);
    }
  });

  test('package.json registers the snippets for yaml', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const entries: { language: string; path: string }[] = manifest.contributes.snippets ?? [];
    assert.ok(
      entries.some((e) => e.language === 'yaml' && e.path === snippetsRelPath),
      `contributes.snippets is missing { language: "yaml", path: "${snippetsRelPath}" }`,
    );
  });
});
