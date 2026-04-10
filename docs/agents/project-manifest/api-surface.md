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

Main entry point. Pre-scans all suites to build a cross-suite agent name map (`agent_*` display-name variables and `agent_slug_*` raw-slug variables), then iterates all suites × targets, orchestrates the full pipeline (discover → load → render → validate → write), and returns an aggregated summary. Respects `check` (no writes) and `strict` (fail on warnings/errors) flags.

### `buildSuite(suiteName, suiteConfig, config, plugins, target, agentMap?, registry?)`

```ts
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap?: Record<string, string>,
  registry?: TargetRegistry,
): Promise<BuildResult[]>;
```

Builds all personas in a single suite for a single target. Loads `_shared.yaml`, merges partials, fires `onSuiteInit`, discovers persona YAMLs, and delegates to `buildPersona()`. The optional `agentMap` is forwarded to each persona build.

**Two-registry limitation:** `registry` defaults to `defaultRegistry`. If you pass a custom `TargetRegistry` only to `build()` (via `config.targetRegistry`) and call `buildSuite()` directly without the same registry argument, your custom targets will not be visible. Either pass the registry instance explicitly here, or use `build()` to have it forwarded automatically.

### `buildPersona(personaYamlPath, suiteName, suiteConfig, sharedMeta, partialsMap, config, plugins, target, agentMap?, registry?)`

```ts
export async function buildPersona(
  personaYamlPath: string,
  suiteName: string,
  suiteConfig: SuiteConfig,
  sharedMeta: Record<string, unknown>,
  partialsMap: Record<string, string>,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap?: Record<string, string>,
  registry?: TargetRegistry,
): Promise<BuildResult>;
```

Builds a single persona for a single target. Runs the full rendering pipeline: load metadata → build context → plugin hooks → frontmatter → body rendering → post-processing → validation → write.

**Two-registry limitation:** `registry` defaults to `defaultRegistry`. If you pass a custom `TargetRegistry` only to `build()` (via `config.targetRegistry`) and call `buildPersona()` directly without the same registry argument, your custom targets will not be visible. Either pass the registry instance explicitly here, or use `build()` to have it forwarded automatically.

---

## Cross-Suite Template Context Variables

Populated by `buildAgentNameMap()` during the pre-scan phase of `build()`. For every persona across all configured suites, two context keys are injected:

| Key pattern | Value | Typical use |
|-------------|-------|-------------|
| `agent_<underscored_slug>` | `"<name> v<version>"` | Reference another persona by display name in template prose, e.g. `{{agent_my_persona}}` renders as `"My Persona v1.0.0"`. |
| `agent_slug_<underscored_slug>` | Raw hyphenated slug string | Invoke another persona as a subagent in templates, e.g. `task(subagent={{agent_slug_my_persona}})` renders as `task(subagent=my-persona)`. Useful with the Deep Agents target. |

**Key derivation:** The YAML `slug` field (falling back to the filename stem when absent) is transformed for the key suffix: hyphens replaced with underscores. The *value* of `agent_slug_*` keys preserves the original hyphens, since subagent names use hyphenated slugs.

**Example** — a persona with `slug: my-great-agent` produces:
- `agent_my_great_agent` → `"My Great Agent v1.2.0"`
- `agent_slug_my_great_agent` → `"my-great-agent"`

Both keys are injected at context merge step 4 (after derived fields, before plugin hooks) and are only set when not already present — explicit YAML overrides always win. See **Context Merge Order** in `data-flows.md`.

---
## Derived Context Fields

Fields computed by `buildContext()` at build time (merge step 3). All are only set when not already present — YAML overrides always win.

### Standard Derived Fields (always injected)

| Field | Derived from | Format |
|-------|-------------|--------|
| `version` | `version` → `default_version` → `'0.0.0'` | String |
| `tools_list` | `tools` array | `'tool1', 'tool2'` |
| `tools_json` | `tools` array | `['tool1', 'tool2']` |
| `cc_tools_list` | `cc_tools` → fallback to `tools` | `'tool1', 'tool2'` |
| `cc_tools_json` | `cc_tools` → fallback to `tools` | `['tool1', 'tool2']` |
| `cc_file_name_stem` | `cc_file_name` with `.md` stripped | String |

