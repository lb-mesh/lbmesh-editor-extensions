import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import { isMap, isPair, isScalar, isSeq, LineCounter, Node, Pair, parseDocument } from 'yaml';

export const DIAGNOSTIC_COLLECTION_NAME = 'lbmesh-recipe';
export const DIAGNOSTIC_SOURCE = 'lbmesh';
export const LINT_DEBOUNCE_MS = 500;
const CLI_TIMEOUT_MS = 10000;

// Mirrors the fileMatch patterns registered under contributes.yamlValidation.
const RECIPE_PATH_PATTERN = /(?:^|\/)(?:\.lbmesh\/recipe|recipe\.lbmesh|lbmesh)\.ya?ml$/;

export type LintSeverity = 'error' | 'warning' | 'info' | 'hint';

/** A position-resolved lint finding. Lines and characters are 0-based. */
export interface LintIssue {
  message: string;
  severity: LintSeverity;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  code?: string;
}

export interface LinterSettings {
  binaryPath: string;
}

export interface RecipeLinterOptions {
  schemaPath: string;
  getSettings?: () => LinterSettings;
  log?: (message: string) => void;
}

export function isRecipePath(fsPath: string): boolean {
  return RECIPE_PATH_PATTERN.test(fsPath.replace(/\\/g, '/'));
}

export function isRecipeDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && isRecipePath(document.uri.fsPath);
}

export function loadSchemaValidator(schemaPath: string): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  // VS Code's editor-only annotation; not part of Draft-07.
  ajv.addKeyword('markdownDescription');
  return ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
}

// ---------------------------------------------------------------------------
// Internal validation (YAML syntax + JSON Schema)
// ---------------------------------------------------------------------------

/** Validates recipe text against the YAML grammar and the bundled recipe schema. */
export function validateRecipeText(text: string, validate: ValidateFunction): LintIssue[] {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true });
  const toPosition = (offset: number) => {
    const { line, col } = lineCounter.linePos(Math.min(Math.max(offset, 0), text.length));
    return { line: line - 1, character: col - 1 };
  };
  const toRange = (start: number, end: number) => ({
    start: toPosition(start),
    end: toPosition(Math.max(end, start)),
  });

  const syntaxIssues: LintIssue[] = [
    ...doc.errors.map((e) => ({ e, severity: 'error' as const })),
    ...doc.warnings.map((e) => ({ e, severity: 'warning' as const })),
  ].map(({ e, severity }) => ({
    message: firstLine(e.message),
    severity,
    code: e.code,
    range: toRange(e.pos[0], e.pos[1]),
  }));

  // A document with syntax errors yields a partial tree; schema errors on it are noise.
  if (doc.errors.length > 0) {
    return syntaxIssues;
  }

  if (validate(doc.toJS())) {
    return syntaxIssues;
  }

  const lineEnd = (offset: number) => {
    const newline = text.indexOf('\n', offset);
    return newline === -1 ? text.length : newline;
  };

  const schemaIssues = collapseAlternatives(validate.errors ?? []).map((error): LintIssue => {
    const [start, end] = locateError(doc.contents, error) ?? [0, lineEnd(0)];
    return {
      message: formatSchemaError(error),
      severity: 'error',
      code: error.keyword,
      range: toRange(start, end === start ? lineEnd(start) : end),
    };
  });

  return [...syntaxIssues, ...schemaIssues];
}

function firstLine(message: string): string {
  return message.split('\n')[0].trim();
}

type OneOfError = ErrorObject & { branchMessages?: string[] };

/**
 * ajv reports every failed branch of a oneOf/anyOf alongside the parent error.
 * Fold the branch errors into the parent so each location gets one diagnostic.
 */
function collapseAlternatives(errors: ErrorObject[]): OneOfError[] {
  const parents = errors.filter((e) => e.keyword === 'oneOf' || e.keyword === 'anyOf');
  const isBranchOf = (e: ErrorObject, p: ErrorObject) =>
    e !== p &&
    e.instancePath.startsWith(p.instancePath) &&
    e.schemaPath.startsWith(p.schemaPath + '/');

  return errors
    .filter((e) => !parents.some((p) => isBranchOf(e, p)))
    .map((e) => {
      if (!parents.includes(e)) {
        return e;
      }
      const branchMessages = errors
        .filter((b) => isBranchOf(b, e) && b.instancePath === e.instancePath)
        .map((b) => formatSchemaError(b));
      return { ...e, branchMessages: [...new Set(branchMessages)] };
    });
}

