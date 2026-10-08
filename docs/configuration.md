# Configuration Reference

## BuildConfig

The configuration object passed to `build()`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `suites` | `Record<string, SuiteConfig>` | **required** | Map of suite names to suite configurations. |
| `sharedPartialsDir` | `string` | `undefined` | Absolute path to a shared partials directory. Forms layer 2 in the five-layer partial resolution order: `BuildConfig.partials` (lowest) → `sharedPartialsDir` → suite-local partials → `onPartials` plugin hooks → `onPersonaPartials` plugin hooks (highest). See [Custom Variables & Dynamic Partials](dynamic-partials.md). |
| `partials` | `Record<string, string>` | `undefined` | Inline partials map (partial name → content). Forms the **lowest** layer (layer 1) in the five-layer partial resolution order: `BuildConfig.partials` (lowest) → `sharedPartialsDir` → suite-local partials → `onPartials` plugin hooks → `onPersonaPartials` plugin hooks (highest). Useful for injecting programmatically generated content without touching the filesystem. See also [Custom Variables & Dynamic Partials](dynamic-partials.md). |
| `variables` | `Record<string, unknown>` | `undefined` | Global template variables available to every persona during rendering. Forms layer 1 (lowest priority) of the 7-layer merge chain: `BuildConfig.variables` → `SuiteConfig.variables` → `_shared.yaml` → per-persona YAML → derived fields → agent map → target flags. Suite-level `SuiteConfig.variables` are merged on top of these and take precedence when the same key appears in both. |
| `plugins` | `PersonaBuildPlugin[]` | `[]` | Plugins applied to every suite in registration order. |
| `targets` | `string[]` | See below | Output targets to generate. The default is derived from the registry: all targets where `defaultEnabled !== false`. For `defaultRegistry`, this yields `['vscode', 'claude-code']` (the `'deep-agents'` target has `defaultEnabled: false`). Pass an explicit array to override. |
| `check` | `boolean` | `false` | When `true`, personas are rendered but **no files are written**. Useful for CI staleness checks. |
| `strict` | `boolean` | `false` | When `true`, the build throws (after all suites have built) if any `ValidationResult` has severity `'error'` or `'warning'`. Note: error-severity results already fail the build (`BuildSummary.success = false`) **without** `strict`; `strict` additionally covers warnings and upgrades the failure from a returned summary to a thrown `Error`. Combine with `check: true` in CI to avoid partial writes on failure. |
| `frontmatter` | `Record<string, string>` | Registry defaults | Override the default frontmatter templates, keyed by target name. See [template syntax](template-syntax.md). |
| `targetRegistry` | `TargetRegistry` | `defaultRegistry` | Registry of target definitions to use for this build. When provided, overrides `defaultRegistry` for output directory resolution, filename lookup, frontmatter defaults, and context flag injection. Register custom targets here to extend the build system. |
| `toolRequirements` | `ToolRequirement[]` | `undefined` | Additional dispatch requirements beyond the built-in `SUBAGENT_DISPATCH_REQUIREMENT` (`{ id: 'subagent-dispatch', when: { field: 'subagents' } }`, always applied). Each `{ id, when: { field } \| { partial }, targets? }` entry fires an error when its trigger is met but the target grants no `dispatch`-capability tool; an entry reusing the built-in `id` replaces it. See [API Reference — Dispatch-grant and foreign-notation validation](api.md#dispatch-grant-and-foreign-notation-validation). |

## SuiteConfig

Per-suite configuration nested inside `BuildConfig.suites`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `srcDir` | `string` | **required** | Absolute or relative path to the suite source directory. |
| `outVscode` | `string` | `undefined` | _(Deprecated)_ Output directory for VS Code persona files. Use `outputDirs['vscode']` instead; that takes precedence when present. Will be removed in a future major version. |
| `outClaudeCode` | `string` | `undefined` | _(Deprecated)_ Output directory for Claude Code persona files. Use `outputDirs['claude-code']` instead; that takes precedence when present. Will be removed in a future major version. |
| `outputDirs` | `Record<string, string>` | `undefined` | Map of output directories keyed by each target's `outputDirKey` (see note below). Takes precedence over the deprecated fields. Required for the `'deep-agents'` built-in and all custom targets. |
| `personaMode` | `string` | `undefined` | Passthrough value exposed to plugins. The core library does nothing with it; its meaning is entirely plugin-defined. Use it to vary plugin behaviour per suite (e.g. apply different rendering logic when `personaMode === 'ledger'` vs `personaMode === 'standalone'`). Plugins can read it inside `onSuiteInit` and `onBuildContext` via `suite.personaMode`. |
| `partialsSubdir` | `string` | `'partials'` | Sub-directory within `srcDir` containing suite-local partials. |
| `metaSubdir` | `string` | `'meta'` | Sub-directory within `srcDir` containing YAML metadata files. |
| `contentSubdir` | `string` | `'content'` | Sub-directory within `srcDir` containing Markdown content templates. |
| `variables` | `Record<string, unknown>` | `undefined` | Suite-level template variables. Forms layer 2 of the 7-layer merge chain: `BuildConfig.variables` → `SuiteConfig.variables` → `_shared.yaml` → per-persona YAML → derived fields → agent map → target flags. Overrides `BuildConfig.variables` for the same key; itself overridden by `_shared.yaml` and per-persona YAML fields. |

> **`outputDirs` key note:** Each key in `outputDirs` must match the target's `outputDirKey` field (declared in its `TargetDefinition`), **not** necessarily the target name. For the three built-in targets `outputDirKey` equals the target name (`'vscode'`, `'claude-code'`, `'deep-agents'`), so there is no difference in practice. For a custom target where `outputDirKey` differs from `name`, use the `outputDirKey` value as the map key.

## BuildResult

One entry per persona × target combination, held in `BuildSummary.results`.

| Field | Type | Description |
|-------|------|-------------|
| `suite` | `string` | Suite name this result belongs to. |
| `target` | `string` | Target name this result was generated for. |
| `personaYamlPath` | `string` | Absolute path to the persona's source YAML file. |
| `outputPath` | `string` | Absolute path the rendered content was (or would be) written to. |
| `content` | `string` | Rendered output (frontmatter + body). |
| `validationResults` | `ValidationResult[]` | Findings from `onValidate` plugin hooks plus the built-in `validateSubagentRefs()` / `validateToolRequirements()` checks, and (for mapped targets) any `validateToolParity()` findings appended by the `build()` post-pass. |
| `written` | `boolean` | Whether the file was actually written to disk (`false` in check mode). |
| `effectiveTools` | `string[] \| undefined` | The persona's effective (post-`onBuildContext`) tool list for `target`, resolved via `resolveTargetTools()` — the same list `toolRequirements` were validated against. `undefined` when `target` has no registered `TargetDefinition`, in which case both the dispatch-grant check and the capability-parity post-pass skip this result entirely. |

## BuildSummary

The object returned by `build()`.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `errors === 0 && (!strict \|\| warnings === 0)`. An error-severity result fails every build by default, with or without `strict`; `strict` additionally requires zero warnings. |
| `results` | `BuildResult[]` | One entry per persona × target combination. |
| `strictFailures` | `ValidationResult[]` | Every error/warning-severity result found in the build — each result's `validationResults` plus `issues`. Populated unconditionally (not only when `strict` is set); in `strict` mode this is also the list the thrown error message is built from. |
| `errors` | `number` | Count of error-severity results within `strictFailures`. Any error makes `success` false. |
| `warnings` | `number` | Count of warning-severity results within `strictFailures`. Only affects `success` when `strict` is set. |
| `totalBuilt` | `number` | Total number of persona × target combinations processed. |
| `totalWritten` | `number` | Number of output files actually written to disk (0 in check mode). |
| `skipped` | `SkippedBuild[]` | One entry per persona × active-target combination whose resolved `targets` (see [Metadata Reference — Tier 4d](metadata-reference.md#tier-4d--per-target-persona-selection)) excluded that target. These personas were never rendered or written — `buildSuite()` skips them before calling `buildPersona()`. Each entry is `{ suite, target, personaYamlPath }`. |
| `issues` | `ValidationResult[]` | Results from resolving each persona's `targets` field during the pre-scan (error severity: unknown target name, non-string entry, empty array) and unrecognised `tool_parity_exceptions` names (warning severity). Also folded into `strictFailures`. |
