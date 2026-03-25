# Plugins

Plugins extend the build pipeline without modifying the core engine. Register plugins via `BuildConfig.plugins`.

## PersonaBuildPlugin Interface

```ts
interface PersonaBuildPlugin {
  /** Unique name used for logging and identification */
  name: string;

  /**
   * Called once per suite before any persona is built.
   * Use this to read shared metadata and set up plugin state.
   */
  onSuiteInit?(suite: SuiteConfig, sharedMeta: Record<string, unknown>): void;

  /**
   * Called for each persona before template rendering.
   * Mutate and return the context to inject additional template variables.
   */
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
  ): Record<string, unknown>;

  /**
   * Called after the full output is rendered.
   * Mutate and return the output string (e.g. to append a footer).
   */
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;

  /**
   * Called during the validation phase.
   * Return an array of ValidationResult entries (empty = no issues).
   */
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig): ValidationResult[];

  /**
   * Register custom frontmatter templates, keyed by target type.
   * These override the library defaults and config-level overrides.
   */
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
```

## Examples

### Adding a custom frontmatter field

```ts
import { build, type PersonaBuildPlugin } from '@mistralys/persona-builder';

const timestampPlugin: PersonaBuildPlugin = {
  name: 'timestamp',

  onBuildContext(context) {
    // Inject a build-time variable that templates can use as {{build_date}}
    return { ...context, build_date: new Date().toISOString().slice(0, 10) };
  },
};

const summary = await build({
  suites: {
    docs: {
      srcDir: './personas/docs',
      outVscode: './dist/vscode',
      outClaudeCode: './dist/cc',
    },
  },
  plugins: [timestampPlugin],
});
```

### Custom frontmatter template via plugin

```ts
const ledgerPlugin: PersonaBuildPlugin = {
  name: 'ledger',

  frontmatterTemplates: {
    'claude-code': `---
name: {{cc_file_name_stem}}
description: '{{description}}'
permissionMode: {{cc_permission_mode}}
model: {{cc_model}}
memory: {{cc_memory}}
mcpServers:
  - central_pm
---`,
  },
};
```

### Validation plugin

```ts
import type { PersonaBuildPlugin, ValidationResult } from '@mistralys/persona-builder';

const requiredFieldsPlugin: PersonaBuildPlugin = {
  name: 'required-fields',

  onValidate(persona): ValidationResult[] {
    const errors: ValidationResult[] = [];
    if (!persona.description) {
      errors.push({ severity: 'error', message: `${persona.name}: missing "description" field` });
    }
    if (!persona.version) {
      errors.push({ severity: 'warning', message: `${persona.name}: missing "version" field` });
    }
    return errors;
  },
};
```

---

## Ledger Plugin — `@mistralys/persona-builder/plugins/ledger`

The ledger plugin is a first-party plugin shipped as a **sub-path export** from the library. It wires ledger-specific rendering and validation into the standard build hooks and is the recommended way to build the ai-insights ledger persona suite.

### Import

```ts
// ESM
import { ledgerPlugin } from '@mistralys/persona-builder/plugins/ledger';

// CJS
const { ledgerPlugin } = require('@mistralys/persona-builder/plugins/ledger');
```

The sub-path resolves to `dist/plugins/ledger/index.{js,cjs,d.ts}` — all three artefacts (ESM, CJS, DTS) are included in the package.

---

### `ledgerPlugin(options?)`

```ts
function ledgerPlugin(options?: LedgerPluginOptions): PersonaBuildPlugin
```

Factory function. Returns a fully configured `PersonaBuildPlugin` for the ledger persona suite. The returned plugin object implements:

| Hook / field | Behaviour |
|---|---|
| `name` | `'ledger'` |
| `onBuildContext` | Injects `roster_rendered` and `mcp_tools_table` into the template context |
| `onPostRender` | Caches the rendered output per-persona for use by `onValidate` |
| `onValidate` | Runs role validation and the `note_only` guard; returns `ValidationResult[]` |
| `frontmatterTemplates` | Registers `FRONTMATTER_LEDGER_VSCODE` (`vscode`) and `FRONTMATTER_LEDGER_CC` (`claude-code`) |

#### Context variables injected by `onBuildContext`

| Variable | Type | Value when absent |
|---|---|---|
| `roster_rendered` | `string` | `''` (empty — persona has no `roster` or `number` field) |
| `mcp_tools_table` | `string` | `''` (empty — persona has no `mcp_tools` field) |

Both keys are **always** set (even to an empty string) so templates can reference `{{roster_rendered}}` and `{{mcp_tools_table}}` on non-ledger personas without triggering an unresolved-variable warning.

#### Usage

```js
// personas/persona-build.config.js
const { ledgerPlugin } = require('@mistralys/persona-builder/plugins/ledger');
const manifest = require('../shared/workflow-manifest.json');

module.exports = {
  rootDir: __dirname,
  sharedPartialsDir: './shared/partials',
  suites: {
    ledger: {
      srcDir: './ledger/src',
      outVscode: './ledger/vs-code',
      outClaudeCode: './ledger/claude-code',
      personaMode: 'numbered',
    },
  },
  plugins: [
    ledgerPlugin({
      manifestRoles: manifest.roles.map(r => r.name),
      warnOnUnknownRole: true,
    }),
  ],
};
```

---

### `LedgerPluginOptions`

```ts
interface LedgerPluginOptions {
  /**
   * List of canonical role names from the project's workflow manifest.
   * Every persona's `role` field is validated against this list.
   * When omitted or empty, role validation is skipped.
   */
  manifestRoles?: ReadonlyArray<string>;

  /**
   * When `true`, an unknown `role` emits a warning-level ValidationResult.
   * @default true
   */
  warnOnUnknownRole?: boolean;
}
```

