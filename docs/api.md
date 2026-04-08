# Public API

All public symbols are exported from `@mistralys/persona-builder`:

## Build functions

| Export | Kind | Description |
|--------|------|-------------|
| `build` | function | Top-level build orchestrator. Accepts a `BuildConfig` and returns a `Promise<BuildSummary>`. |
| `buildSuite` | function | Build all personas in one suite for a single target. See JSDoc for the two-registry limitation when calling directly. |
| `buildPersona` | function | Build a single persona for a single target. See JSDoc for the two-registry limitation when calling directly. |

## Types

| Export | Kind | Description |
|--------|------|-------------|
| `BuildConfig` | type | Configuration object passed to `build()`. |
| `SuiteConfig` | type | Per-suite configuration nested inside `BuildConfig.suites`. |
| `BuildSummary` | type | Object returned by `build()`. |
| `BuildResult` | type | One entry per persona × target in `BuildSummary.results`. |
| `PersonaBuildPlugin` | type | Plugin interface — implement to extend the build pipeline. |
| `TargetType` | type | Resolves to `string`. Well-known built-in values: `'vscode'`, `'claude-code'`, `'deep-agents'`. Accepts any custom target name registered via `TargetRegistry`. |
| `TargetDefinition` | type | Descriptor for a build target: `name`, `outputDirKey`, `defaultFrontmatter`, `contextFlags`, and optional `filenameContextKey`. |
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
| `register(def)` | `void` | Register a new target. Throws if a target with the same name exists. |
| `get(name)` | `TargetDefinition` | Retrieve a definition by name. Throws if not found. |
| `has(name)` | `boolean` | Check if a target name is registered. |
| `names()` | `string[]` | All registered target names, in registration order. |
| `allDefinitions()` | `TargetDefinition[]` | All registered definitions (shallow copies), in registration order. |
| `clone()` | `TargetRegistry` | Returns a new registry pre-populated with shallow copies of the same definitions. Useful for test isolation. |

> **Registry limitation:** When passing a custom `TargetRegistry` via `config.targetRegistry` to `build()`, it is only used at the `build()` level. Direct calls to `buildSuite()` or `buildPersona()` without the `registry` argument use `defaultRegistry` and will not see custom targets. **Workaround:** always go through `build()`, or explicitly pass `registry` to the lower-level functions.

> **Test isolation:** `defaultRegistry` is a module-level singleton. Calling `register()` on it in tests mutates shared state that persists across test cases. Use `defaultRegistry.clone()` to obtain an isolated copy.

## Utilities

| Export | Kind | Description |
|--------|------|-------------|
| `escapeRegExp` | function | Escapes a string for safe use inside a `new RegExp(...)` constructor. |
| `VERSION` | `string` | Package version string (e.g. `'2.1.0'`), sourced from `package.json` at runtime. |

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

For detailed type definitions, see:
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, `BuildSummary`
- [Plugins](plugins.md) — `PersonaBuildPlugin`, `ValidationResult`