### Deep Agents Derived Fields (gated on `da_file_name` presence)

These three fields mirror the `cc_*` pattern but apply to the `deep-agents` target. They are **only injected when `da_file_name` is present** in the merged context — personas without `da_file_name` produce no `da_*` fields and no error.

| Field | Derived from | Format |
|-------|-------------|--------|
| `da_file_name_stem` | `da_file_name` with `.md` stripped | String |
| `da_tools_list` | `da_tools` → fallback to `tools` | `'tool1', 'tool2'` |
| `da_tools_json` | `da_tools` → fallback to `tools` | `['tool1', 'tool2']` |

**`da_*` gate asymmetry vs `cc_*`:** The `cc_*` tools fields are emitted unconditionally for all personas, but the `da_*` fields are gated on `da_file_name` being set. This means personas that do not produce a Deep Agents output file will never have `da_*` in their context, rather than receiving empty values.

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

Evaluates `{{#if flag}}…{{/if}}`, `{{#if flag}}…{{else}}…{{/if}}`, and `{{#if flag}}…{{else if flag2}}…{{else}}…{{/if}}` (chain) blocks.

`{{else if}}` chains are pre-processed by `resolveElseIf()` (internal), which rewrites each innermost `{{else if flag}}` segment into an equivalent `{{else}}{{#if flag}}` nested block before the main resolution pass. Multi-level chains are unwound iteratively — one level per pass — until the string stabilises.

Nested `{{#if}}` blocks inside `{{else}}` branches are supported — resolved innermost-first across multiple passes until stable. `{{else if}}` chains may be freely mixed with traditional nested syntax. Unknown flags treated as falsy.

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
  target: string,
  plugins: PersonaBuildPlugin[],
  configTemplates?: Record<string, string>,
): string;
```

Resolves the frontmatter template for a target. Precedence: plugin `frontmatterTemplates` (first plugin wins) → config-level templates → library defaults. For custom target names (neither `'vscode'` nor `'claude-code'`), the library-default fallback returns the Claude Code template unless overridden via a plugin or `configTemplates`.

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

Built-in VS Code frontmatter template (`name`, `description`, `tools`). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` for API continuity.

### `DEFAULT_FRONTMATTER_CLAUDE_CODE`

```ts
export const DEFAULT_FRONTMATTER_CLAUDE_CODE: string;
```

Built-in Claude Code frontmatter template (`name`, `permissionMode`, `model`, `memory`, `allowedTools`). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` for API continuity.

### `DEFAULT_FRONTMATTER_DEEP_AGENTS`

```ts
export const DEFAULT_FRONTMATTER_DEEP_AGENTS: string;
```

Built-in Deep Agents frontmatter template (added by WP-001). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` and the package entry point.

---

## Target Registry

Provides extensible, named build targets. All symbols are exported from the package entry point.

### `TARGET_VSCODE`

```ts
export const TARGET_VSCODE: 'vscode';
```

Constant string `'vscode'` — the well-known name for the built-in VS Code target.

### `TARGET_CLAUDE_CODE`

```ts
export const TARGET_CLAUDE_CODE: 'claude-code';
```

Constant string `'claude-code'` — the well-known name for the built-in Claude Code target.

### `TARGET_DEEP_AGENTS`

```ts
export const TARGET_DEEP_AGENTS: 'deep-agents';
```

Constant string `'deep-agents'` — the well-known name for the built-in Deep Agents target.

### `defaultRegistry`

```ts
export const defaultRegistry: TargetRegistry;
```

Singleton `TargetRegistry` pre-populated with the three built-in targets (`'vscode'`, `'claude-code'`, `'deep-agents'`), in registration order. Import and call `register()` on this instance to add custom targets before invoking `build()`.

**Warning:** This is a module-level singleton. Calling `register()` on it in tests mutates shared state that persists across test cases. Use `defaultRegistry.clone()` to obtain an isolated copy.

### `TargetRegistry`

```ts
export class TargetRegistry {
  register(definition: TargetDefinition): void;
  get(name: string): TargetDefinition;
  has(name: string): boolean;
  names(): string[];
  allDefinitions(): TargetDefinition[];
  clone(): TargetRegistry;
}
```

