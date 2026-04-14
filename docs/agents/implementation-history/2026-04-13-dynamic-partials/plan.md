# Plan

## Summary

Add two complementary features to `@mistralys/persona-builder`: **dynamic partials** (programmatically provided template fragments) and **custom variables** (host-application-injected template variables). Both features integrate into the existing layered architecture through config-level convenience fields and new plugin hooks, keeping the zero-dependency engine layer untouched.

## Architectural Context

The library uses a layered architecture:

- **Engine layer** (`src/engine/`) — Pure functions with zero imports. `resolvePartials()` takes a `Record<string, string>` partials map and performs `{{> name}}` substitution. `resolveVariables()` substitutes `{{varName}}` tokens from a context object.
- **Loaders layer** (`src/loaders/`) — File I/O. `loadPartials()` reads `.md` files from disk into a `Record<string, string>` keyed by filename stem.
- **Builders layer** (`src/builders/`) — Build orchestration. `buildSuite()` loads partials (shared → suite-local), fires `onSuiteInit`, then iterates personas. `buildPersona()` builds the merged context, runs plugin hooks, then renders.
- **Plugin system** (`src/plugins/`) — Synchronous hooks: `onSuiteInit`, `onBuildContext`, `onPostRender`, `onValidate`. The runner invokes plugins in registration order with accumulating or collecting semantics.

**Key files:**

- [src/plugins/types.ts](src/plugins/types.ts) — `PersonaBuildPlugin`, `SuiteConfig`, `PersonaMetadata`
- [src/plugins/runner.ts](src/plugins/runner.ts) — Hook runner functions
- [src/builders/types.ts](src/builders/types.ts) — `BuildConfig`, `BuildResult`, `BuildSummary`
- [src/builders/persona-builder.ts](src/builders/persona-builder.ts) — `build()`, `buildSuite()`, `buildPersona()`, `buildContext()`

**Context merge order (current):**
1. `_shared.yaml` → 2. Per-persona YAML → 3. Derived fields → 4. Agent name map → 5. Plugin `onBuildContext`

**Partials merge order (current):**
1. Shared partials dir (file-based) → 2. Suite-local partials dir (file-based, overrides shared)

## Approach / Architecture

### Custom Variables

Add a `variables` field to both `BuildConfig` (global) and `SuiteConfig` (per-suite). These are injected into the context merge chain as base layers that can be overridden by YAML metadata, derived fields, and plugin hooks.

**New context merge order:**

```
0. BuildConfig.variables           ← NEW (global programmatic base)
   ↓ overridden by
0.5 SuiteConfig.variables         ← NEW (per-suite programmatic base)
   ↓ overridden by
1. _shared.yaml                    (suite-level YAML defaults)
   ↓ overridden by
2. Per-persona YAML                (persona-specific values)
   ↓ augmented by
3. Derived fields                  (version, tools_list, etc.)
   ↓ augmented by
4. Agent name map                  (agent_* keys, only when not present)
   ↓ augmented by
5. Plugin onBuildContext           (dynamic per-persona logic)
```

This gives consumers three progressive levels of complexity:
1. **Static global** → `BuildConfig.variables` (zero code, one config key)
2. **Static per-suite** → `SuiteConfig.variables` (overrides global defaults)
3. **Dynamic per-persona** → existing `onBuildContext` plugin hook

### Dynamic Partials

Add programmatic partials through two mechanisms:

1. **Config-level:** `BuildConfig.partials: Record<string, string>` — static string partials injected into every suite's partials map at the lowest priority (overridden by file-based partials and plugin hooks).

