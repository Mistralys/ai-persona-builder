# Plan

## Summary

Follow-up rework plan addressing six actionable items surfaced as strategic recommendations in the `2026-04-13-dynamic-partials` post-project synthesis. All items have been independently verified against the current codebase. The scope covers defensive hardening, internal code hygiene, test infrastructure, documentation consistency, and a forward-looking assessment of the partial nesting depth cap.

## Architectural Context

The Dynamic Partials feature delivered in the parent plan added two plugin hooks (`onPartials`, `onPersonaPartials`) and two new config fields (`BuildConfig.variables`, `BuildConfig.partials`, `SuiteConfig.variables`) to the persona-builder pipeline. The synthesis surfaced several follow-up concerns, all confirmed below:

- **Runner null-guard gap** — `src/plugins/runner.ts` contains four accumulating runner functions (`runBuildContext`, `runPostRender`, `runPartials`, `runPersonaPartials`). All four assign the raw plugin hook return value to the accumulator without a `?? accumulated` fallback. A misbehaving JS plugin returning `undefined` would crash the entire build.
- **JSDoc step numbering** — `src/builders/persona-builder.ts` uses fractional labels (`3a` in `buildSuite()`, `3b` in `buildPersona()`) instead of clean linear step numbers.
- **Test helper duplication** — Six builder test files each define their own suite-creation helper (`createMinimalSuite` in 3 files, `createSuite` in 3 files), all structurally similar.
- **Documentation layer-count drift** — Three user-facing docs (`getting-started.md`, `configuration.md`, `directory-convention.md`) still describe "four layers" of partials resolution; the actual count is five since `onPersonaPartials` was added. `dynamic-partials.md` says "four layers" in its heading but correctly documents all five. Only `constraints.md` is accurate.
- **`buildContext()` parameter sprawl** — The function now has 7 positional parameters. Internal-only, but increasingly unwieldy.
- **Depth-2 partial nesting cap** — `src/engine/partials.ts` hardcodes `depth >= 2`. Now that dynamic partial injection is a first-class feature, the cap warrants evaluation.

## Approach / Architecture

Six independent work packages, ordered by priority and risk:

1. **WP-001: Null-guard hardening** — Add `?? accumulated` fallback to all four accumulating runners. Low-risk, high-value.
2. **WP-002: JSDoc step renumbering** — Renumber `buildSuite()` and `buildPersona()` pipeline comments to a clean linear sequence.
3. **WP-003: Test helper extraction** — Create `tests/helpers/suite-fixture.ts` with a shared `createMinimalSuite()` helper; refactor all six builder test files to use it.
4. **WP-004: Documentation layer-count fix** — Update all docs that say "four layers" to say "five layers" and include `onPersonaPartials`. Cross-link to `docs/dynamic-partials.md` as the canonical reference.
5. **WP-005: `buildContext()` options object refactor** — Replace the 7 positional parameters with a single options object. Internal function only — no public API impact.
6. **WP-006: Depth-2 nesting cap evaluation** — Research, decide, and (if warranted) implement a configurable nesting depth. This is the only item that may result in a "no change" decision.

## Rationale

- **WP-001** is the highest-priority defensive fix. The TypeScript compiler prevents this bug for typed consumers, but JS callers and type-cast workarounds bypass it. A single misbehaving plugin would crash the entire build run.
- **WP-002** is trivial cosmetic debt but gets harder to clean up with each new step added. Best done now while the count is stable.
- **WP-003** reduces test maintenance surface. Six files with near-identical helpers is already friction; future builder tests will compound it.
- **WP-004** is user-facing documentation accuracy. Three docs are objectively wrong ("four layers" vs. five).
- **WP-005** prevents further positional-parameter sprawl as future hooks expand the context merge chain.
- **WP-006** is necessary due diligence now that `onPersonaPartials` makes dynamic partial injection a first-class programmatic feature.

## Detailed Steps

### WP-001: Null-Guard Hardening for Accumulating Runners

1. In `src/plugins/runner.ts`, add `?? accumulated` fallback to the assignment in `runBuildContext()` (line ~87):
   ```ts
   accumulated = plugin.onBuildContext(accumulated, persona, suite, target) ?? accumulated;
   ```
2. Apply the same pattern to `runPostRender()` (line ~115):
   ```ts
   output = plugin.onPostRender(output, persona, target) ?? output;
   ```
3. Apply to `runPartials()` (line ~158):
   ```ts
   accumulated = plugin.onPartials(accumulated, suiteName, suite) ?? accumulated;
   ```
4. Apply to `runPersonaPartials()` (line ~198):
   ```ts
   accumulated = plugin.onPersonaPartials(accumulated, persona, context, suite, target) ?? accumulated;
   ```
5. Add unit tests in `tests/plugins/plugin-runner.test.ts` verifying that a plugin returning `undefined` from each hook is safely handled (accumulator value preserved).
6. Run full test suite to confirm no regressions.

### WP-002: JSDoc Step Renumbering

