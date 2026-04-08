# Plan

## Summary

Follow-up rework plan addressing all 10 strategic recommendations from the `2026-04-07-extensible-targets-deep-agents` synthesis. Each issue was verified against the current codebase. Work spans both workspaces (`ai-persona-builder-DEV` and `ai-insights-DEV`) and covers schema enforcement, persona ID housekeeping, test coverage gaps, documentation freshness, a manifest-driven subagent config design, and minor hardening of the target registry.

## Architectural Context

This plan operates across two codebases established by the preceding extensible-targets plan:

**`ai-persona-builder-DEV`** — The persona builder library:
- `src/targets/registry.ts` — `TargetRegistry` class (no `unregister()` / `reset()` / immutability guard)
- `src/targets/types.ts` — `TargetDefinition` interface (no `defaultEnabled` field)
- `src/builders/persona-builder.ts` — `build()` hardcodes `['vscode', 'claude-code']` default at line 564
- `src/engine/conditionals.ts` — innermost-first multi-pass conditional resolver
- `tests/integration/build.test.ts` — integration tests use `outputDirs` only with built-in targets where `outputDirKey === name`
- `tests/engine/conditionals.test.ts` — 2-level nesting tests only (no 3-level regression guard)
- `docs/getting-started.md` (lines 170–171), `docs/plugins.md` (lines 70–71), `docs/cli.md` (lines 30–31) — all use deprecated `outVscode`/`outClaudeCode` in examples

**`ai-insights-DEV`** — The ai-insights monorepo:
- `shared/workflow-manifest.schema.json` — `persona_file_deep_agents` absent from `required[]` on role items
- `personas/ledger/src/meta/6-reviewer.yaml` — `id: ledger-5-reviewer` (number=6, id prefix=5)
- `personas/ledger/src/meta/8-documentation.yaml` — `id: ledger-6-docs` (number=8, id prefix=6)
- `personas/ledger/src/meta/9-synthesis.yaml` — `id: ledger-7-synthesis` (number=9, id prefix=7)
- `orchestrator/src/config.py` — `STAGE_SUBAGENT_FILES` is a static constant (not manifest-derived)
- `orchestrator/src/utils/subagents.py` — no corresponding `test_subagents.py` file
- `personas/persona-build.config.js` — deep-agents frontmatter uses `{{id}}` for the `name` field

## Approach / Architecture

The work is organized into 10 discrete steps matching the 10 synthesis recommendations. Steps are grouped by priority (high → medium → low) and by workspace to minimize context-switching. Cross-workspace steps are explicitly sequenced.

The persona ID fix (step 2) is the most impactful change: correcting `id` values in three YAML files changes the VS Code frontmatter `id:` field and the deep-agents frontmatter `name:` field across all three output targets. Since `id` is a build-time metadata field not referenced by MCP server source code or the orchestrator config, the blast radius is limited to generated persona files.

The `STAGE_SUBAGENT_FILES` manifest-derivation (step 8) is a design-only step: it proposes a schema extension to `workflow-manifest.json` without implementing it, so the PM can decompose the implementation into a separate plan if approved.

## Rationale

- **Schema enforcement first** (step 1): prevents silent `KeyError` crashes when new roles are added to the manifest without `persona_file_deep_agents`.
- **Persona ID fix** (step 2): eliminates a pre-existing anomaly that makes deep-agents output confusing for headless consumers recognizing sequence-numbered roles.
- **Test coverage steps** (steps 3–5, 9): lock in contracts for the `outputDirs` custom-target code path, the subagent loader, and the nested conditional engine — all manually verified during the original plan but lacking permanent regression tests.
- **Documentation steps** (steps 6–7): update user-facing docs to demonstrate the preferred `outputDirs` pattern and document the two-registry limitation, preventing new users from adopting the deprecated API.
- **Design step** (step 8): scopes the `STAGE_SUBAGENT_FILES` manifest-derivation problem without over-engineering — the current manual constant works but creates an undocumented sync burden as subagent usage grows.
- **Hardening steps** (steps 9–10): minor improvements to `defaultRegistry` safety and `allDefinitions()` immutability.

## Detailed Steps

### High Priority

**Step 1 — Add `persona_file_deep_agents` to schema `required[]`** *(ai-insights-DEV)*

File: `shared/workflow-manifest.schema.json`

The role item's `required` array is currently `["id", "name", "number", "orchestrating", "pipeline", "persona_file"]`. Add `"persona_file_deep_agents"` to this array. Then run `node scripts/validate-workflow-manifest.js` to confirm the manifest passes validation.

