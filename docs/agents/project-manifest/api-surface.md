# Public API Surface

All public symbols are exported from the package entry point `@mistralys/persona-builder` (via `src/index.ts`).

---

## Constants

### `VERSION`

```ts
export const VERSION: string;
```

Package version string sourced from `package.json` at runtime via `createRequire`.

---

## Top-Level Functions

### `build(config)`

```ts
export async function build(config: BuildConfig): Promise<BuildSummary>;
```

Main entry point. Iterates all suites × targets, orchestrates the full pipeline (discover → load → render → validate → write), and returns an aggregated summary. Respects `check` (no writes) and `strict` (fail on warnings/errors) flags.

### `buildSuite(suiteName, suiteConfig, config, plugins)`

```ts
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
): Promise<BuildResult[]>;
```

Builds all personas in a single suite for all configured targets. Loads `_shared.yaml`, merges partials, fires `onSuiteInit`, discovers persona YAMLs, and delegates to `buildPersona()`.

### `buildPersona(personaYamlPath, suiteName, suiteConfig, sharedMeta, partialsMap, config, plugins, target)`

```ts
export async function buildPersona(
  personaYamlPath: string,
  suiteName: string,
  suiteConfig: SuiteConfig,
  sharedMeta: Record<string, unknown>,
  partialsMap: Record<string, string>,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: 'vscode' | 'claude-code',
): Promise<BuildResult>;
```

Builds a single persona for a single target. Runs the full rendering pipeline: load metadata → build context → plugin hooks → frontmatter → body rendering → post-processing → validation → write.

---

## Engine Functions

All engine functions are **pure** — zero imports, no side effects, no file I/O.

### `resolvePartials(text, partialsMap, depth?)`

```ts
export function resolvePartials(
  text: string,
  partialsMap: Record<string, string>,
  depth?: number,
): string;
```

Replaces `{{> name}}` markers with content from `partialsMap`. Recursion capped at depth 2. Missing partials emit `console.warn` and are preserved as-is.

### `resolveConditionals(text, context)`

```ts
export function resolveConditionals(
  text: string,
  context: Record<string, unknown>,
): string;
```

Evaluates `{{#if flag}}…{{/if}}` and `{{#if flag}}…{{else}}…{{/if}}` blocks. Unknown flags treated as falsy.

### `resolveVariables(text, context, filename)`

```ts
export function resolveVariables(
  text: string,
  context: Record<string, unknown>,
  filename: string,
): string;
```

Substitutes `{{varName}}` tokens with `String(context[varName])`. Unresolved variables emit `console.warn` and are preserved.

### `collapseBlankLines(text)`

```ts
export function collapseBlankLines(text: string): string;
```

Collapses 3+ consecutive blank lines into 2.

### `ensureBlankLineBeforeHeadings(text)`

```ts
export function ensureBlankLineBeforeHeadings(text: string): string;
```

Inserts a blank line before Markdown headings and horizontal rules when missing.

### `normalizeNewlines(text)`

```ts
export function normalizeNewlines(text: string): string;
```

Converts CRLF/CR to LF.

### `serializeTools(tools)`

```ts
export function serializeTools(tools: string[]): string;
```

Returns YAML flow-sequence with outer brackets: `['tool1', 'tool2']`.

### `serializeToolsList(tools)`

```ts
export function serializeToolsList(tools: string[]): string;
```

Returns comma-separated quoted tool names without brackets: `'tool1', 'tool2'`.

---

## Loader Functions

All loaders perform async file I/O via `node:fs/promises`.

### `loadPartials(dir)`

```ts
export async function loadPartials(dir: string): Promise<Record<string, string>>;
```

Reads all `.md` files in `dir` and returns a map from filename stem to content string.

### `discoverPersonaYamls(root)`

```ts
export async function discoverPersonaYamls(root: string): Promise<string[]>;
```

Recursively discovers all `*.yaml` files under `root`. Returns sorted absolute paths. Uses `readdir({ recursive: true })` (Node ≥ 18.17).

### `loadMetadata(yamlPath)`

```ts
export async function loadMetadata(yamlPath: string): Promise<PersonaMetadata>;
```

Parses a YAML file into a typed `PersonaMetadata` object. Throws if the file is not a valid object or is missing the required `name` field.

### `loadContent(mdPath)`

```ts
export async function loadContent(mdPath: string): Promise<string>;
```

Reads a Markdown content template as a raw UTF-8 string. No parsing or template resolution.

---

## Utility Functions

### `escapeRegExp(str)`

```ts
export function escapeRegExp(str: string): string;
```

Escapes all regex special characters in `str` for safe use inside a `new RegExp(...)` constructor. Pure function — no I/O, no side effects.

---

## Validator Functions

Both validators are pure functions — no I/O, no side effects.

### `validateFileName(filePath)`

```ts
export function validateFileName(filePath: string): ValidationResult[];
```