2. **Suite-level plugin hook:** `onPartials` — fires once per suite in `buildSuite()` after file-based partials are loaded. Accumulating semantics (each plugin receives the prior plugin's output). Allows dynamic generation of partials from databases, code enums, etc.

3. **Persona-level plugin hook:** `onPersonaPartials` — fires once per persona in `buildPersona()` after `onBuildContext` but before rendering. Receives the full context, allowing persona-specific partial content.

**New partials merge order:**

```
0. BuildConfig.partials            ← NEW (programmatic base, lowest priority)
   ↓ overridden by
1. Shared partials dir             (file-based, cross-suite)
   ↓ overridden by
2. Suite-local partials dir        (file-based, per-suite)
   ↓ overridden by
3. Plugin onPartials hooks         ← NEW (dynamic per-suite, accumulating)
   ↓ overridden per-persona by
4. Plugin onPersonaPartials hooks  ← NEW (dynamic per-persona, accumulating)
```

### Engine Layer Impact

**None.** The engine functions (`resolvePartials`, `resolveVariables`) remain unchanged. They already accept `Record<string, string>` and `Record<string, unknown>` respectively. All new logic lives in the builders and plugin layers.

## Rationale

- **Config-level fields** (`variables`, `partials`) provide a zero-plugin solution for simple use cases (API URLs, static lists). This avoids forcing consumers to write a `PersonaBuildPlugin` for trivial injection.
- **Plugin hooks** (`onPartials`, `onPersonaPartials`) provide full flexibility for dynamic content generation while following established patterns (`onBuildContext` accumulating semantics, runner invocation order).
- **Variables injected as base layers** ensures YAML always wins (persona authors retain full override control), which is consistent with how agent name map injection works.
- **Keeping hooks synchronous** is consistent with the existing plugin runner design. Consumers who need async data (database queries) should fetch it before calling `build()` and capture the results in closures.
- **Per-persona partials hook** enables use cases like generating persona-specific reference lists while keeping the suite-level hook simple.

## Detailed Steps

### 1. Add `variables` to `BuildConfig` and `SuiteConfig`

In [src/builders/types.ts](src/builders/types.ts), add to `BuildConfig`:
```ts
variables?: Record<string, unknown>;
```

In [src/plugins/types.ts](src/plugins/types.ts), add to `SuiteConfig`:
```ts
variables?: Record<string, unknown>;
```

### 2. Add `partials` to `BuildConfig`

In [src/builders/types.ts](src/builders/types.ts), add to `BuildConfig`:
```ts
partials?: Record<string, string>;
```

### 3. Add `onPartials` and `onPersonaPartials` hooks to `PersonaBuildPlugin`

In [src/plugins/types.ts](src/plugins/types.ts), add to the `PersonaBuildPlugin` interface:

```ts
onPartials?(
  partialsMap: Record<string, string>,
  suiteName: string,
  suite: SuiteConfig,
): Record<string, string>;

onPersonaPartials?(
  partialsMap: Record<string, string>,
  persona: PersonaMetadata,
  context: Record<string, unknown>,
  suite: SuiteConfig,
  target?: TargetType,
): Record<string, string>;
```

### 4. Add runner functions for the new hooks

In [src/plugins/runner.ts](src/plugins/runner.ts), add:

- `runPartials(plugins, partialsMap, suiteName, suite)` — accumulating, returns augmented `Record<string, string>`
- `runPersonaPartials(plugins, partialsMap, persona, context, suite, target)` — accumulating, returns augmented `Record<string, string>`

Follow the same pattern as `runBuildContext` (accumulating semantics, skip plugins without the hook).

### 5. Wire `BuildConfig.partials` into `buildSuite()`

In [src/builders/persona-builder.ts](src/builders/persona-builder.ts), in `buildSuite()` step 2 (partials loading), inject `config.partials` as the lowest-priority base layer:

```ts
// Current:
let partialsMap: Record<string, string> = {};

// New:
let partialsMap: Record<string, string> = { ...(config.partials ?? {}) };
```

Then, after the existing partials loading (step 2) and after `onSuiteInit` (step 3), run the new `onPartials` hook:

```
Current step 3: Plugin onSuiteInit
New step 3.5:   Plugin onPartials
```

### 6. Wire `onPersonaPartials` into `buildPersona()`

In [src/builders/persona-builder.ts](src/builders/persona-builder.ts), in `buildPersona()`, add a step between `onBuildContext` (step 3) and frontmatter rendering (step 4):

```
Current step 3: Plugin onBuildContext
New step 3.5:   Plugin onPersonaPartials (receives partialsMap + context, returns augmented partialsMap)
Current step 4: Render frontmatter
```

This requires `buildPersona()` to accept a mutable partials map (it already does — `partialsMap` is a parameter). The per-persona augmented map is used only for that persona's rendering; the original suite-level map is unaffected.

### 7. Wire `BuildConfig.variables` and `SuiteConfig.variables` into `buildContext()`

In [src/builders/persona-builder.ts](src/builders/persona-builder.ts), modify `buildContext()` to accept the new parameters and inject them as the lowest-priority base layers:

```ts
function buildContext(
  personaMeta: Record<string, unknown>,
  sharedMeta: Record<string, unknown>,
  agentMap?: Record<string, string>,
  target?: TargetType,
  registry?: TargetRegistry,
  configVariables?: Record<string, unknown>,  // ← NEW
  suiteVariables?: Record<string, unknown>,   // ← NEW
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(configVariables ?? {}),    // ← lowest priority
    ...(suiteVariables ?? {}),     // ← overrides config
    ...sharedMeta,                 // existing
    ...personaMeta,                // existing
    version,                       // existing
  };
  // ... rest unchanged
}
```

Update call sites in `buildPersona()` and `buildSuite()` to pass `config.variables` and `suiteConfig.variables`.

### 8. Update `buildPersona()` pipeline order

The updated pipeline in `buildPersona()` becomes:

```
1.  Load persona YAML
2.  Build context (with config + suite variables)
3.  Plugin onBuildContext
3.5 Plugin onPersonaPartials → persona-local partialsMap  ← NEW
4.  Render frontmatter
5.  Load content template
6.  Render body (partials → conditionals → variables)
7.  Assemble output
8.  Plugin onPostRender
9.  Plugin onValidate
10. Determine output path
11. Write file
12. Return BuildResult
```

### 9. Export new runner functions from barrel

In [src/plugins/index.ts](src/plugins/index.ts), re-export `runPartials` and `runPersonaPartials`.

### 10. Write unit tests for new runner functions

In [tests/plugins/plugin-runner.test.ts](tests/plugins/plugin-runner.test.ts), add test blocks for `runPartials` and `runPersonaPartials` following the existing pattern (0, 1, 3 plugins; skip when hook absent; accumulation correctness).

### 11. Write unit tests for config-level variables and partials

In [tests/builders/](tests/builders/), add or extend tests to verify:
- `BuildConfig.variables` are injected into context at lowest priority
- `SuiteConfig.variables` override `BuildConfig.variables`
- YAML values override both config-level variables
- `BuildConfig.partials` are available in templates
- File-based partials override `BuildConfig.partials` with the same name

### 12. Write integration tests for the full pipeline

In [tests/integration/](tests/integration/), add test cases that exercise:
- A build with `BuildConfig.variables` and verify the variable appears in rendered output
- A build with `BuildConfig.partials` and verify the partial content appears in rendered output
- A build with an `onPartials` plugin and verify dynamic partials are resolved
- A build with an `onPersonaPartials` plugin and verify per-persona partials differ between personas

### 13. Update manifest documentation

- [docs/agents/project-manifest/api-surface.md](docs/agents/project-manifest/api-surface.md) — Add `variables` and `partials` to `BuildConfig`, `variables` to `SuiteConfig`, `onPartials` and `onPersonaPartials` to `PersonaBuildPlugin`, new runner function signatures.
- [docs/agents/project-manifest/data-flows.md](docs/agents/project-manifest/data-flows.md) — Update context merge order diagram (add steps 0 and 0.5), update partials merge order, update `buildSuite()` and `buildPersona()` pipeline steps, add new hook to plugin hook execution order section.
- [docs/agents/project-manifest/constraints.md](docs/agents/project-manifest/constraints.md) — Update test suite table with new test counts.

### 14. Update user-facing documentation

- [README.md](README.md) — Add brief mention of custom variables and dynamic partials (link to detailed docs).
- Consider adding a new `docs/dynamic-partials.md` guide with usage examples.

## Dependencies

- No new npm dependencies required.
- No changes to the engine layer.
- No async refactoring of the plugin runner.

## Required Components

- [src/plugins/types.ts](src/plugins/types.ts) — Type additions (`SuiteConfig.variables`, `PersonaBuildPlugin.onPartials`, `PersonaBuildPlugin.onPersonaPartials`)
- [src/plugins/runner.ts](src/plugins/runner.ts) — New runner functions (`runPartials`, `runPersonaPartials`)
- [src/plugins/index.ts](src/plugins/index.ts) — Barrel re-exports
- [src/builders/types.ts](src/builders/types.ts) — Type additions (`BuildConfig.variables`, `BuildConfig.partials`)
- [src/builders/persona-builder.ts](src/builders/persona-builder.ts) — Wiring config variables/partials and calling new hooks
- [tests/plugins/plugin-runner.test.ts](tests/plugins/plugin-runner.test.ts) — Runner tests
- [tests/builders/](tests/builders/) — Builder tests
- [tests/integration/](tests/integration/) — Integration tests
- [docs/agents/project-manifest/api-surface.md](docs/agents/project-manifest/api-surface.md) — API surface updates
- [docs/agents/project-manifest/data-flows.md](docs/agents/project-manifest/data-flows.md) — Data flow updates
- [docs/agents/project-manifest/constraints.md](docs/agents/project-manifest/constraints.md) — Test count updates

## Assumptions

- The feature is for build-time injection only; no runtime / HTTP exposure is planned.
- Consumers who need async data sources will pre-fetch data before calling `build()` and capture results via closures in plugin hooks.
- The `onPersonaPartials` hook receives the full context (post-`onBuildContext`) so plugins can inspect persona metadata when generating persona-specific partials.

## Constraints

- Engine layer zero-dependency invariant must be preserved — no changes to `src/engine/`.
- Plugin runner remains fully synchronous.
- Existing test suite must continue to pass without modification.
- `BuildConfig.variables` / `SuiteConfig.variables` use "spread as base layer" semantics (higher-priority layers override), not "only set when not present" semantics. This differs from agent name map injection but is more intuitive for the use case.
- `BuildConfig.partials` entries are overridden by file-based partials with the same stem name.

## Out of Scope

- Async plugin hooks (deferred to future refactoring).
- Function-valued partials (e.g., `Record<string, string | (() => string)>`) — the string-based config plus plugin hooks covers all stated use cases.
- Per-suite `SuiteConfig.partials` — the `onPartials` plugin hook already provides per-suite flexibility through its `suiteName` parameter.
- CLI flags for variables or partials — the config file and programmatic API are the intended surface.
- Changes to the `ai-insights` workspace consumer (`persona-build.config.js`) — that is a separate follow-up.

## Acceptance Criteria

- `BuildConfig.variables` values are available as `{{varName}}` in templates.
- `SuiteConfig.variables` values override `BuildConfig.variables` for that suite.
- Persona YAML values override both config-level variable levels.
- `BuildConfig.partials` entries are resolvable as `{{> partialName}}` in templates.
- File-based partials with the same stem name override `BuildConfig.partials`.
- An `onPartials` plugin can inject a partial that is resolvable in templates.
- An `onPartials` plugin can override a file-based partial.
- An `onPersonaPartials` plugin can inject persona-specific partials.
- An `onPersonaPartials` plugin can override suite-level partials for a single persona.
- Persona-level partial overrides do not leak to other personas in the same suite.
- All existing 236 tests continue to pass unchanged.
- New test coverage for all acceptance criteria above.

## Testing Strategy

1. **Unit tests for runner functions** — Verify `runPartials` and `runPersonaPartials` handle 0/1/N plugins, skip missing hooks, and accumulate correctly. Follow the existing pattern in [tests/plugins/plugin-runner.test.ts](tests/plugins/plugin-runner.test.ts).

2. **Unit tests for `buildContext()`** — Verify the variable merge order: `config.variables` < `suiteConfig.variables` < `sharedMeta` < `personaMeta`. Test that explicit YAML values are not overwritten.

3. **Unit tests for partials merge** — Verify `config.partials` appears in the partials map, is overridden by file-based partials, and is further overridden by `onPartials` hook output.

4. **Integration tests** — Full `build()` calls against `fixtures/sample-suite/` with injected variables and partials. Verify rendered output contains expected values.

5. **Isolation test for `onPersonaPartials`** — Build two personas in the same suite with a plugin that injects different partials per persona. Verify outputs differ and neither persona leaks the other's partials.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Breaking `buildContext()` signature** (internal function, but called from multiple places) | `configVariables` and `suiteVariables` are optional parameters with `undefined` defaults. All existing call sites continue to work without changes until updated. |
| **Partials map mutation leaking across personas** | `onPersonaPartials` operates on a shallow copy of the suite-level partials map. Each persona gets its own copy. Add an explicit test to verify isolation. |
| **Plugin hook ordering confusion** (5 hooks now instead of 4) | Update the JSDoc hook invocation order comment in `PersonaBuildPlugin` and the data-flows.md documentation. The order is: `onSuiteInit` → `onPartials` → `onBuildContext` → `onPersonaPartials` → `onPostRender` → `onValidate`. |
| **Consumers passing non-serializable values in `variables`** | `resolveVariables()` already calls `String()` on context values. Non-string values will be coerced to their string representation, which is the existing behavior for all context values. |
