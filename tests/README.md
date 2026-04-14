# Test Suite Structure

All tests are discovered by Vitest using the pattern `tests/**/*.test.{js,ts}` (see `vitest.config.ts`).

## Directory Layout

```
tests/
├── helpers/          # Shared test utilities (not Vitest test files)
│   └── suite-fixture.ts  – createMinimalSuite() factory for builder tests
│
├── engine/           # Unit tests for the template engine
│   ├── conditionals.test.ts   – {{#if}} / {{else}} / {{/if}} resolution
│   ├── partials.test.ts       – {{> partialName}} inclusion
│   ├── postProcessor.test.ts  – collapseBlankLines, ensureBlankLineBeforeHeadings, normalizeNewlines
│   ├── serializers.test.ts    – serializeTools, serializeToolsList
│   └── variables.test.ts      – {{variableName}} substitution and edge cases
│
├── builders/         # Unit tests for the build orchestration layer
│   ├── persona-builder.test.ts                    – Core suite × target build loop, check mode, strict mode
│   ├── persona-builder-edge-cases.test.ts         – Edge cases: missing fields, empty suites, etc.
│   ├── agent-name-map.test.ts                     – Cross-suite agent_<slug> variable injection
│   ├── build-config-variables-and-partials.test.ts – BuildConfig.variables and BuildConfig.partials merge/override chain (AC-1–AC-6)
│   ├── config-partials-and-on-partials.test.ts    – BuildConfig.partials and onPartials hook wiring
│   ├── config-suite-variables.test.ts             – SuiteConfig.variables override wiring
│   ├── da-computed-fields.test.ts                 – Deep Agents computed field derivation
│   ├── on-persona-partials.test.ts                – onPersonaPartials hook isolation and chaining
│   └── target-variable-injection.test.ts          – Target-flag variable injection (target_vscode, etc.)
│
├── loaders/          # Unit tests for file-system loaders
│   ├── content-loader.test.ts   – Markdown content template discovery
│   ├── metadata-loader.test.ts  – _shared.yaml + per-persona YAML merge
│   └── partials-loader.test.ts  – Two-layer partials loading (shared → suite-local)
│
├── plugins/          # Unit tests for the plugin runner
│   └── plugin-runner.test.ts  – Hook execution order, context propagation, partials accumulation (runPartials, runPersonaPartials)
│
├── targets/          # Unit tests for the target registry
│   └── target-registry.test.ts  – TargetRegistry registration, lookup, and defaultRegistry built-ins
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
| A new target or the target registry | `tests/targets/` |
| A new built-in validator | `tests/validators/` |
| A cross-cutting scenario using `build()` end-to-end | `tests/integration/` |

Integration tests may need fixture data — add it to `fixtures/sample-suite/` or a new subdirectory under `fixtures/`. Keep fixture YAML minimal: only the fields the test actually exercises.

## Shared Test Helpers

### `tests/helpers/suite-fixture.ts`

A shared helper used by all builder test files. Import it with:

```ts
import { createMinimalSuite } from '../helpers/suite-fixture.js';
```

`createMinimalSuite(baseDir, opts?)` creates an ephemeral temp directory with the standard
`meta/`, `content/`, `partials/`, and `out/` sub-structure and returns a `SuiteFixture` object:

```ts
interface SuiteFixture {
  suiteDir: string;          // path to <baseDir>/suite/
  outDir: string;            // path to <baseDir>/out/
  yamlPath: string;          // path to the primary persona YAML
  suiteConfig: SuiteConfig;  // ready-to-use SuiteConfig for buildPersona() / buildSuite()
  sharedPartialsDir: string; // path to <baseDir>/shared-partials/
}
```

Accepts an optional `SuiteFixtureOptions` object:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `personaYaml` | `object` | `{ name: 'Test Agent', vs_file_name: 'agent.agent.md', cc_file_name: 'agent.md', description: '', tools: ['read'] }` | Additional/override fields merged into the persona YAML |
| `templateContent` | `string` | `'Hello {{name}}'` | Content template written to `content/agent.md` |
| `suitePartials` | `Record<string, string>` | `{}` | Suite-local partial files written to `partials/` |
| `sharedPartials` | `Record<string, string>` | `{}` | Shared partial files written to `<baseDir>/shared-partials/` |

Tests that need two-persona setups can call `createMinimalSuite()` for the first persona and
manually add a second YAML + content file to `suiteDir/meta/` and `suiteDir/content/`. See
`tests/builders/on-persona-partials.test.ts` for a pattern using a thin local
`createTwoPersonaSuite()` wrapper.

---

## Builder Test Authoring Patterns
- Always include `description: ''` in the minimal persona YAML to avoid `[WARN] Unresolved variable: {{description}}` noise from the VS Code frontmatter template.
- Use `beforeEach` / `afterEach` (not `beforeAll` / `afterAll`) to create and clean up temp directories so tests remain isolated even when run in parallel.
- Each `describe` block should map to exactly one acceptance criterion.

## Running Tests

```bash
npm test           # run all tests once
npm run test:watch # watch mode
```