1. In `src/builders/persona-builder.ts` — `buildSuite()`:
   - Current: steps 1, 2, 3, 3a, 4, 5
   - Target: steps 1, 2, 3, 4, 5, 6
   - Renumber `// ── 3. Plugin onSuiteInit` → `// ── 3.`
   - Renumber `// ── 3a. Plugin onPartials` → `// ── 4.`
   - Renumber `// ── 4. Discover persona YAML files` → `// ── 5.`
   - Renumber `// ── 5. Build each persona` → `// ── 6.`
2. In `src/builders/persona-builder.ts` — `buildPersona()`:
   - Current: steps 1, 2, 3, 3b, 4, 5, 6, 7, 8, 9, 10, 11, 12
   - Target: steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
   - Renumber `// ── 3b. Plugin onPersonaPartials` → `// ── 4.`
   - Renumber all subsequent steps (current 4→5, 5→6, …, 12→13)
3. Update the `buildPersona()` JSDoc header comment to list the new step numbers.
4. Run full test suite to confirm no behavioural changes.

### WP-003: Test Helper Extraction

1. Create `tests/helpers/suite-fixture.ts` exporting a `createMinimalSuite()` function that:
   - Accepts an options object for persona YAML content, template content, shared YAML content, partials, and output directory naming
   - Creates the necessary `meta/`, `content/`, and optionally `partials/` directories in a temp folder
   - Writes `_shared.yaml`, persona YAML, and content template files
   - Returns the suite directory path, output directory path, YAML path, and `SuiteConfig` object
2. Refactor the following files to use the shared helper:
   - `tests/builders/persona-builder.test.ts` — `createMinimalSuite()` (line 78)
   - `tests/builders/build-config-variables-and-partials.test.ts` — `createMinimalSuite()` (line 65)
   - `tests/builders/persona-builder-edge-cases.test.ts` — `createMinimalSuite()` (line 45)
   - `tests/builders/config-partials-and-on-partials.test.ts` — `createSuite()` (line 55)
   - `tests/builders/config-suite-variables.test.ts` — `createSuite()` (line 47)
   - `tests/builders/on-persona-partials.test.ts` — `createSuite()` (line 53) + `createTwoPersonaSuite()` (line 107)
3. Note: each test file has slightly different helper signatures. The shared helper should use an options object with sensible defaults to accommodate all variants. Tests that need two-persona setups can call the helper twice or use a thin local wrapper.
4. Run full test suite to confirm no regressions.
5. Update `tests/README.md` to document the shared helper location and usage.

### WP-004: Documentation Layer-Count Fix

1. **`docs/getting-started.md`** (line 70): Change "four layers" → "five layers". Add `onPersonaPartials` as layer 5 in the blockquote list.
2. **`docs/configuration.md`** (lines 10–11): Change both "four-layer" → "five-layer" descriptions. Add `onPersonaPartials` mention to both entries.
3. **`docs/directory-convention.md`** (line 26): Change "four layers" → "five layers". Add `onPersonaPartials` as layer 5 in the numbered list.
4. **`docs/dynamic-partials.md`** (line 329): Change "four layers" → "five layers" in the heading/intro sentence. The layer details already include `onPersonaPartials` — verify no further changes needed.
5. Add a cross-link note in each updated doc pointing to `docs/dynamic-partials.md` as the canonical partials resolution reference.
6. Verify `docs/agents/project-manifest/constraints.md` (line 127) already says "five layers" — confirmed, no change needed.

### WP-005: `buildContext()` Options Object Refactor

1. Define a `BuildContextOptions` interface in `src/builders/persona-builder.ts` (or `src/builders/types.ts` if it needs to be shared):
   ```ts
   interface BuildContextOptions {
     personaMeta: Record<string, unknown>;
     sharedMeta: Record<string, unknown>;
     agentMap?: Record<string, string>;
     target?: TargetType;
     registry?: TargetRegistry;
     configVariables?: Record<string, unknown>;
     suiteVariables?: Record<string, unknown>;
   }
   ```
2. Refactor `buildContext()` to accept a single `options: BuildContextOptions` parameter.
3. Update the two call sites inside `persona-builder.ts` (`buildPersona()` step 2).
4. Since `buildContext()` is not exported, this is purely internal. No public API impact.
5. Run full test suite.

### WP-006: Depth-2 Nesting Cap Evaluation

1. **Research phase**: Audit all current consumers of `resolvePartials()`:
   - Persona-builder pipeline (in `buildPersona()` step 6)
   - Any direct callers in tests or external code
2. Assess real-world depth requirements:
   - Do any existing partial chains reach depth 2 (partial → nested partial)?
   - Does any `onPersonaPartials` consumer inject partials that reference other partials?
3. **Decision**: Based on the research, recommend one of:
   - **No change** — depth 2 is sufficient; document the constraint more prominently
   - **Make configurable** — add a `maxPartialDepth` option to `BuildConfig` with default 2
   - **Raise default** — increase the hardcoded cap to 3 or higher
4. If a code change is warranted, implement it in `src/engine/partials.ts`, add tests, and update `docs/dynamic-partials.md` and `docs/agents/project-manifest/constraints.md`.