function formatSchemaError(error: OneOfError): string {
  const where = error.instancePath ? `${pointerToDotted(error.instancePath)}: ` : '';
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required':
      return `${where}missing required property "${params.missingProperty}"`;
    case 'additionalProperties':
      return `${where}unknown property "${params.additionalProperty}"`;
    case 'enum':
      return `${where}must be one of ${(params.allowedValues as unknown[])
        .map((v) => JSON.stringify(v))
        .join(', ')}`;
    case 'oneOf':
    case 'anyOf':
      if (error.branchMessages && error.branchMessages.length > 0) {
        return `${where}value does not match any allowed form (${error.branchMessages
          .map((m) => m.replace(where, ''))
          .join('; ')})`;
      }
      return `${where}${error.message}`;
    default:
      return `${where}${error.message}`;
  }
}

function pointerToDotted(pointer: string): string {
  return decodePointer(pointer)
    .map((seg, i) => (/^\d+$/.test(seg) ? `[${seg}]` : i === 0 ? seg : `.${seg}`))
    .join('');
}

function decodePointer(pointer: string): string[] {
  if (!pointer) {
    return [];
  }
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Resolves the source offsets [start, end) best describing where an ajv error lives. */
function locateError(root: unknown, error: ErrorObject): [number, number] | undefined {
  let node = root;
  let pair: Pair | undefined;

  for (const segment of decodePointer(error.instancePath)) {
    if (isMap(node)) {
      const match = node.items.find((p) => isScalar(p.key) && String(p.key.value) === segment);
      if (!match) {
        break;
      }
      pair = match;
      node = match.value;
    } else if (isSeq(node)) {
      const item = node.items[Number(segment)];
      if (item === undefined) {
        break;
      }
      pair = isPair(item) ? item : undefined;
      node = item;
    } else {
      break;
    }
  }

  const rangeOf = (n: unknown): [number, number] | undefined => {
    const r = (n as Node | null | undefined)?.range;
    return r ? [r[0], r[1]] : undefined;
  };

  if (error.keyword === 'additionalProperties' && isMap(node)) {
    const key = (error.params as { additionalProperty: string }).additionalProperty;
    const offender = node.items.find((p) => isScalar(p.key) && String(p.key.value) === key);
    if (offender) {
      return rangeOf(offender.key);
    }
  }

  // Missing keys and errors on whole collections read best on the owning key.
  const isCollection = isMap(node) || isSeq(node);
  if (pair && (error.keyword === 'required' || isCollection)) {
    return rangeOf(pair.key) ?? rangeOf(node);
  }

  const range = rangeOf(node);
  if (range && isCollection) {
    // Root-level collection errors: highlight just the first line.
    return [range[0], range[0]];
  }
  return range;
}

// ---------------------------------------------------------------------------
// CLI output parsing
// ---------------------------------------------------------------------------

interface CliIssue {
  message?: unknown;
  severity?: unknown;
  level?: unknown;
  code?: unknown;
  rule?: unknown;
  line?: unknown;
  column?: unknown;
  endLine?: unknown;
  endColumn?: unknown;
}

/**
 * Parses `lbmesh recipe lint --format=json` output. Accepts either a bare array of
 * issues or an object with a `diagnostics` / `issues` / `errors` array. Line and
 * column numbers from the CLI are 1-based and converted to 0-based here.
 */
export function parseCliOutput(stdout: string): LintIssue[] {
  const parsed: unknown = JSON.parse(stdout);
  const list = Array.isArray(parsed)
    ? parsed
    : ['diagnostics', 'issues', 'errors']
        .map((k) => (parsed as Record<string, unknown> | null)?.[k])
        .find(Array.isArray);

  if (!Array.isArray(list)) {
    throw new Error('Unrecognized lint output: expected an array of issues.');
  }

  return list.map((raw: CliIssue): LintIssue => {
    const line = toZeroBased(raw.line);
    const character = toZeroBased(raw.column);
    const endLine = raw.endLine === undefined ? line : toZeroBased(raw.endLine);
    const endCharacter = raw.endColumn === undefined ? character : toZeroBased(raw.endColumn);
    const code = raw.code ?? raw.rule;
    return {
      message: String(raw.message ?? 'Unknown lint issue'),
      severity: toSeverity(raw.severity ?? raw.level),
      code: code === undefined ? undefined : String(code),
      range: {
        start: { line, character },
        end: { line: Math.max(endLine, line), character: endCharacter },
      },
    };
  });
}

function toZeroBased(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) - 1 : 0;
}

function toSeverity(value: unknown): LintSeverity {
  switch (String(value ?? '').toLowerCase()) {
    case 'warning':
    case 'warn':
      return 'warning';
    case 'info':
    case 'information':
      return 'info';
    case 'hint':
      return 'hint';
    default:
      return 'error';
  }
}