Validates a filename against kebab-case naming convention. Returns one `ValidationResult` (severity `'error'`) per violated rule. Rules: no uppercase, no spaces, kebab-case segments only.

### `validateStrictMarkers(renderedContent, requiredMarkers)`

```ts
export function validateStrictMarkers(
  renderedContent: string,
  requiredMarkers: string[],
): ValidationResult[];
```

Checks that every marker in `requiredMarkers` appears verbatim in `renderedContent`. Returns one error per missing marker.

---

## Frontmatter Functions

### `resolveFrontmatterTemplate(target, plugins, configTemplates?)`

```ts
export function resolveFrontmatterTemplate(
  target: 'vscode' | 'claude-code',
  plugins: PersonaBuildPlugin[],
  configTemplates?: Partial<Record<'vscode' | 'claude-code', string>>,
): string;
```

Resolves the frontmatter template for a target. Precedence: plugin `frontmatterTemplates` (first plugin wins) → config-level templates → library defaults.

### `renderFrontmatter(template, context, filename)`

```ts
export function renderFrontmatter(
  template: string,
  context: Record<string, unknown>,
  filename: string,
): string;
```

Renders a frontmatter template string by applying conditionals then variable substitution.

### `DEFAULT_FRONTMATTER_VSCODE`

```ts
export const DEFAULT_FRONTMATTER_VSCODE: string;
```

Built-in VS Code frontmatter template (`name`, `description`, `tools`).

### `DEFAULT_FRONTMATTER_CLAUDE_CODE`

```ts
export const DEFAULT_FRONTMATTER_CLAUDE_CODE: string;
```

Built-in Claude Code frontmatter template (`name`, `permissionMode`, `model`, `memory`, `allowedTools`).

---

## Plugin Runner Functions

All runner functions are synchronous.

### `runSuiteInit(plugins, suite, sharedMeta)`

```ts
export function runSuiteInit(
  plugins: PersonaBuildPlugin[],
  suite: SuiteConfig,
  sharedMeta: Record<string, unknown>,
): void;
```

Invokes `onSuiteInit` on each plugin in order. `sharedMeta` is mutable (passed by reference).

### `runBuildContext(plugins, ctx, persona, suite)`

```ts
export function runBuildContext(
  plugins: PersonaBuildPlugin[],
  ctx: Record<string, unknown>,
  persona: PersonaMetadata,
  suite: SuiteConfig,
): Record<string, unknown>;
```

Accumulating hook — each plugin receives the previous plugin's returned context. Returns the final context.

### `runPostRender(plugins, rendered, persona, target)`

```ts
export function runPostRender(
  plugins: PersonaBuildPlugin[],
  rendered: string,
  persona: PersonaMetadata,
  target: TargetType,
): string;
```

Accumulating hook — each plugin receives the previous plugin's returned output string.

### `runValidate(plugins, persona, suite)`

```ts
export function runValidate(
  plugins: PersonaBuildPlugin[],
  persona: PersonaMetadata,
  suite: SuiteConfig,
): ValidationResult[];
```

Collecting hook — concatenates all `ValidationResult[]` from all plugins into a flat array.

---

## Types

### `BuildConfig`

```ts
export interface BuildConfig {
  suites: Record<string, SuiteConfig>;
  sharedPartialsDir?: string;
  plugins?: PersonaBuildPlugin[];
  targets?: Array<'vscode' | 'claude-code'>;
  check?: boolean;
  strict?: boolean;
  frontmatter?: Partial<Record<'vscode' | 'claude-code', string>>;
}
```

### `SuiteConfig`

```ts
export interface SuiteConfig {
  srcDir: string;
  outVscode: string;
  outClaudeCode: string;
  personaMode?: string;
  partialsSubdir?: string;   // default: 'partials'
  metaSubdir?: string;       // default: 'meta'
  contentSubdir?: string;    // default: 'content'
}
```

### `BuildResult`

```ts
export interface BuildResult {
  suite: string;
  target: 'vscode' | 'claude-code';
  personaYamlPath: string;
  outputPath: string;
  content: string;
  validationResults: ValidationResult[];
  written: boolean;
}
```

### `BuildSummary`

```ts
export interface BuildSummary {
  success: boolean;
  results: BuildResult[];
  strictFailures: ValidationResult[];
  totalBuilt: number;
  totalWritten: number;
}
```

### `PersonaMetadata`

```ts
export interface PersonaMetadata {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  tools?: string[];
  [key: string]: unknown;
}
```

### `PersonaBuildPlugin`

```ts
export interface PersonaBuildPlugin {
  name: string;
  onSuiteInit?(suite: SuiteConfig, sharedMeta: Record<string, unknown>): void;
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
  ): Record<string, unknown>;
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig, target?: TargetType): ValidationResult[];
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
```

### `TargetType`

```ts
export type TargetType = 'vscode' | 'claude-code';
```

### `ValidationResult`

```ts
export interface ValidationResult {
  severity: 'error' | 'warning' | 'info';
  message: string;
}
```


