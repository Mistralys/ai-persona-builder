# Public API

All public symbols are exported from `@mistralys/persona-builder`:

## Build functions

| Export | Kind | Description |
|--------|------|-------------|
| `build` | function | Top-level build orchestrator. Accepts a `BuildConfig` and returns a `Promise<BuildSummary>`. |
| `buildSuite` | function | Build all personas in one suite for a single target, skipping any persona whose resolved `targets` exclude that target (see [Metadata Reference — Tier 4d](metadata-reference.md#tier-4d--per-target-persona-selection)). See JSDoc for the two-registry limitation when calling directly. |
| `buildPersona` | function | Build a single persona for a single target. See JSDoc for the two-registry limitation when calling directly. |

## Template engine

Every function below lives in `src/engine/` and has zero external dependencies (see
[`constraints.md` — Zero-Dependency Engine Layer](agents/project-manifest/constraints.md)). A
direct caller composing them by hand (rather than going through `build()`/`buildPersona()`)
must apply them in this order — each stage's output feeds the next:

```
stripComments → resolvePartials → resolveConditionals → resolveVariables
```

(`collapseBlankLines`, `ensureBlankLineBeforeHeadings`, and `normalizeNewlines` are
post-processing steps applied after that chain; see [template-syntax.md](template-syntax.md)
for the full syntax reference.)

| Export | Kind | Description |
|--------|------|-------------|
| `stripComments(text)` | function `(text: string) => string` | Removes `{{!-- … --}}` and `{{! … }}` template comments, including any tag or marker written inside one (a partial, conditional, or variable reference is inert once commented out). Must run first — `resolveConditionals()` does not recognise comment delimiters. Example: `stripComments('{{!-- note --}}Hello')` → `'Hello'`. |
| `resolvePartials(text, partialsMap, depth?)` | function `(text: string, partialsMap: Record<string, string>, depth?: number) => string` | Expands `{{> partialName}}` markers by substituting from `partialsMap`, recursing up to depth 2 (deeper nesting is left unresolved). `depth` is an internal recursion counter — omit it when calling directly. Example: `resolvePartials('{{> greeting}}', { greeting: 'Hi' })` → `'Hi'`. |
| `collectPartialReferences(text, partialsMap)` | function `(text: string, partialsMap: Record<string, string>) => Set<string>` | Reports every partial name a template transitively references (direct + one level of nested reference, mirroring `resolvePartials()`'s depth-2 cap), without expanding anything. Used to check whether a partial (e.g. a dispatch block) is actually referenced before a `ToolRequirement`'s `partial` trigger fires. Example: `collectPartialReferences('{{> a}}', { a: '{{> b}}', b: 'x' })` → `Set { 'a', 'b' }`. |
| `resolveConditionals(text, context)` | function `(text: string, context: Record<string, unknown>) => string` | Evaluates `{{#if flag}}…{{/if}}`, `{{#if flag}}…{{else}}…{{/if}}`, and `{{#if flag}}…{{else if flag2}}…{{else}}…{{/if}}` chains against `context`; unknown flags are falsy. Does not recognise comment delimiters — call `stripComments()` first if the input may contain comments. Example: `resolveConditionals('{{#if a}}yes{{/if}}', { a: true })` → `'yes'`. |
| `resolveVariables(text, context, filename)` | function `(text: string, context: Record<string, unknown>, filename: string) => string` | Substitutes `{{varName}}` markers from `context`; `\{{varName}}` is an escape producing a literal `{{varName}}` with no warning. Missing variables emit a `[WARN]` (naming `filename`) but do not throw. Example: `resolveVariables('Hi {{name}}', { name: 'Ada' }, 'x.md')` → `'Hi Ada'`. |
| `collapseBlankLines(text)` | function `(text: string) => string` | Collapses 3-or-more consecutive blank lines down to 2 (i.e. 4-or-more consecutive `\n` down to exactly `\n\n\n`) — post-render cleanup, not a hard one-blank-line rule. Example: `collapseBlankLines('a\n\n\n\nb')` → `'a\n\n\nb'`. |
| `ensureBlankLineBeforeHeadings(text)` | function `(text: string) => string` | Inserts a blank line before every Markdown heading and horizontal rule that is missing one — corrects gaps caused by a partial's own `trimEnd()` abutting the next line. Example: `ensureBlankLineBeforeHeadings('text\n## Heading')` → `'text\n\n## Heading'`. |
| `normalizeNewlines(text)` | function `(text: string) => string` | Normalises `\r\n` / `\r` line endings to `\n`. Applied when a content template is first loaded from disk. Example: `normalizeNewlines('a\r\nb')` → `'a\nb'`. |
| `serializeTools(tools)` | function `(tools: string[]) => string` | Serialises a tool-name array into the single-line YAML flow-sequence format used in VS Code frontmatter (`tools: ['Read', 'Edit']`). |
| `serializeToolsList(tools)` | function `(tools: string[]) => string` | Serialises a tool-name array into a comma-separated string for Claude Code frontmatter (`tools: Read, Edit`). |
| `serializeToolsBlock(tools)` | function `(tools: string[]) => string` | Serialises a tool-name array into a Markdown bullet list, one tool per line — the format used by the `{{tools_block}}`/`{{cc_tools_block}}`/`{{da_tools_block}}` context variables. |

## Types

| Export | Kind | Description |
|--------|------|-------------|
| `BuildConfig` | type | Configuration object passed to `build()`. |
| `SuiteConfig` | type | Per-suite configuration nested inside `BuildConfig.suites`. |
| `BuildSummary` | type | Object returned by `build()`. `success` is false whenever any error-severity result exists, with or without `strict` (`strict` additionally requires zero warnings). Includes `errors`/`warnings` counts, `skipped: SkippedBuild[]` (personas excluded by `targets`), and `issues: ValidationResult[]` (target-resolution errors, unrecognised `tool_parity_exceptions` names) — see [Configuration Reference](configuration.md#buildsummary). |
| `BuildResult` | type | One entry per persona × target in `BuildSummary.results`. |
| `PersonaBuildPlugin` | type | Plugin interface — implement to extend the build pipeline. |
| `TargetType` | type | Resolves to `string`. Well-known built-in values: `'vscode'`, `'claude-code'`, `'deep-agents'`. Accepts any custom target name registered via `TargetRegistry`. |
| `TargetDefinition` | type | Descriptor for a build target: `name`, `outputDirKey`, `defaultFrontmatter`, `contextFlags`, and optional `filenameContextKey`, `toolsContextKey`, `toolCapabilities`, `mcpToolPattern`. See **Tool capability resolution** below. |
| `ValidationResult` | type | `{ severity: 'error' \| 'warning', message: string }` — returned by `onValidate` hooks. |

## Target registry

| Export | Kind | Description |
|--------|------|-------------|
| `TargetRegistry` | class | Registry mapping target names to `TargetDefinition` objects. Call `register()` to add custom targets. |
| `defaultRegistry` | `TargetRegistry` | Pre-populated singleton with the three built-in targets: `'vscode'`, `'claude-code'`, and `'deep-agents'`. |
| `TARGET_VSCODE` | `string` constant | `'vscode'` — type-safe reference to the VS Code built-in target name. |
| `TARGET_CLAUDE_CODE` | `string` constant | `'claude-code'` — type-safe reference to the Claude Code built-in target name. |
| `TARGET_DEEP_AGENTS` | `string` constant | `'deep-agents'` — type-safe reference to the Deep Agents built-in target name. |

### TargetRegistry methods

| Method | Returns | Description |
|--------|---------|-------------|
| `register(def)` | `void` | Register a new target. Throws if a target with the same name exists, or if `def.mcpToolPattern` carries the `g` or `y` flag. |
| `get(name)` | `TargetDefinition` | Retrieve a definition by name (deep-copies `toolCapabilities`). Throws if not found. |
| `has(name)` | `boolean` | Check if a target name is registered. |
| `names()` | `string[]` | All registered target names, in registration order. |
| `allDefinitions()` | `TargetDefinition[]` | All registered definitions (deep-copying `toolCapabilities`), in registration order. |
| `clone()` | `TargetRegistry` | Returns a new registry pre-populated with copies of the same definitions (same `toolCapabilities` deep-copy guarantee). Useful for test isolation. |

> **Registry limitation:** When passing a custom `TargetRegistry` via `config.targetRegistry` to `build()`, it is only used at the `build()` level. Direct calls to `buildSuite()` or `buildPersona()` without the `registry` argument use `defaultRegistry` and will not see custom targets. **Workaround:** always go through `build()`, or explicitly pass `registry` to the lower-level functions.

> **Test isolation:** `defaultRegistry` is a module-level singleton. Calling `register()` on it in tests mutates shared state that persists across test cases. Use `defaultRegistry.clone()` to obtain an isolated copy.

## Utilities

| Export | Kind | Description |
|--------|------|-------------|
| `escapeRegExp` | function | Escapes a string for safe use inside a `new RegExp(...)` constructor. |
| `VERSION` | `string` | Package version string (e.g. `'2.1.0'`), sourced from `package.json` at runtime. |

## Persona index and target resolution

`build()` pre-scans every persona once via `scanPersonas()`, resolving each persona's declared
`targets` field (see [Metadata Reference — Tier 4d](../metadata-reference.md#tier-4d--per-target-persona-selection))
and deriving the cross-suite agent name map from the result. These functions and types are
exported for consumers that need the same pre-scan data directly (e.g. a custom build script or
plugin that needs to know which targets a persona resolves to before `build()` runs).

| Export | Kind | Description |
|--------|------|-------------|
| `scanPersonas(config, registry)` | function | Scans every configured suite's persona YAML files once, returning a `PersonaIndex`. |
| `resolvePersonaTargets(declared, registry, yamlPath)` | function | Resolves a persona's raw `targets` YAML value against a `TargetRegistry`, returning the resolved list plus validation issues. |
| `agentNameMapFromIndex(index)` | function | Derives the cross-suite agent name map from a `PersonaIndex` (replaces the former, now-removed `buildAgentNameMap()`). |
| `PersonaIndex` | type | `{ entries: PersonaIndexEntry[], bySlug: Map<string, PersonaIndexEntry>, issues: ValidationResult[] }` — result of `scanPersonas()`. |
| `PersonaIndexEntry` | type | One persona's entry in the index: suite, yamlPath, slug, name, version, resolved `targets`, raw `declaredTargets`, `toolParityExceptions`. |
| `TargetResolution` | type | `{ targets: string[], issues: ValidationResult[] }` — return type of `resolvePersonaTargets()`. |

> **Fully enforced:** The resolved `targets` field is enforced — `build()`/`buildSuite()` skip
> rendering (and writing) a persona for each excluded target, recording the skip in
> `BuildSummary.skipped`. `toolParityExceptions` is now consumed too — `build()`'s cross-target
> capability-parity post-pass (`validateToolParity()`, see [Cross-target tool-parity
> validation](#cross-target-tool-parity-validation) below) skips any capability named in it, and
> `scanPersonas()` flags an unrecognized exception name as an issue warning.

```ts
import { build, VERSION, TARGET_DEEP_AGENTS, defaultRegistry, TargetRegistry } from '@mistralys/persona-builder';

console.log(`Using @mistralys/persona-builder v${VERSION}`);

// Register a custom target
defaultRegistry.register({
  name: 'my-target',
  outputDirKey: 'my-target',
  defaultFrontmatter: '---\ncustom: frontmatter\n---',
  contextFlags: { target_my_target: true },
});

// Build including the deep-agents target
const summary = await build({
  targets: ['vscode', 'claude-code', TARGET_DEEP_AGENTS],
  suites: {
    'my-suite': {
      srcDir: './src',
      outputDirs: {
        vscode: './dist/vscode',
        'claude-code': './dist/claude-code',
        'deep-agents': './dist/deep-agents',
      },
    },
  },
});
```

## Creating a Custom Target

The three built-in targets (`vscode`, `claude-code`, `deep-agents`) cover the most common output
formats. To add a fourth target — for example, a custom platform — register a `TargetDefinition`
before calling `build()`.

### TargetDefinition fields

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `name` | `string` | Yes | Unique target identifier (e.g. `'my-platform'`). |
| `outputDirKey` | `string` | Yes | Key used to look up the output directory in `SuiteConfig.outputDirs`. Typically the same as `name`. |
| `defaultFrontmatter` | `string` | Yes | Default frontmatter template string. Used when no plugin or config override is provided. |
| `filenameContextKey` | `string` | No | Context field holding a custom output filename (e.g. `'mp_file_name'`). When absent, the output filename falls back to the content file's basename. |
| `contextFlags` | `Record<string, unknown>` | No | Flags auto-injected into the template context when this target is active. Convention: `{ target_<name>: true }` (hyphens → underscores). |
| `defaultEnabled` | `boolean` | No | Whether this target is included when `BuildConfig.targets` is not set. Defaults to `true` when omitted. Set to `false` if the target should only build when explicitly requested. |
| `toolsContextKey` | `string` | No | Context field holding this target's tool list (e.g. `'cc_tools'`). Falls back to `'tools'` when omitted or when the named key is absent/not an array. See **Tool capability resolution** below. |
| `toolCapabilities` | `Record<string, string[]>` | No | Capability name → the tool names that grant it on this target (any one is sufficient). Only mapped capabilities can be resolved or checked for parity — omit entirely if the target grants nothing resolvable. |
| `mcpToolPattern` | `RegExp` | No | Pattern recognising this target's MCP tool-name notation; group 1 must capture the server name. **Must not carry the `g` or `y` flag** — `register()` throws if it does. |

### Tool capability resolution

`src/targets/tools.ts` exports a small set of functions that read `toolsContextKey` /
`toolCapabilities` / `mcpToolPattern` to answer "which tools does this persona grant on this
target, and which capabilities do they add up to" — the same question both rendering (the
`cc_tools`/`da_tools` fallback) and cross-target validation need answered consistently.

| Export | Kind | Description |
|--------|------|-------------|
| `pickToolList(record, key)` | function | Reads `record[key]` if it's an array, else falls back to `record['tools']`. |
| `resolveTargetTools(context, definition)` | function | Resolves the effective tool list for a target using its `toolsContextKey` (defaulting to `'tools'`). |
| `resolveCapabilities(tools, definition)` | function | Returns a `Map<capability, tool>` of which capabilities a tool list grants, per the target's `toolCapabilities` and `mcpToolPattern`. Unmapped tools (e.g. VS Code's `browser`) are silently ignored — this correspondence is intentionally rough, covering only `execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo`, plus `mcp:<server>`. |
| `recognizedBy(tool, registry, excludeTarget)` | function | Returns the names of every other registered target that recognises `tool` (via capability map or MCP pattern) — used for foreign-notation checks (e.g. a `claude-code` persona accidentally using VS Code's lowercase `read`). |

The built-in targets' capability maps mirror the notation documented in
[Target Differences](../target-differences.md): `vscode` uses lowercase capability names as tool
names directly; `claude-code` uses its capitalised tool names (`Bash`, `Read`, `Edit`/`Write`,
`Grep`/`Glob`, `WebFetch`/`WebSearch`, `Task`/`Agent`, `TodoWrite`/`TodoRead`); `deep-agents`
declares only `toolsContextKey` (`'da_tools'`) and no capability map.

### Dispatch-grant and foreign-notation validation

`src/validators/tool-requirements-validator.ts` exports the pure function backing the per-persona,
per-target check that runs inside `buildPersona()` step 10 — the check that a dispatching persona
actually grants a dispatch tool, and that its tool names use the current target's own notation.

| Export | Kind | Description |
|--------|------|-------------|
| `ToolRequirement` | type | `{ id: string, when: { field: string } \| { partial: string }, targets?: string[] }`. `when.field` fires when the named context field is a non-empty array or string; `when.partial` fires when the persona's rendered template transitively includes the named partial (via `collectPartialReferences()`). `targets`, when set, restricts which targets the requirement is checked on. |
| `SUBAGENT_DISPATCH_REQUIREMENT` | constant | The built-in `ToolRequirement`: `{ id: 'subagent-dispatch', when: { field: 'subagents' } }`. Always applied; a `BuildConfig.toolRequirements` entry with the same `id` replaces it. |
| `validateToolRequirements(options)` | function | Pure validator. Emits one **error** per triggered, ungranted requirement (naming the requirement id, target, tool-list key, and the tools that would grant it), plus one **warning** per tool recognised by another target's notation but not the current one. `effectiveTools === undefined` (no registered `TargetDefinition` for the target) short-circuits to `[]`. |

`BuildConfig.toolRequirements?: ToolRequirement[]` (`src/builders/types.ts`) lets a consumer add
further dispatch requirements beyond the built-in one — for example, a config-defined handoff
partial that also implies dispatch. `buildPersona()` merges the built-in requirement with the
config list (same-`id` entries replace the built-in), determines which are triggered against the
post-`onBuildContext` context and the persona's content template, resolves the target's
`effectiveTools` via `resolveTargetTools()` (recorded on `BuildResult.effectiveTools`, `undefined`
when the target has no registered `TargetDefinition`), and calls `validateToolRequirements()` with
all of it.

### Cross-target tool-parity validation

`src/validators/tool-parity-validator.ts` exports the pure function backing `build()`'s
capability-parity post-pass — the check that a persona built for several mapped targets grants
the same capabilities on each one.

| Export | Kind | Description |
|--------|------|-------------|
| `validateToolParity(personaLabel, perTarget, exceptions)` | function | Compares granted capabilities across every `TargetCapabilitySet` in `perTarget` and returns one **error**-severity `ToolParityFinding` per lacking target × mismatched capability, naming the granting target(s)/tool(s) and the lacking target's own equivalent tool names. Capabilities in `exceptions` are skipped. Fewer than two target capability sets produce no findings. |
| `TargetCapabilitySet` | type | `{ target: string, capabilities: Map<string, string>, toolCapabilities: Record<string, string[]> }` — one target's granted capabilities plus its full capability map, for a single persona. |
| `ToolParityFinding` | type | `{ target: string, result: ValidationResult }` — a finding tied to the lacking target it belongs on. |

`validateToolParity` is a pure function with no file I/O — it cannot run inside `buildPersona()`,
since a single-target build never sees another target's effective tool list. `build()` runs it as
a post-pass after every suite × target has built: results are grouped by `personaYamlPath`,
filtered to targets with a capability map and a defined `effectiveTools`, and each finding is
appended to the lacking target's own `BuildResult.validationResults` (before `strictFailures` is
computed, so parity errors participate in the default error-fails-the-build behaviour and in
`strict: true`; see [Configuration Reference — BuildSummary](configuration.md#buildsummary)).

`scanPersonas()` also flags any `tool_parity_exceptions` name that isn't a capability recognised
by some registered target's `toolCapabilities` map (and isn't an `mcp:`-prefixed form) as a
warning-severity issue in `PersonaIndex.issues`.

### End-to-end example

```ts
import { build, defaultRegistry } from '@mistralys/persona-builder';
import path from 'node:path';

// 1. Register the target before calling build()
defaultRegistry.register({
  name: 'my-platform',
  outputDirKey: 'my-platform',
  defaultFrontmatter: `---
name: {{name}}
version: {{version}}
---`,
  filenameContextKey: 'mp_file_name',   // reads from persona YAML → mp_file_name
  contextFlags: { target_my_platform: true },
  defaultEnabled: false,                 // only builds when explicitly listed
});

// 2. Request the target in BuildConfig.targets
const summary = await build({
  targets: ['vscode', 'claude-code', 'my-platform'],
  suites: {
    'my-suite': {
      srcDir: path.resolve('./personas/my-suite'),
      outputDirs: {
        vscode: path.resolve('./dist/vscode'),
        'claude-code': path.resolve('./dist/claude-code'),
        'my-platform': path.resolve('./dist/my-platform'),  // key = outputDirKey
      },
    },
  },
});
```

**In persona YAML**, set the custom filename field if you registered a `filenameContextKey`:

```yaml
name: My Persona
slug: my-persona
mp_file_name: my-persona.custom.md
```

**In content templates**, use the `contextFlags` to write target-conditional content:

```md
{{#if target_my_platform}}
Content shown only in My Platform builds.
{{/if}}
```

> **Test isolation:** `defaultRegistry` is a module-level singleton. In tests, use
> `defaultRegistry.clone()` to avoid polluting the registry across test cases.

---

For detailed type definitions, see:
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, `BuildSummary`
- [Plugins](plugins.md) — `PersonaBuildPlugin`, `ValidationResult`
