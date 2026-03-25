# Test Suite Structure

All tests are discovered by Vitest using the pattern `tests/**/*.test.{js,ts}` (see `vitest.config.ts`).

## Directory Layout

```
tests/
├── engine/           # Unit tests for the template engine
│   ├── conditionals.test.ts   – {{#if}} / {{else}} / {{/if}} resolution
│   ├── partials.test.ts       – {{> partialName}} inclusion
│   ├── postProcessor.test.ts  – collapseBlankLines, ensureBlankLineBeforeHeadings, normalizeNewlines
│   ├── serializers.test.ts    – serializeTools, serializeToolsList
│   └── variables.test.ts      – {{variableName}} substitution and edge cases
│
├── builders/         # Unit tests for the build orchestration layer
│   ├── persona-builder.test.ts            – Core suite × target build loop
│   └── persona-builder-edge-cases.test.ts – Edge cases: missing fields, empty suites, etc.
│
├── loaders/          # Unit tests for file-system loaders
│   ├── content-loader.test.ts   – Markdown content template discovery
│   ├── metadata-loader.test.ts  – _shared.yaml + per-persona YAML merge
│   └── partials-loader.test.ts  – Two-layer partials loading (shared → suite-local)
│
├── plugins/          # Unit tests for the plugin runner
│   └── plugin-runner.test.ts  – Hook execution order, context propagation
│
├── validators/       # Unit tests for built-in validators
│   ├── filename-validator.test.ts  – vs_file_name / cc_file_name checks
│   └── strict-validator.test.ts    – Unresolved {{marker}} detection
│
└── integration/      # End-to-end tests against the fixtures/ directory
    └── build.test.ts  – Full build() pipeline: output files written, content matches, plugin hooks invoked
```

## Adding New Tests

| What you're testing | Where to add the file |
|---------------------|-----------------------|
| A new engine function | `tests/engine/` |
| A builder or frontmatter change | `tests/builders/` |
| A new loader | `tests/loaders/` |
| A plugin hook or the plugin runner | `tests/plugins/` |
| A new built-in validator | `tests/validators/` |
| A cross-cutting scenario using `build()` end-to-end | `tests/integration/` |

Integration tests may need fixture data — add it to `fixtures/sample-suite/` or a new subdirectory under `fixtures/`. Keep fixture YAML minimal: only the fields the test actually exercises.

## Running Tests

```bash
npm test           # run all tests once
npm run test:watch # watch mode
```
