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
| [Plugins](docs/plugins.md) | `PersonaBuildPlugin` interface and examples |
| [Public API](docs/api.md) | All exported types and functions |

## 📄 License

MIT