// ---------------------------------------------------------------------------
// VS Code integration
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<LintSeverity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

export function toDiagnostic(issue: LintIssue, document?: vscode.TextDocument): vscode.Diagnostic {
  const { start, end } = issue.range;
  let range = new vscode.Range(start.line, start.character, end.line, end.character);
  if (document) {
    range = document.validateRange(range);
    if (range.isEmpty) {
      // Zero-width ranges are hard to see; widen to the rest of the line.
      const lineRange = document.lineAt(range.start.line).range;
      range = new vscode.Range(range.start, lineRange.end);
      if (range.isEmpty) {
        range = lineRange;
      }
    }
  }
  const diagnostic = new vscode.Diagnostic(range, issue.message, SEVERITY_MAP[issue.severity]);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  if (issue.code) {
    diagnostic.code = issue.code;
  }
  return diagnostic;
}

function readSettings(): LinterSettings {
  const config = vscode.workspace.getConfiguration('lbmesh');
  return { binaryPath: config.get<string>('binaryPath', 'lbmesh') };
}

interface ExecResult {
  stdout: string;
  stderr: string;
  missing: boolean;
}

function runCli(binaryPath: string, file: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['recipe', 'lint', '--format=json', file],
      { cwd: path.dirname(file), timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === 'ENOENT' || code === 'EACCES') {
          resolve({ stdout: '', stderr: '', missing: true });
        } else if (error && !stdout.trim()) {
          // A non-zero exit with JSON on stdout just means issues were found.
          reject(new Error(stderr.trim() || error.message));
        } else {
          resolve({ stdout, stderr, missing: false });
        }
      },
    );
  });
}

export class RecipeLinter implements vscode.Disposable {
  readonly collection: vscode.DiagnosticCollection;
  private readonly validate: ValidateFunction;
  private readonly getSettings: () => LinterSettings;
  private readonly log: (message: string) => void;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly generations = new Map<string, number>();
  private readonly missingBinaries = new Set<string>();

  constructor(options: RecipeLinterOptions) {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
    this.validate = loadSchemaValidator(options.schemaPath);
    this.getSettings = options.getSettings ?? readSettings;
    this.log = options.log ?? (() => undefined);
  }

  /** Lints after `delay` ms, restarting the timer on each call for the same document. */
  schedule(document: vscode.TextDocument, delay = LINT_DEBOUNCE_MS): void {
    if (!isRecipeDocument(document)) {
      return;
    }
    const key = document.uri.toString();
    this.cancel(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.lint(document);
      }, delay),
    );
  }

  /** Lints a recipe document immediately and publishes its diagnostics. */
  async lint(document: vscode.TextDocument): Promise<readonly vscode.Diagnostic[]> {
    if (!isRecipeDocument(document)) {
      return [];
    }
    const key = document.uri.toString();
    this.cancel(key);
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);

    const issues = await this.collectIssues(document);

    // Drop results superseded by a newer lint or by the document closing.
    if (this.generations.get(key) !== generation || document.isClosed) {
      return this.collection.get(document.uri) ?? [];
    }
    const diagnostics = issues.map((issue) => toDiagnostic(issue, document));
    this.collection.set(document.uri, diagnostics);
    return diagnostics;
  }

  clear(uri: vscode.Uri): void {
    const key = uri.toString();
    this.cancel(key);
    this.generations.delete(key);
    this.collection.delete(uri);
  }

  /** Forgets cached CLI lookups, e.g. after `lbmesh.binaryPath` changes. */
  resetBinaryCache(): void {
    this.missingBinaries.clear();
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.generations.clear();
    this.collection.dispose();
  }

  private cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private async collectIssues(document: vscode.TextDocument): Promise<LintIssue[]> {
    // The CLI reads from disk, so only use it when the buffer matches the file.
    const { binaryPath } = this.getSettings();
    if (!document.isDirty && binaryPath && !this.missingBinaries.has(binaryPath)) {
      try {
        const result = await runCli(binaryPath, document.uri.fsPath);
        if (!result.missing) {
          return parseCliOutput(result.stdout);
        }
        this.missingBinaries.add(binaryPath);
        this.log(`LBMesh CLI not found at "${binaryPath}"; using built-in schema validation.`);
      } catch (err) {
        this.log(
          `LBMesh CLI lint failed (${(err as Error).message}); using built-in schema validation.`,
        );
      }
    }
    return validateRecipeText(document.getText(), this.validate);
  }
}