Holds `TargetDefinition` entries keyed by name. Preserves insertion order — `names()` and `allDefinitions()` are deterministic.

- **`register(definition)`** — Registers a target. Throws if a target with the same `name` is already registered.
- **`get(name)`** — Returns a shallow copy of the `TargetDefinition` for `name`. Throws (listing known names) if not registered. Mutating the returned object does not affect the registry.
- **`has(name)`** — Returns `true` if a target with the given name is registered.
- **`names()`** — Returns all registered target names in registration order.
- **`allDefinitions()`** — Returns shallow copies of all `TargetDefinition` objects in registration order. Mutating a returned definition does not affect the registry.
- **`clone()`** — Returns a new `TargetRegistry` pre-populated with shallow copies of the same definitions. Useful for test isolation.

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

### `runBuildContext(plugins, ctx, persona, suite, target?)`

```ts
export function runBuildContext(
  plugins: PersonaBuildPlugin[],
  ctx: Record<string, unknown>,
  persona: PersonaMetadata,
  suite: SuiteConfig,
  target?: TargetType,
): Record<string, unknown>;
```

Accumulating hook — each plugin receives the previous plugin's returned context. The optional `target` parameter is forwarded to each plugin's `onBuildContext` call. Returns the final context.

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
  /** Defaults to both built-in targets when omitted. Accepts any registered target name. */
  targets?: string[];
  check?: boolean;
  strict?: boolean;
  /** Keyed by target name. Accepts any string key, including custom targets. */
  frontmatter?: Record<string, string>;
  /**
   * Not yet consumed by build(). Typed now ahead of the follow-up release
   * that will wire it into the build orchestrator.
   */
  targetRegistry?: TargetRegistry;
}
```

### `SuiteConfig`

```ts
export interface SuiteConfig {
  srcDir: string;
  /** @deprecated Use outputDirs['vscode']. Runtime still reads this exclusively until the follow-up release. */
  outVscode: string;
  /** @deprecated Use outputDirs['claude-code']. Runtime still reads this exclusively until the follow-up release. */
  outClaudeCode: string;
  /** Not yet consumed by the runtime. Typed now ahead of the follow-up release. */
  outputDirs?: Record<string, string>;
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
  /** Target name this result was generated for (e.g. `'vscode'`, `'claude-code'`, or a custom target). */
  target: string;
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
    target?: TargetType,
  ): Record<string, unknown>;
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig, target?: TargetType): ValidationResult[];
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
```

### `TargetType`

```ts
export type TargetType = string;
```

Resolves to `string` to allow custom targets alongside the two built-in well-known values (`'vscode'`, `'claude-code'`). Use the exported constants `TARGET_VSCODE` and `TARGET_CLAUDE_CODE` for type-safe references to the built-in targets.

### `TargetDefinition`

```ts
export interface TargetDefinition {
  name: string;
  outputDirKey: string;
  filenameContextKey?: string;
  defaultFrontmatter: string;
  contextFlags?: Record<string, unknown>;
  defaultEnabled?: boolean;
}
```

Describes a build target. `name` is the unique target identifier (e.g. `'vscode'`). `outputDirKey` maps to the suite's output directory key. `filenameContextKey` names the build-context field holding a custom output filename for this target. `defaultFrontmatter` is the template used when no plugin or `BuildConfig` override is provided. `contextFlags` is a **declarative** map of context injections (e.g. `{ target_vscode: true }`) — consumed by the runtime via registry-driven lookup (`registry.get(target).contextFlags`). Each key-value pair is injected into the build context for the corresponding target, enabling conditional template rendering. When a target is not present in the registry, the engine falls back to injecting a single boolean via string replacement (`target_${name.replace(/-/g, '_')} = true`). `defaultEnabled` controls whether the target is included in the default build when no explicit `targets` array is configured — defaults to `true` when omitted; set to `false` for opt-in targets (e.g. `'deep-agents'`).

### `ValidationResult`

```ts
export interface ValidationResult {
  severity: 'error' | 'warning' | 'info';
  message: string;
}
```