> **Known limitation — `warnOnUnknownRole` is not yet wired.** The option is accepted and preserved in the public interface, but the underlying `validateRole` always emits a warning when a role is not in the manifest, regardless of this flag. Setting `warnOnUnknownRole: false` currently has no observable effect. This will be resolved before the 1.0 release. In the meantime, role warnings cannot be suppressed via this option.

---

### Exported types

#### `RosterEntry`

```ts
interface RosterEntry {
  /** Sequential agent number (1-based) */
  number: number;
  /** Full display title for this agent role */
  title: string;
  /** Short description / label shown in parentheses */
  short: string;
}
```

Represents one entry in the ledger agent roster as declared in `_shared.yaml`.

#### `McpToolEntry`

```ts
interface McpToolEntry {
  /** Tool identifier as used in the MCP server */
  tool: string;
  /** Human-readable description of what the tool does */
  purpose: string;
  /**
   * When true, this entry appears in documentation notes only and must NOT
   * appear in the rendered persona output.
   */
  note_only?: boolean;
}
```

Represents one MCP tool entry from the persona YAML `mcp_tools` field.

---

### Exported renderer functions

#### `renderRoster(roster, activeNumber)`

```ts
function renderRoster(roster: RosterEntry[], activeNumber: number): string
```

Renders the agent roster as a numbered Markdown list. Each entry is formatted as `{number}. **{title}[ (YOU)]** ({short})`. The `(YOU)` suffix is appended to the entry whose `number` matches `activeNumber`.

```ts
renderRoster([
  { number: 1, title: 'Planner', short: 'plans the work' },
  { number: 2, title: 'Developer', short: 'writes code' },
], 1)
// => "1. **Planner (YOU)** (plans the work)\n2. **Developer** (writes code)"
```

#### `renderMcpToolsTable(tools)`

```ts
function renderMcpToolsTable(tools: McpToolEntry[]): string
```

Renders the MCP tools array as Markdown table rows (`| \`tool\` | purpose |`). Entries with `note_only: true` are filtered out and will not appear in the output.

```ts
renderMcpToolsTable([
  { tool: 'ledger_get_status', purpose: 'Read project status' },
  { tool: 'internal_tool',    purpose: 'Internal use only', note_only: true },
])
// => "| `ledger_get_status` | Read project status |"
```

---

### Exported validator functions

#### `validateRole(role, manifestRoles)`

```ts
function validateRole(
  role: string | undefined,
  manifestRoles: ReadonlyArray<string> | ReadonlySet<string>,
): ValidationResult[]
```

Checks that a persona's `role` field is present in the workflow manifest. Returns an empty array when the role is valid or absent (non-ledger personas have no `role` field), and a single `warning`-level result when the role is not found.

```ts
validateRole('Developer', ['Planner', 'Developer', 'QA'])
// => []

validateRole('Coder', ['Planner', 'Developer', 'QA'])
// => [{ severity: 'warning', message: 'Role "Coder" is not in the workflow manifest. Known roles: ...' }]

validateRole(undefined, ['Planner', 'Developer'])
// => []  — role absent, not a ledger persona
```

> `manifestRoles` is normalised to a `Set` internally, so both `Array` and `Set` inputs are accepted with O(1) lookup behaviour.

#### `validateNoteOnlyGuard(output, mcpTools)`

```ts
function validateNoteOnlyGuard(
  output: string,
  mcpTools: ReadonlyArray<McpToolEntry> | undefined,
): ValidationResult[]
```

Second-line defence against `note_only: true` tools leaking into published persona output. Even if `renderMcpToolsTable` is bypassed, this guard detects any note-only tool name appearing as a Markdown table cell (`| \`toolName\` |`) in the rendered string and returns one `error`-level result per violation.

```ts
validateNoteOnlyGuard('| `internal_tool` | does stuff |', [
  { tool: 'internal_tool', purpose: 'Internal', note_only: true },
])
// => [{ severity: 'error', message: 'note_only tool "internal_tool" appears in rendered output.' }]
```

> The `onValidate` hook supplies both arguments via its closure over the plugin's `renderedOutputCache`. Tool names containing regex special characters (`.`, `+`, `*`, etc.) are correctly escaped before pattern matching.

---

### Exported frontmatter constants

#### `FRONTMATTER_LEDGER_VSCODE`

```ts
const FRONTMATTER_LEDGER_VSCODE: string
```

VS Code frontmatter template for the ledger persona suite. Resolved template variables: `{{id}}`, `{{number}}`, `{{role}}`, `{{version}}`, `{{total}}`, `{{model}}`, `{{author}}`, `{{last_updated}}`, `{{vs_file_name}}`, `{{tools_json}}`.

#### `FRONTMATTER_LEDGER_CC`

```ts
const FRONTMATTER_LEDGER_CC: string
```

Claude Code frontmatter template for the ledger persona suite. Resolved template variables: `{{cc_name}}`, `{{cc_description}}`, `{{role}}`, `{{author}}`, `{{version}}`, `{{last_updated}}`, `{{cc_tools_json}}`, `{{cc_permission_mode}}`, `{{cc_model}}`, `{{cc_memory}}`, `{{mcp_server_name}}`. The `mcpServers` block is conditionally included via `{{#if has_mcp}}`.

Both templates are structurally identical to the originals in `build-personas.js` and are registered automatically by `ledgerPlugin()` via the `frontmatterTemplates` map, overriding the library's built-in defaults for the ledger suite.
