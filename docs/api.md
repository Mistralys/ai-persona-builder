# Public API

All public symbols are exported from `@mistralys/persona-builder`:

| Export | Kind | Description |
|--------|------|-------------|
| `build` | function | Main entry point. Accepts a `BuildConfig` and returns a `Promise<BuildSummary>`. |
| `BuildConfig` | type | Configuration object passed to `build()`. |
| `SuiteConfig` | type | Per-suite configuration nested inside `BuildConfig.suites`. |
| `BuildSummary` | type | Object returned by `build()`. |
| `BuildResult` | type | One entry per persona × target in `BuildSummary.results`. |
| `PersonaBuildPlugin` | type | Plugin interface — implement to extend the build pipeline. |
| `TargetType` | type | Union type: `'vscode' \| 'claude-code'`. |
| `ValidationResult` | type | `{ severity: 'error' \| 'warning', message: string }` — returned by `onValidate` hooks. |
| `escapeRegExp` | function | Escapes a string for safe use inside a `new RegExp(...)` constructor. Exported from `src/utils/regex.ts`. |
| `VERSION` | `string` | Package version string (e.g. `'1.0.1'`), sourced from `package.json` at runtime. |

```ts
import { build, VERSION } from '@mistralys/persona-builder';

console.log(`Using @mistralys/persona-builder v${VERSION}`);
```

For detailed type definitions, see:
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, `BuildSummary`
- [Plugins](plugins.md) — `PersonaBuildPlugin`, `ValidationResult`
