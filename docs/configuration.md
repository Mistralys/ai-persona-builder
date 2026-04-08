# Configuration Reference

## BuildConfig

The configuration object passed to `build()`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `suites` | `Record<string, SuiteConfig>` | **required** | Map of suite names to suite configurations. |
| `sharedPartialsDir` | `string` | `undefined` | Absolute path to a shared partials directory. Partials here are loaded as the base layer; suite-local partials overlay them. |
| `plugins` | `PersonaBuildPlugin[]` | `[]` | Plugins applied to every suite in registration order. |
| `targets` | `string[]` | See below | Output targets to generate. The default is derived from the registry: all targets where `defaultEnabled !== false`. For `defaultRegistry`, this yields `['vscode', 'claude-code']` (the `'deep-agents'` target has `defaultEnabled: false`). Pass an explicit array to override. |
| `check` | `boolean` | `false` | When `true`, personas are rendered but **no files are written**. Useful for CI staleness checks. |
| `strict` | `boolean` | `false` | When `true`, the build throws if any `ValidationResult` has severity `'error'` or `'warning'`. |
| `frontmatter` | `Record<string, string>` | Registry defaults | Override the default frontmatter templates, keyed by target name. See [template syntax](template-syntax.md). |
| `targetRegistry` | `TargetRegistry` | `defaultRegistry` | Registry of target definitions to use for this build. When provided, overrides `defaultRegistry` for output directory resolution, filename lookup, frontmatter defaults, and context flag injection. Register custom targets here to extend the build system. |

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

> **`outputDirs` key note:** Each key in `outputDirs` must match the target's `outputDirKey` field (declared in its `TargetDefinition`), **not** necessarily the target name. For the three built-in targets `outputDirKey` equals the target name (`'vscode'`, `'claude-code'`, `'deep-agents'`), so there is no difference in practice. For a custom target where `outputDirKey` differs from `name`, use the `outputDirKey` value as the map key.

## BuildSummary

The object returned by `build()`.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` unless strict mode is on and there are validation failures. |
| `results` | `BuildResult[]` | One entry per persona × target combination. |
| `strictFailures` | `ValidationResult[]` | Validation issues that triggered a strict-mode failure. |
| `totalBuilt` | `number` | Total number of persona × target combinations processed. |
| `totalWritten` | `number` | Number of output files actually written to disk (0 in check mode). |