**Step 2 — Fix persona ID anomalies** *(ai-insights-DEV)*

Three ledger persona YAML files have `id` values whose numeric prefix doesn't match their `number` field. The `id` field surfaces in VS Code frontmatter (`id: {{id}}`) and deep-agents frontmatter (`name: {{id}}`).

| File | Current `id` | Correct `id` |
|------|-------------|--------------|
| `personas/ledger/src/meta/6-reviewer.yaml` | `ledger-5-reviewer` | `ledger-6-reviewer` |
| `personas/ledger/src/meta/8-documentation.yaml` | `ledger-6-docs` | `ledger-8-docs` |
| `personas/ledger/src/meta/9-synthesis.yaml` | `ledger-7-synthesis` | `ledger-9-synthesis` |

After editing the YAML files:
1. Rebuild all personas: `npx persona-build --config personas/persona-build.config.js`
2. Verify the generated VS Code, Claude Code, and deep-agents files reflect the corrected IDs.
3. Run `node scripts/validate-workflow-manifest.js` to confirm no cross-system breakage.

> **Impact assessment:** The `id` field is not referenced by MCP server source code (`mcp-server/src/`), the orchestrator config (`config.py` uses manifest `id` not persona YAML `id`), or any root-level script. Changes are confined to generated persona output files.

**Step 3 — Add `outputDirs` integration test with custom target (`outputDirKey !== name`)** *(ai-persona-builder-DEV)*

File: `tests/integration/build.test.ts`

Add a new `describe` block that:
1. Creates a fresh `TargetRegistry` instance (not `defaultRegistry`).
2. Registers a custom target with `name: 'my-custom'` and `outputDirKey: 'custom-out'` (deliberately different).
3. Configures a `BuildConfig` with `outputDirs: { 'custom-out': '<temp-dir>' }` and `targets: ['my-custom']` and `targetRegistry: registry`.
4. Runs `build()` and asserts the output lands in the correct directory.
5. Verifies `result.target === 'my-custom'`.

This locks in the `resolveOutputDir()` fix from WP-003 and ensures the `outputDirKey` lookup is permanent.

### Medium Priority

**Step 4 — Create `test_subagents.py` unit tests** *(ai-insights-DEV)*

New file: `orchestrator/tests/test_subagents.py`

Test cases:
1. **Known stage with subagent** — `load_subagents("pm", workspace_root)` returns a list with one entry containing `name`, `description`, and `system_prompt` keys.
2. **Unknown stage** — `load_subagents("developer", workspace_root)` returns `[]`.
3. **Cache hit** — Call `load_subagents("pm", ...)` twice; assert the second call returns the same content without re-reading the file (mock `Path.read_text` or check `_CACHE`).
4. **Cache clear** — Call `clear_cache()`, then verify the next `load_subagents()` re-reads the file.
5. **Missing persona file** — Configure a spec pointing to a non-existent file; assert `FileNotFoundError` is raised.
6. **Path traversal guard** — Configure a spec with `persona_file: "../../etc/passwd"`; assert `ValueError` is raised.

**Step 5 — Document `defaultRegistry` mutation safety** *(ai-persona-builder-DEV)*

Two sub-tasks:

a) Add a JSDoc comment on `defaultRegistry` in `src/targets/built-in.ts` (or wherever it's exported) warning that consumers must not call `register()` on it in tests without cleanup. Cross-reference from `docs/api.md`.

b) Add a `clone(): TargetRegistry` method to `TargetRegistry` that returns a new instance pre-populated with the same definitions. This lets tests work with an isolated copy. Add corresponding unit tests in `tests/targets/target-registry.test.ts`.

**Step 6 — Update user-facing docs to use `outputDirs`** *(ai-persona-builder-DEV)*

Update the following files to replace deprecated `outVscode`/`outClaudeCode` examples with the `outputDirs` pattern:

| File | Lines | Change |
|------|-------|--------|
| `docs/getting-started.md` | 170–171 | Replace `outVscode`/`outClaudeCode` with `outputDirs: { vscode: ..., 'claude-code': ... }` |
| `docs/plugins.md` | 70–71 | Same replacement |
| `docs/cli.md` | 30–31 | Same replacement |

Keep a brief note that the deprecated fields still work for backwards compatibility.

**Step 7 — Document two-registry limitation in user-facing docs** *(ai-persona-builder-DEV)*

