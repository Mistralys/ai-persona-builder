# CLI Reference

```
persona-build [options]
```

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to the build config file. Supports `.js` (ESM), `.cjs`, and `.json` formats. Default: `persona-build.config.js` in the current directory. |
| `--check` | Render personas but skip writing output files. Always exits `0` unless `--strict` is also set. Combine with `--strict` to exit `1` when any validation result has severity `'error'` or `'warning'`. |
| `--strict` | Exit `1` if any validation result has severity `'error'` or `'warning'`. |
| `--help` | Show usage and exit `0`. |
| `--version` | Print the package version and exit `0`. |

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
      outVscode: path.join(__dirname, 'dist/vscode'),
      outClaudeCode: path.join(__dirname, 'dist/claude-code'),
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

# CI check — render without writing, always exits 0 (surface output for review)
persona-build --check

# CI strict check — render without writing, exit 1 on any error or warning
persona-build --check --strict
```
