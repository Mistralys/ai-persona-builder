# Constraints & Conventions

## Architectural Invariants

### 1. Zero-Dependency Engine Layer — MUST preserve

All five engine modules (`partials.ts`, `conditionals.ts`, `variables.ts`, `postProcessor.ts`, `serializer.ts`) have **zero imports** — no Node built-ins, no external packages, no internal cross-module references. This makes the engine fully portable to browser environments or non-Node runtimes.

> Any new function added to `src/engine/` **must** maintain this zero-dependency invariant. If a function requires `node:fs`, `node:path`, or any npm package, it belongs in `src/loaders/` or `src/builders/`, not `src/engine/`.

### 2. Synchronous Plugin Runner — plan for async before adding remote plugins

The plugin runner (`src/plugins/runner.ts`) is fully synchronous. All four hook functions (`runSuiteInit`, `runBuildContext`, `runPostRender`, `runValidate`) are synchronous. This is correct for the current use case (local file-based builds).

> Before integrating any plugin that performs network I/O or heavy async work (e.g., schema-fetching, API calls), the runner must be refactored to `async` + sequential `await`. Design new plugin hooks with async compatibility in mind.

### 3. Strict + Check Mode Interaction

When `strict: true` is used **without** `check: true`, `build()` writes all output files to disk before evaluating validation failures — leaving partial artefacts on failure. CI pipelines calling `build()` in validation mode **must** combine `strict: true` with `check: true` to avoid partial writes.

### 4. Signatures Only — No Implementation in API Surface

The `api-surface.md` manifest document contains only public constructors, properties, and method signatures. Never include method bodies, internal logic, or private members.

---

## Naming Conventions

### Filenames

All source and output filenames must follow **kebab-case**: lowercase letters, digits, and hyphens only. The `validateFileName()` function enforces this with three rules:

1. No uppercase letters
2. No spaces
3. All dot-separated segments must be valid kebab tokens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

Valid examples: `my-persona.md`, `1-developer.agent.md`
Invalid examples: `My_Persona.md`, `--bad.md`, `foo..bar.md`

### Module Structure

- Each layer directory contains an `index.ts` barrel that re-exports all public symbols.
- The top-level `src/index.ts` re-exports from all layer barrels (`export *`).
- Type-only exports use `export type { … }` syntax.
- **Named re-export for utility barrels:** `src/utils/index.ts` uses explicit named re-exports (`export { escapeRegExp } from './regex.js'`) rather than `export *`. This prevents accidental public-surface leakage if internal helpers are later added to utility files. All future utility barrels must follow this pattern.
- **Utility module structure:** The `src/utils/` directory follows a one-file-per-domain pattern (e.g. `regex.ts` for regex utilities). Each file contains focused, pure functions. New utilities should create a new domain file rather than appending to an existing one, and the barrel (`index.ts`) must be updated with an explicit named re-export.

### YAML Metadata

- Shared suite defaults live in `meta/_shared.yaml` (underscore prefix = excluded from persona discovery).
- Per-persona YAML files are named to match their content file stem: `persona-name.yaml` ↔ `content/persona-name.md`.

---

## Template Syntax

| Syntax | Purpose | Processor |
|--------|---------|-----------|
| `{{> partialName}}` | Partial inclusion | `resolvePartials()` — depth-2 recursion |
| `{{#if flag}}…{{/if}}` | Conditional block | `resolveConditionals()` |
| `{{#if flag}}…{{else}}…{{/if}}` | Conditional with fallback | `resolveConditionals()` |
| `{{variableName}}` | Variable substitution | `resolveVariables()` |

**Processing order matters:** partials → conditionals → variables. Running them out of order will produce incorrect output.

---

## package.json Path Conventions

When modifying paths in `package.json`, strictly adhere to these prefix rules to satisfy both npm and Node.js module resolution:

1. **`bin` paths MUST NOT start with `./`** (e.g., `"dist/cli.js"`). npm's strict normalizer treats `bin` as OS file paths and will strip `./` automatically, generating a confusing warning during `npm pack` or `npm publish` if it is present.
2. **`exports`, `main`, `module`, and `types` paths MUST start with `./`** (e.g., `"./dist/index.js"`). Node.js requires this exact format for local module resolution; omitting it will cause an `ERR_INVALID_PACKAGE_TARGET` error at runtime.

---

## Known Limitations

### 1. `serializeTools` Single-Quote Escaping

`serializeTools()` does not escape single quotes inside tool names (e.g., `Tool's` → `['Tool's']` which is invalid YAML). Acceptable for alphanumeric tool names. Add escaping before any consumer registers tool names with apostrophes.

### 2. `cc_model` / `cc_permission_mode` / `cc_memory` Not Auto-Derived

The default Claude Code frontmatter template references these three context variables, but they are not computed by `buildContext()`. They must come from `_shared.yaml` or a plugin's `onBuildContext` hook. Missing values produce `[WARN] Unresolved variable` in stderr but do not fail the build unless `strict: true`.

### 3. Node.js Version Floor

`readdir` with `{ recursive: true }` (used in `discoverPersonaYamls`) requires Node ≥ 18.17. The `package.json` currently states `>=18.0.0`, which creates a confusing `TypeError` window for consumers on Node 18.0–18.16. Bump `engines.node` to `>=18.17.0` before 1.0.

### 4. Path Traversal Trust Boundary

The loaders (`loadPartials`, `discoverPersonaYamls`, `loadContent`) pass caller-supplied paths directly to `fs/promises` APIs. This is acceptable for a build-time library with developer-controlled paths. If any future layer exposes these functions to CLI arguments, plugin-provided paths, or HTTP input, a `path.resolve(input).startsWith(allowedRoot)` containment guard must be added before that exposure.

---

## Directory Convention

Each suite's `srcDir` must contain three sub-directories (configurable via `SuiteConfig`):

| Default Name | Purpose | Config Override |
|-------------|---------|-----------------|
| `meta/` | YAML metadata files (`_shared.yaml` + per-persona) | `metaSubdir` |
| `content/` | Markdown content templates | `contentSubdir` |
| `partials/` | Suite-local reusable content fragments | `partialsSubdir` |

Shared partials (cross-suite) are loaded from `BuildConfig.sharedPartialsDir`. Suite-local partials override shared partials with the same stem name.

---

## Test Suite

| Directory | Scope | Test Count |
|-----------|-------|------------|
| `tests/engine/` | Pure engine functions | 74 |
| `tests/loaders/` | File I/O loaders | 40 |
| `tests/plugins/` | Plugin runner (27) + ledger (48) | 75 |
| `tests/builders/` | Build orchestration (25) + edge-cases (8) | 33 |
| `tests/validators/` | Validation functions | 46 |
| `tests/integration/` | End-to-end builds against fixtures | 7 |
| **Total** | | **275** |

All tests use Vitest with `globals: true`. Integration tests operate against the `fixtures/` directory.