Add a "Registry Limitations" callout/note to `docs/configuration.md` (near the `outputDirs` documentation) and/or `docs/api.md` explaining that:
- When passing a custom `TargetRegistry` to `build()`, it is only used at the `build()` level.
- Direct calls to `buildPersona()` or `buildSuite()` without the `registry` argument use `defaultRegistry` and will not see custom targets.
- Workaround: always go through `build()`, or explicitly pass `registry` to the lower-level functions.

### Low Priority

**Step 8 — Design `subagents` manifest key for `workflow-manifest.json`** *(ai-insights-DEV)*

This is a design-only step. Produce a schema proposal (not implementation) for adding a `subagents` array to the role spec in `workflow-manifest.json`. The goal is to make `STAGE_SUBAGENT_FILES` manifest-derived instead of manually maintained.

Proposed schema extension for role items:

```json
"subagents": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["persona_file", "name", "description"],
    "properties": {
      "persona_file": { "type": "string" },
      "name": { "type": "string" },
      "description": { "type": "string" }
    }
  }
}
```

Deliverable: a short design note (saved in `discussions/` or as a comment in the plan output) documenting the proposed schema, migration path, and impact on `config.py`. Do not implement — defer to a separate plan if approved.

**Step 9 — Add 3-level nesting unit test for conditionals** *(ai-persona-builder-DEV)*

File: `tests/engine/conditionals.test.ts`

Add a test case within the existing nested conditionals `describe` block:
- Template: `{{#if a}}A{{else}}{{#if b}}B{{else}}{{#if c}}C{{else}}D{{/if}}{{/if}}{{/if}}`
- Assert all 4 truth-table combinations: `{a:true}→A`, `{a:false,b:true}→B`, `{a:false,b:false,c:true}→C`, `{a:false,b:false,c:false}→D`.

**Step 10 — Harden `allDefinitions()` to return shallow copies** *(ai-persona-builder-DEV)*

File: `src/targets/registry.ts`

Change `allDefinitions()` from:
```ts
return Array.from(this._definitions.values());
```
to:
```ts
return Array.from(this._definitions.values()).map(def => ({ ...def }));
```

Add a unit test in `tests/targets/target-registry.test.ts` confirming that mutating a returned definition does not affect the registry's internal state.

**Step 11 — Add `defaultEnabled` to `TargetDefinition`** *(ai-persona-builder-DEV)*

Add an optional `defaultEnabled?: boolean` field to `TargetDefinition` in `src/targets/types.ts`. Default to `true` for `vscode` and `claude-code`, `false` for `deep-agents`.

Update `build()` in `src/builders/persona-builder.ts` line 564 to derive the default target list from the registry:
```ts
const targets = config.targets ?? registry.names().filter(n => registry.get(n).defaultEnabled !== false);
```

This removes the hardcoded `['vscode', 'claude-code']` fallback and lets custom targets opt into the default build set declaratively.

Add tests confirming:
- Default targets list excludes `deep-agents` when no explicit `targets` config is set.
- A custom target with `defaultEnabled: true` appears in the default list.
- A custom target with `defaultEnabled: false` does not.

## Dependencies

- Step 2 depends on step 1 (schema enforcement should be in place before rebuilding personas).
- Steps 3, 5, 9, 10, 11 are independent of each other and of the ai-insights work.
- Step 6 and step 7 are independent documentation tasks.
- Step 8 is a standalone design task with no code dependencies.
- Step 4 is independent of builder library changes.
- Step 11 depends on step 10 being complete (or at least reviewed), since both touch `TargetRegistry`.

## Required Components

**ai-persona-builder-DEV:**
- `src/targets/types.ts` — add `defaultEnabled` field (step 11)
- `src/targets/registry.ts` — add `clone()` method (step 5), harden `allDefinitions()` (step 10)
- `src/builders/persona-builder.ts` — update default targets derivation (step 11)
- `tests/integration/build.test.ts` — new `outputDirs` custom-target test (step 3)
- `tests/targets/target-registry.test.ts` — clone + immutability tests (steps 5, 10)
- `tests/engine/conditionals.test.ts` — 3-level nesting test (step 9)
- `docs/getting-started.md`, `docs/plugins.md`, `docs/cli.md` — fix deprecated examples (step 6)
- `docs/configuration.md` and/or `docs/api.md` — two-registry limitation callout (step 7)
- `docs/agents/project-manifest/api-surface.md` — update for new `clone()` method and `defaultEnabled` field

