# Project Synthesis — Extensible Targets & Deep Agents

**Plan:** `2026-04-07-extensible-targets-deep-agents`
**Date Completed:** 2026-04-08
**Work Packages:** 14 / 14 COMPLETE
**Pipeline Health:** 14/14 WPs — all stages PASS (1 QA rework in WP-009)

---

## Executive Summary

This plan delivered three closely integrated capabilities across the `@mistralys/persona-builder` library and the `ai-insights` monorepo:

1. **Extensible Target Registry** — A new `TargetRegistry` class and `TargetDefinition` interface replace all hardcoded `'vscode' | 'claude-code'` branches in the build pipeline. Consumers can register custom output targets without forking the library.

2. **`deep-agents` Built-in Target** — A third built-in target (`deep-agents`) is now registered alongside `vscode` and `claude-code`. It uses minimal YAML-only frontmatter (`name + description`) sized for headless LangGraph consumers. The context flag `target_deep_agents: true` is injected into template context at build time. New computed convenience fields (`da_file_name_stem`, `da_tools_list`, `da_tools_json`) mirror the existing `cc_*` pattern.

3. **Orchestrator Subagent Wiring** — The `ai-insights` orchestrator now loads deep-agents persona files and passes them as Deep Agents subagents for the PM stage (WP Decomposer). The PM persona template was updated with nested conditionals to emit `task(subagent: "wp-decomposer")` calls only when the `target_deep_agents` flag is active, without changing VS Code or Claude Code output.

A critical engine bug was discovered and fixed along the way: the conditional renderer (`resolveConditionals()`) used a single-pass non-greedy regex that corrupted nested `{{#if}}` blocks. The fix — an innermost-first multi-pass algorithm — is architecturally sound and handles arbitrary nesting depth.

---

## Metrics

| Metric | Value |
|--------|-------|
| **WPs completed** | 14 / 14 |
| **Total pipeline stages run** | 54 (all PASS; 1 QA rework in WP-009) |
| **Library tests (start → end)** | 248 → 303 (+55 new tests, 0 failures) |
| **Orchestrator tests** | 764 → 783 (+19 new tests, 0 failures) |
| **TypeScript errors** | 0 throughout |
| **Security audit findings** | 0 Critical · 0 High · 1 Low (addressed by reviewer) |
| **Library version** | v2.1.3 (patch — backwards-compatible) |
| **Personas version** | v3.12.0 (minor — new deep-agents target) |
| **Orchestrator version** | v0.13.0 (minor — PM subagent wiring) |
| **Workspace root version** | v1.15.0 |
| **Generated persona files** | 81 total (27 per target: vscode + claude-code + deep-agents) |
| **Reviewer Fix-Forwards applied** | 10 (all non-behavioral) |

---

## What Was Built

### Layer 1 — Target Registry (`src/targets/`)

