## Synthesis

### Completion Status
- Status: COMPLETE
- Completed by: Standalone Developer Agent

### Implementation Summary
- **Step 1:** Added `persona_file_deep_agents` to the `required[]` array in `shared/workflow-manifest.schema.json`, enforcing its presence on all role items.
- **Step 2:** Fixed persona ID anomalies in three ledger YAML files (`6-reviewer`, `8-documentation`, `9-synthesis`) — numeric prefix in `id` now matches `number` field. Rebuilt all 81 persona files; verified corrected IDs propagated and no stale IDs remain.
- **Step 3:** Added integration test in `tests/integration/build.test.ts` verifying `outputDirs` with a custom target where `outputDirKey !== name` routes output correctly.
- **Step 4:** Created `orchestrator/tests/test_subagents.py` with 6 test cases covering happy path, unknown stage, cache hit, cache clear, missing file, and path traversal guard.
- **Step 5:** Added `clone()` method to `TargetRegistry` with 4 dedicated tests. Added JSDoc warning on `defaultRegistry` singleton about test mutation safety.
- **Step 6:** Updated `docs/getting-started.md`, `docs/plugins.md`, and `docs/cli.md` to use `outputDirs` instead of deprecated `outVscode`/`outClaudeCode`. Added backward compatibility note.
- **Step 7:** Documented two-registry limitation and test isolation guidance in `docs/api.md`, including new `TargetRegistry` methods table (`clone()`, `allDefinitions()` semantics).
- **Step 8:** Produced design note for `subagents` manifest key in `discussions/2026-04-08-subagents-manifest-key-design.md` — schema proposal, migration path, and impact analysis (design-only, no implementation).
- **Step 9:** Added 3-level nesting conditional test to `tests/engine/conditionals.test.ts` covering all 4 truth-table combinations.
- **Step 10:** Hardened `allDefinitions()` to return shallow copies; added mutation isolation test confirming registry internal state is protected.
- **Step 11:** Added `defaultEnabled?: boolean` to `TargetDefinition`. Set `true` for `vscode`/`claude-code`, `false` for `deep-agents`. Updated `build()` to derive default targets from the registry using `defaultEnabled`. Added 3 integration tests confirming default exclusion/inclusion behavior.

### Documentation Updates
- `docs/getting-started.md` — replaced deprecated `outVscode`/`outClaudeCode` with `outputDirs`, added backward compat note.
- `docs/plugins.md` — same replacement.
- `docs/cli.md` — same replacement.
- `docs/api.md` — added `TargetRegistry` methods table, `clone()` docs, two-registry limitation callout, test isolation warning.
- `docs/configuration.md` — updated `targets` field description to reference `defaultEnabled`.
- `docs/agents/project-manifest/api-surface.md` — added `clone()` method, `defaultEnabled` field, updated `allDefinitions()` semantics, added `defaultRegistry` mutation warning.
- `discussions/2026-04-08-subagents-manifest-key-design.md` — new design note for step 8.

### Verification Summary
- **Persona builder tests:** 316 passed (18 test files) — 0 failures, 0 regressions.
- **Orchestrator tests:** 777 passed, 7 skipped — 0 failures, 0 regressions (includes 6 new subagent tests).
- **MCP server tests:** 1735 passed (58 test files) — 0 failures, 0 regressions.
- **Manifest validation:** `node scripts/validate-workflow-manifest.js` — OK (spec_version=2.4.1, roles=9, pipelines=6).
- **Persona freshness:** `npx persona-build --check` — OK (81 personas, no stale files).
- **ID verification:** `grep` confirmed corrected IDs (`ledger-6-reviewer`, `ledger-8-docs`, `ledger-9-synthesis`) present in generated output; old IDs absent everywhere.

### Code Insights
- [low] (convention) `tests/integration/build.test.ts`: ~~Several older tests still use the deprecated `outVscode`/`outClaudeCode` fields in their `SuiteConfig` objects.~~ **RESOLVED** — All 6 test configs migrated to `outputDirs`.
- [low] (improvement) `src/targets/registry.ts`: ~~`get()` returns internal references (not copies), while `allDefinitions()` now returns shallow copies.~~ **RESOLVED** — `get()` now returns shallow copies; 2 tests updated from `toBe` to `toStrictEqual`.
- [low] (debt) `docs/agents/project-manifest/api-surface.md`: ~~The `contextFlags` description still notes "not yet consumed by the runtime".~~ **RESOLVED** — Description updated to reflect registry-driven `contextFlags` injection with fallback path.
- [low] (improvement) `orchestrator/tests/test_subagents.py`: ~~The path traversal test writes a file outside `tmp_path` to its parent directory.~~ **RESOLVED** — Test now creates a nested `workspace/` dir within `tmp_path` and uses that as `workspace_root`.

### Additional Comments
- The `defaultEnabled` change is fully backward-compatible: existing configs without explicit `targets[]` see the same `['vscode', 'claude-code']` default. Custom registries now also respect `defaultEnabled` instead of defaulting to all registered targets.
- The `STAGE_SUBAGENT_FILES` design note (step 8) is intentionally implementation-free. It requires PM approval before a follow-up plan decomposes the work.