**ai-insights-DEV:**
- `shared/workflow-manifest.schema.json` — add to `required[]` (step 1)
- `personas/ledger/src/meta/6-reviewer.yaml` — fix `id` (step 2)
- `personas/ledger/src/meta/8-documentation.yaml` — fix `id` (step 2)
- `personas/ledger/src/meta/9-synthesis.yaml` — fix `id` (step 2)
- All generated persona files (regenerated via `persona-build`) (step 2)
- `orchestrator/tests/test_subagents.py` — new file (step 4)

## Assumptions

- The `id` field in persona YAML is not consumed by any runtime system beyond the build pipeline (verified: no references in `mcp-server/src/` or `orchestrator/src/config.py`).
- The `clone()` method on `TargetRegistry` performs a shallow clone of definitions, which is sufficient since `TargetDefinition` fields are primitives or shallow objects (`contextFlags`).
- The 3-level nesting test for conditionals is sufficient as a regression guard; deeper nesting levels are handled by the same multi-pass algorithm and don't need separate tests.

## Constraints

- **No breaking changes**: all modifications must be backwards-compatible. The deprecated `outVscode`/`outClaudeCode` fields remain functional.
- **Cross-platform**: all new tests must use temp-directory APIs (not hardcoded paths).
- **Manifest is source of truth**: any schema change must pass `node scripts/validate-workflow-manifest.js`.
- **Generated files are never edited directly**: persona ID fixes are made in YAML source, then output is regenerated.

## Out of Scope

- Implementing the `subagents` manifest key in `config.py` (step 8 is design-only).
- Removing the deprecated `outVscode`/`outClaudeCode` fields (deferred to a future major version).
- Adding `unregister()` to `TargetRegistry` (not needed — `clone()` solves the test isolation problem).
- Updating the orchestrator's `PERSONA_FILES` dict to handle missing `persona_file_deep_agents` gracefully (step 1 enforces presence at the schema level instead).

## Acceptance Criteria

1. `node scripts/validate-workflow-manifest.js` passes with `persona_file_deep_agents` in the `required[]` array.
2. Personas 6, 8, and 9 have `id` values with numeric prefixes matching their `number` field. All 81 generated files rebuild cleanly.
3. A new integration test verifies `outputDirs` with a custom target where `outputDirKey !== name`.
4. `orchestrator/tests/test_subagents.py` exists with ≥ 6 test cases covering happy path, cache, and error conditions.
5. `TargetRegistry` has a `clone()` method; `defaultRegistry` JSDoc warns against mutation in tests.
6. `docs/getting-started.md`, `docs/plugins.md`, and `docs/cli.md` examples use `outputDirs` instead of deprecated fields.
7. `docs/configuration.md` or `docs/api.md` documents the two-registry limitation.
8. A design note for the `subagents` manifest key exists in `discussions/` or adjacent to this plan.
9. A 3-level nesting unit test exists in `tests/engine/conditionals.test.ts`.
10. `allDefinitions()` returns shallow copies; a unit test confirms mutation isolation.
11. `TargetDefinition.defaultEnabled` controls the default target list in `build()`.
12. All existing tests pass (library: 303+, orchestrator: 783+). No regressions.

## Testing Strategy

- **Unit tests**: steps 4, 5, 9, 10, 11 produce new unit tests in their respective test files.
- **Integration tests**: step 3 adds an integration test in `tests/integration/build.test.ts`.
- **Validation scripts**: steps 1 and 2 are verified by `node scripts/validate-workflow-manifest.js` and `npx persona-build --check`.
- **Manual verification**: step 2 includes a visual check of regenerated persona files for correct `id`/`name` values. Step 8 is design-only (no tests).
- **Documentation review**: steps 6, 7 are verified by reading the updated docs for correctness and consistency.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Persona ID change breaks a consumer we didn't check** | Verified: `id` is not referenced in `mcp-server/src/`, `orchestrator/src/config.py`, or any root-level script. Only generated output files change. |
| **Schema enforcement breaks legacy manifests** | Only the current workspace manifest matters. All 9 roles already have `persona_file_deep_agents`. External consumers of the schema can pin the old version. |
| **`defaultEnabled` changes default build behavior** | `vscode` and `claude-code` default to `true`; `deep-agents` defaults to `false`. Existing configs without explicit `targets[]` see no change. |
| **`clone()` adds API surface to maintain** | Minimal implementation (single method, ~3 lines). Covered by dedicated tests. |
| **`STAGE_SUBAGENT_FILES` design delays implementation** | Intentional — design-first approach prevents over-engineering. Implementation deferred to a separate plan. |
