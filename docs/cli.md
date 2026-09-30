# CLI Reference

```
persona-build [options]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to the build config file. Supports `.js` (ESM), `.cjs`, and `.json` formats. Default: `persona-build.config.js` in the current directory. |
| `--check` | Render personas but skip writing output files. Still exits `1` if any validation result has severity `'error'` — see **Build Success** below. Combine with `--strict` to also exit `1` on `'warning'`. |
| `--strict` | Additionally exit `1` if any validation result has severity `'warning'`. Error-severity results already fail the build with or without this flag. |
| `--help` | Show usage and exit `0`. |
| `--version` | Print the package version and exit `0`. |

## Build Success

An error-severity `ValidationResult` — from a plugin, a built-in validator (an unknown sub-agent,
an ungranted dispatch tool, a cross-target capability-parity mismatch), or an index-level issue
(e.g. an invalid `targets` field) — fails every build and exits `1`, whether or not `--strict` is
passed. This holds with `--check` too: a check-mode run that finds an error still exits `1`, even
without `--strict`. `--strict` additionally fails on warning-severity results (e.g. a tool name
spelled in another target's notation). The CLI prints every error and warning, grouped under
"Validation findings" (per suite/target/persona) and "Index issues" (pre-scan-level), followed by
the skipped-persona count and error/warning totals.

> This is a breaking change from the 2.x contract, where error-severity results were silently
> ignored unless `--strict` was passed. See `CHANGELOG.md`.

## Config File

Create a config file `persona-build.config.js` in your project root:

```js
// persona-build.config.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  suites: {
    'my-suite': {
      srcDir: path.join(__dirname, 'personas/my-suite'),
      outputDirs: {
        vscode: path.join(__dirname, 'dist/vscode'),
        'claude-code': path.join(__dirname, 'dist/claude-code'),
      },
    },
  },
  sharedPartialsDir: path.join(__dirname, 'personas/shared/partials'),
};
```

## Common Patterns

```bash
# Normal build (default config)
persona-build

# Custom config file
persona-build --config ./config/persona-build.cjs

# CI check — render without writing, exits 1 on any error (surface output for review)
persona-build --check

# CI strict check — render without writing, exit 1 on any error or warning
persona-build --check --strict
```
