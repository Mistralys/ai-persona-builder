# AI Persona Builder

Build AI persona instruction files for **VS Code Chat** and **Claude Code** from YAML metadata and Markdown templates — with zero configuration friction.

Define your personas once as simple YAML + Markdown sources, and the library generates correctly formatted instruction files for both IDEs. A plugin system lets you inject custom frontmatter, run validators, or post-process output without touching the core engine.

## ✨ Features

- **Dual-target output** — generates both `.agent.md` (VS Code) and `.md` (Claude Code) from a single source
- **YAML + Markdown templating** — separate metadata from content; merge them at build time with `{{variables}}`, `{{> partials}}`, and `{{#if}}` conditionals
- **Shared + per-suite partials** — reuse content fragments across personas with local overrides
- **Plugin architecture** — hook into context building, post-rendering, validation, and frontmatter generation
- **CI-friendly** — `--check` mode renders without writing; `--strict` exits non-zero on warnings
- **Programmatic & CLI** — use the `build()` API in scripts or run `persona-build` from the command line
- **Single dependency** — only `js-yaml` at runtime

## 📋 Requirements

- **Node.js** ≥ 18

## 🚀 Quick Start

```bash
npm install @mistralys/persona-builder
```

### Programmatic API

```ts
import { build } from '@mistralys/persona-builder';
import path from 'node:path';

const summary = await build({
  suites: {
    'my-suite': {
      srcDir: path.resolve('./personas/my-suite'),
      outVscode: path.resolve('./dist/vscode'),
      outClaudeCode: path.resolve('./dist/claude-code'),
    },
  },
  sharedPartialsDir: path.resolve('./personas/shared/partials'),
});

console.log(`Built ${summary.totalBuilt} persona(s), wrote ${summary.totalWritten} file(s).`);
```

### CLI

```bash
# Create a persona-build.config.js, then:
npx persona-build

# CI staleness check
npx persona-build --check --strict
```

See the [CLI docs](docs/cli.md) for config file format and all flags.

## 📖 Documentation

| Guide | Description |
|-------|-------------|
| [Directory Convention](docs/directory-convention.md) | Expected source layout (`meta/`, `content/`, `partials/`) |
| [Template Syntax](docs/template-syntax.md) | Variables, partials, conditionals, and built-in context variables |
| [Configuration Reference](docs/configuration.md) | `BuildConfig`, `SuiteConfig`, and `BuildSummary` fields |
| [CLI Reference](docs/cli.md) | Command-line flags, config file format, and common patterns |
| [Plugins](docs/plugins.md) | `PersonaBuildPlugin` interface, examples, and the built-in Ledger Plugin |
| [Public API](docs/api.md) | All exported types and functions |

## 🔌 Ledger Plugin

The ledger plugin is a first-party plugin shipped as a sub-path export. It adds ledger-specific rendering (roster table, MCP tools table) and role validation into the standard build hooks.

### Installation

The plugin ships with the library — no extra install needed.

```bash
npm install @mistralys/persona-builder
```

### Usage

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
    standalone: {
      srcDir: './standalone/src',
      outVscode: './standalone/vs-code',
      outClaudeCode: './standalone/claude-code',
      personaMode: 'standalone',
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

### Options — `LedgerPluginOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `manifestRoles` | `ReadonlyArray<string>` | `[]` | Canonical role names from your workflow manifest. Each persona's `role` field is validated against this list. When omitted or empty, role validation is skipped. |
| `warnOnUnknownRole` | `boolean` | `true` | When `true`, an unknown `role` field emits a warning-level validation result. |

See the [Plugins reference](docs/plugins.md#ledger-plugin----mistralys-persona-builderpluginsledger) for full hook documentation and exported types (`RosterEntry`, `McpToolEntry`).

---

## 📄 License

MIT
