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
| `VERSION` | `string` | Package version string (e.g. `'1.0.0'`), sourced from `package.json` at runtime. |

```ts
import { build, VERSION } from '@mistralys/persona-builder';

console.log(`Using @mistralys/persona-builder v${VERSION}`);
```

For detailed type definitions, see:
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, `BuildSummary`
- [Plugins](plugins.md) — `PersonaBuildPlugin`, `ValidationResult`

---

## Ledger Plugin — `@mistralys/persona-builder/plugins/ledger`

The ledger plugin is a first-party plugin shipped as a **separate sub-path export** and is not included in the main barrel. Import it explicitly:

```ts
import { ledgerPlugin } from '@mistralys/persona-builder/plugins/ledger';
```

| Export | Kind | Description |
|--------|------|-------------|
| `ledgerPlugin` | function | Factory — returns a `PersonaBuildPlugin` for the ledger suite |
| `LedgerPluginOptions` | type | Options accepted by `ledgerPlugin()` |
| `RosterEntry` | type | One entry in the ledger agent roster (`number`, `title`, `short`) |
| `McpToolEntry` | type | One MCP tool entry (`tool`, `purpose`, `note_only?`) |
| `renderRoster` | function | Renders roster as a numbered Markdown list |
| `renderMcpToolsTable` | function | Renders MCP tools as Markdown table rows (filters `note_only`) |
| `validateRole` | function | Validates a persona's `role` against the workflow manifest |
| `validateNoteOnlyGuard` | function | Asserts `note_only` tools are absent from the rendered output |
| `FRONTMATTER_LEDGER_VSCODE` | `string` | VS Code frontmatter template for the ledger suite |
| `FRONTMATTER_LEDGER_CC` | `string` | Claude Code frontmatter template for the ledger suite |

See [Plugins → Ledger Plugin](plugins.md#ledger-plugin----mistralys-persona-builderpluginsledger) for full documentation, usage example, and the `warnOnUnknownRole` known limitation.