- `TargetDefinition` interface: `name`, `outputDirKey`, `filenameContextKey`, `defaultFrontmatter`, `contextFlags`
- `TargetRegistry` class: `register()`, `get()`, `has()`, `names()`, `allDefinitions()`
- `defaultRegistry` singleton — pre-populated with `vscode`, `claude-code`, `deep-agents`
- `TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, `TARGET_DEEP_AGENTS` constants
- All exported from the library entry point (`src/index.ts`)

**Architectural fix applied (WP-001 code review):** `DEFAULT_FRONTMATTER_*` constants moved from `src/builders/frontmatter.ts` → `src/targets/types.ts` to prevent a confirmed circular import that would have triggered in WP-003.

**`outputDirKey` bug fixed (WP-003 code review):** `resolveOutputDir()` was using the raw target name as the map lookup key instead of `definition.outputDirKey`. All three built-in targets have matching name/key values so no user-facing breakage occurred, but a custom target with `outputDirKey !== name` would have silently failed.

### Layer 2 — Type System Widening (`src/plugins/types.ts`, `src/builders/types.ts`)

- `TargetType` widened from `'vscode' | 'claude-code'` → `string`
- `SuiteConfig.outputDirs?: Record<string, string>` added (new preferred form)
- `outVscode` / `outClaudeCode` marked `@deprecated` (still required for backward compat)
- `BuildConfig.targets` and `BuildResult.target` widened to `string`
- `BuildConfig.targetRegistry?: TargetRegistry` typed ahead of runtime wiring

### Layer 3 — Runtime Wiring (`src/builders/persona-builder.ts`)

- `resolveOutputDir()` now uses `definition.outputDirKey ?? target` as the map key
- `buildContext()` spreads `contextFlags` from the registry definition (eliminating hardcoded `target_vscode: true` assignments)
- `resolveFrontmatterTemplate()` resolves `defaultFrontmatter` from the registry (eliminating hardcoded ternary)
- `buildPersona()` and `buildSuite()` accept optional `registry` parameter (defaults to `defaultRegistry`)
- `build()` resolves registry from `config.targetRegistry ?? defaultRegistry`; preserves historical `['vscode', 'claude-code']` default when no custom registry is supplied
- `grep -r "=== 'vscode'" src/builders/` returns zero matches

### Layer 4 — `deep-agents` Computed Fields (WP-008)

- `da_file_name_stem`: `da_file_name` with `.md` stripped
- `da_tools_list` / `da_tools_json`: serialized from `da_tools` array (falls back to `tools`)
- All three fields are only injected when `da_file_name` is set on the persona (intentional asymmetry vs. `cc_*`)

### Layer 5 — Persona Build Configuration (WP-010)

- `personas/persona-build.config.js` extended with the `deep-agents` target
- `FRONTMATTER_DA` uses `{{id}}` for the machine-readable `name` field and `{{cc_description}}` for `description`
- All 9 ledger persona YAMLs now have a `da_file_name: N-<role-slug>.md` field
- 81 total output files generated cleanly across all 3 targets

### Layer 6 — Nested Conditionals Engine Fix (WP-011)

- **Root cause:** `resolveConditionals()` used a single-pass non-greedy regex that consumed the innermost `{{/if}}` as the closing tag for the outermost `{{#if}}`, leaving stray `{{/if}}` tokens.
- **Fix:** Converted to an innermost-first multi-pass loop. Each pass only resolves blocks with no nested `{{#if}}` content (negative lookahead). Loop repeats until stable.
- 6 new unit tests for nested conditional resolution added to `tests/engine/conditionals.test.ts`
- PM persona now correctly emits `task(subagent: "wp-decomposer")` only in deep-agents target, with VS Code and Claude Code outputs byte-identical to pre-change.

### Layer 7 — Orchestrator Subagent Wiring (WP-012 + WP-013)

- `persona_file_deep_agents` field added to all 9 roles in `shared/workflow-manifest.json` and its JSON Schema
- `orchestrator/src/config.py`: `PERSONA_FILES` now reads `persona_file_deep_agents` (deep-agents files)
- `orchestrator/src/config.py`: `STAGE_SUBAGENT_FILES` — new static map wiring the PM stage to WP Decomposer
- `orchestrator/src/utils/subagents.py` — new module: `load_subagents()` loads persona content and caches by `(stage, name)`; `clear_cache()` for tests; path containment guard applied
- `orchestrator/src/nodes/__init__.py`: PM stage now passes subagents to `create_deep_agent()`

---

## Aggregated Observations & Strategic Recommendations

### High Priority — Follow-Up WPs Recommended

**1. `persona_file_deep_agents` schema optionality vs. runtime required (WP-012 Reviewer)**
The field is `optional` in the JSON Schema but accessed unconditionally in `config.py`. All 9 current roles carry it, so there is no crash risk today. Add it to `required[]` in the schema to enforce presence before the role count grows.

**2. Pre-existing persona ID anomaly (WP-010 QA/Reviewer)**
Ledger personas 6, 8, and 9 have non-sequential `id` values (`ledger-5-reviewer`, `ledger-6-docs`, `ledger-7-synthesis`). These non-sequential IDs surface as the `name` field in deep-agents output, making the sequence appear as `1,2,3,4,5,5,6,7,7` to headless consumers. `da_file_name` values are correctly sequential regardless. A housekeeping WP aligning these YAML `id` fields with sequence numbers would improve deep-agents discoverability.

**3. `resolveOutputDir()` + `outputDirs` code path untested (WP-005 QA, WP-003 QA)**
All integration tests use the deprecated `outVscode`/`outClaudeCode` fields. The `outputDirs` code path was manually verified by QA but has no permanent automated test. Add an integration test in `tests/builders/persona-builder.test.ts` or `tests/integration/` covering the `outputDirs` config pattern with a custom target where `outputDirKey !== name`.

### Medium Priority — Code Quality

**4. `STAGE_SUBAGENT_FILES` is manually maintained (WP-013 Developer, Reviewer)**
Unlike `PERSONA_FILES` and `AGENT_ROLES`, `STAGE_SUBAGENT_FILES` is a static constant — not derived from `workflow-manifest.json`. As the number of stages with subagents grows, this creates an undocumented manual sync burden. Future improvement: add a `subagents` array to the workflow manifest role spec so the config is manifest-derived. Constraint 18 in the orchestrator manifest documents this.

**5. `defaultRegistry` singleton mutation in tests (WP-005 QA)**
`TargetRegistry` has no `unregister()` or `reset()` method. If a future test calls `defaultRegistry.register()` for a new name, intra-file test ordering assumptions may break. Document that consumers must not mutate `defaultRegistry` in tests, or add a snapshot/freeze mechanism.

**6. No `test_subagents.py` unit file (WP-013 Reviewer)**
Edge cases for `load_subagents()` — `FileNotFoundError` on missing file, cache-hit semantics, unknown stage → `[]` — were verified interactively by QA but are not captured as formal pytest tests. A `tests/test_subagents.py` would lock in these contracts.

### Low Priority — Incremental Improvements

**7. Add a `defaultEnabled` boolean to `TargetDefinition` (WP-003 Developer)**
`build()` currently hardcodes `['vscode', 'claude-code']` as the default target set (rather than `registry.names()`) to prevent `deep-agents` from silently entering existing configs. A `defaultEnabled` field on `TargetDefinition` would let targets opt-in/out of the default build set without requiring explicit `targets[]` configuration.

**8. Two-registry limitation documentation (WP-003 Reviewer)**
When consumers pass a custom `TargetRegistry` only to `build()` and later call `buildPersona()`/`buildSuite()` directly without the `registry` argument, their custom targets are invisible. This is documented in JSDoc but should also appear in the user-facing docs (`docs/api.md` or `docs/configuration.md`).

**9. Add 3-level nesting unit test for `conditionals.test.ts` (WP-011 Reviewer)**
QA verified 3-level nesting manually. A formal unit test at 3 levels would serve as a regression guard for the stabilization loop.

**10. `allDefinitions()` returns mutable references (WP-001 QA, Reviewer)**
`TargetRegistry.allDefinitions()` returns direct references to internal `Map` values. Acceptable for a build-time tool, but a shallow spread copy would harden it if the registry ever runs in a long-lived server context.

---

## Files Modified (Selected)

**Library (`ai-persona-builder-DEV`):**
- `src/targets/types.ts`, `registry.ts`, `built-in.ts`, `index.ts` *(new)*
- `src/builders/persona-builder.ts`, `frontmatter.ts`, `types.ts`
- `src/plugins/types.ts`
- `src/engine/conditionals.ts` *(nested conditional fix)*
- `tests/targets/target-registry.test.ts` *(new)*
- `tests/builders/target-variable-injection.test.ts`, `da-computed-fields.test.ts` *(new)*
- `tests/engine/conditionals.test.ts`
- `tests/integration/build.test.ts`
- `CHANGELOG.md` — v2.1.3
- `package.json` — v2.1.3
- All manifest docs under `docs/agents/project-manifest/`

**Personas build system (`ai-insights-DEV`):**
- `personas/persona-build.config.js`
- All 9 `personas/ledger/src/meta/N-*.yaml`
- `personas/ledger/src/content/2-project-manager.md`
- All generated deep-agents output files (27 ledger + 18 standalone)
- `personas/changelog.md` — v3.12.0

**Orchestrator (`ai-insights-DEV`):**
- `orchestrator/src/config.py`
- `orchestrator/src/nodes/__init__.py`
- `orchestrator/src/utils/subagents.py` *(new)*
- `orchestrator/tests/test_nodes.py`
- `orchestrator/changelog.md` — v0.13.0

**Cross-project:**
- `shared/workflow-manifest.json`, `shared/workflow-manifest.schema.json`
- `AGENTS.md`, `CLAUDE.md` — Cross-System Dependencies table updated
- `changelog.md` (root) — v1.15.0

---

## Next Steps for Planner

1. **Housekeeping WP** — Fix pre-existing persona ID anomalies in `6-reviewer.yaml`, `8-documentation.yaml`, `9-synthesis.yaml` (align `id` with sequence number).
2. **Schema enforcement WP** — Add `persona_file_deep_agents` to the `required[]` array in `workflow-manifest.schema.json`.
3. **Test coverage WP** — Add `outputDirs` integration test (custom target, `outputDirKey !== name`), `test_subagents.py` unit file, and 3-level nesting conditional test.
4. **`STAGE_SUBAGENT_FILES` manifest-derivation** — Design a `subagents` key for `workflow-manifest.json` roles so the PM subagent map is no longer manually maintained.
5. **Getting-started.md update** — The tutorial still uses `outVscode`/`outClaudeCode`; update it to demonstrate the `outputDirs` pattern for new readers.
