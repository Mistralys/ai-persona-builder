# Configuration Reference

## BuildConfig

The configuration object passed to `build()`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `suites` | `Record<string, SuiteConfig>` | **required** | Map of suite names to suite configurations. |
| `sharedPartialsDir` | `string` | `undefined` | Absolute path to a shared partials directory. Partials here are loaded as the base layer; suite-local partials overlay them. |
| `plugins` | `PersonaBuildPlugin[]` | `[]` | Plugins applied to every suite in registration order. |
| `targets` | `Array<'vscode' \| 'claude-code'>` | `['vscode', 'claude-code']` | Output formats to generate. Omit to build both. |
| `check` | `boolean` | `false` | When `true`, personas are rendered but **no files are written**. Useful for CI staleness checks. |
| `strict` | `boolean` | `false` | When `true`, the build throws if any `ValidationResult` has severity `'error'` or `'warning'`. |
| `frontmatter` | `Partial<Record<'vscode' \| 'claude-code', string>>` | Built-in defaults | Override the default frontmatter templates. See [template syntax](template-syntax.md). |

## SuiteConfig

Per-suite configuration nested inside `BuildConfig.suites`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `srcDir` | `string` | **required** | Absolute or relative path to the suite source directory. |
| `outVscode` | `string` | **required** | Output directory for VS Code persona files. |
| `outClaudeCode` | `string` | **required** | Output directory for Claude Code persona files. |
| `personaMode` | `string` | `undefined` | Passthrough value exposed to plugins. The core library does nothing with it; its meaning is entirely plugin-defined. Use it to vary plugin behaviour per suite (e.g. apply different rendering logic when `personaMode === 'ledger'` vs `personaMode === 'standalone'`). Plugins can read it inside `onSuiteInit` and `onBuildContext` via `suite.personaMode`. |
| `partialsSubdir` | `string` | `'partials'` | Sub-directory within `srcDir` containing suite-local partials. |
| `metaSubdir` | `string` | `'meta'` | Sub-directory within `srcDir` containing YAML metadata files. |
| `contentSubdir` | `string` | `'content'` | Sub-directory within `srcDir` containing Markdown content templates. |

## BuildSummary

The object returned by `build()`.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | `true` unless strict mode is on and there are validation failures. |
| `results` | `BuildResult[]` | One entry per persona × target combination. |
| `strictFailures` | `ValidationResult[]` | Validation issues that triggered a strict-mode failure. |
| `totalBuilt` | `number` | Total number of persona × target combinations processed. |
| `totalWritten` | `number` | Number of output files actually written to disk (0 in check mode). |