## Dependencies

- WP-001 through WP-006 are independent of each other and can be executed in any order or in parallel.
- WP-003 should ideally be done before any future test files are added, to prevent further duplication.
- WP-005 is a refactor of an internal function — should be done in isolation to keep the diff clean.

## Required Components

- `src/plugins/runner.ts` — WP-001
- `tests/plugins/plugin-runner.test.ts` — WP-001
- `src/builders/persona-builder.ts` — WP-002, WP-005
- `tests/helpers/suite-fixture.ts` — WP-003 *(new file)*
- `tests/builders/persona-builder.test.ts` — WP-003
- `tests/builders/build-config-variables-and-partials.test.ts` — WP-003
- `tests/builders/persona-builder-edge-cases.test.ts` — WP-003
- `tests/builders/config-partials-and-on-partials.test.ts` — WP-003
- `tests/builders/config-suite-variables.test.ts` — WP-003
- `tests/builders/on-persona-partials.test.ts` — WP-003
- `tests/README.md` — WP-003
- `docs/getting-started.md` — WP-004
- `docs/configuration.md` — WP-004
- `docs/directory-convention.md` — WP-004
- `docs/dynamic-partials.md` — WP-004
- `src/engine/partials.ts` — WP-006 (conditional)
- `src/builders/types.ts` — WP-005 (conditional, if interface is placed here)

## Assumptions

- The `?? accumulated` null-guard pattern is the correct fix — not a type-level `NonNullable` constraint, which would be a breaking change to the plugin interface.
- The `createMinimalSuite()` / `createSuite()` helpers in the six test files are similar enough to be unified into a single helper with an options object.
- `buildContext()` is not called from outside `persona-builder.ts` (verified: it is not exported).

## Constraints

- All changes must be backward-compatible with existing plugin implementations.
- The plugin interface (`PersonaBuildPlugin`) must not be modified in this plan (the `?? accumulated` fix is in the runner, not the type).
- Documentation layer counts must match the implementation exactly (currently 5 layers).
- The `tests/helpers/` directory does not currently exist — it will be created by WP-003.

## Out of Scope

- Adding new plugin hooks or config fields.
- Changing the partials resolution algorithm beyond potentially raising the nesting depth cap.
- Public API changes to `build()`, `buildSuite()`, or `buildPersona()`.
- The ledger routing guard incident mentioned in the synthesis (that is an `ai-insights` orchestrator concern, not a persona-builder concern).

## Acceptance Criteria

- **WP-001**: All four accumulating runners in `runner.ts` include `?? accumulated` (or `?? output`) fallback. New unit tests prove that a plugin returning `undefined` does not crash the build.
- **WP-002**: No `3a` or `3b` step labels remain in `persona-builder.ts`. Steps are numbered linearly in both `buildSuite()` and `buildPersona()`.
- **WP-003**: A shared `tests/helpers/suite-fixture.ts` exists. All six builder test files import and use it. No local `createMinimalSuite()` or `createSuite()` definitions remain. All 408+ tests pass.
- **WP-004**: All user-facing docs (`getting-started.md`, `configuration.md`, `directory-convention.md`, `dynamic-partials.md`) correctly state "five layers" and list `onPersonaPartials` as layer 5. Each doc cross-links to `dynamic-partials.md`.
- **WP-005**: `buildContext()` accepts a single options object. No positional parameters beyond the options object. All tests pass.
- **WP-006**: A documented decision exists (in the plan results or in `docs/dynamic-partials.md`). If code changes are made, tests cover the new behaviour.

## Testing Strategy

- **WP-001**: Add 4 new unit tests (one per runner) in `tests/plugins/plugin-runner.test.ts` that register a plugin returning `undefined` and verify the accumulator is preserved.
- **WP-002**: No new tests needed — this is a comment-only change. Run full suite to confirm no behavioural regressions.
- **WP-003**: Run full suite after refactoring to confirm all 408+ tests still pass with zero failures.
- **WP-004**: Manual review of all four docs. No automated test applicable.
- **WP-005**: Run full suite. The refactor is internal; existing tests exercise `buildContext()` indirectly through `buildPersona()`.
- **WP-006**: If a code change is made, add tests for the new nesting depth. If no change, add a test explicitly verifying the depth-2 cap behaviour (document the constraint via test).

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **WP-003: Shared helper can't accommodate all test-file variants** | Use a flexible options object with sensible defaults. Keep thin local wrappers for edge-case setups (e.g., `createTwoPersonaSuite`). |
| **WP-005: Internal refactor breaks test expectations** | `buildContext()` is not exported. All tests exercise it via `buildPersona()` / `buildSuite()`. Run full suite after refactoring. |
| **WP-006: Raising the nesting cap causes performance regression** | Cap any increase to a reasonable maximum (e.g., 5). Performance impact of regex passes is negligible at these depths. |
| **WP-001: `?? accumulated` masks legitimate null returns** | The plugin type signatures return `Record<string, unknown>` / `string` — `null` and `undefined` are never valid return values. The fallback preserves the previous input, which is strictly safer than propagating `undefined`. |
