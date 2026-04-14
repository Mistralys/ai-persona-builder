# Project Synthesis Report
**Plan:** `2026-04-13-dynamic-partials`
**Generated:** 2026-04-13
**Status:** COMPLETE — all 10 work packages delivered

---

## Executive Summary

This project delivered the **Dynamic Partials** feature for `ai-persona-builder`, a two-axis extension to the library's template rendering pipeline:

1. **Custom Variable Injection** — callers can now supply global (`BuildConfig.variables`) and per-suite (`SuiteConfig.variables`) template variables that flow into every persona build as the lowest-priority layers of the context merge chain, overridable at every higher level.
2. **Dynamic Partial Maps** — a new four-layer (now five-layer, once per-persona overrides are counted) partials resolution system, consisting of:
   - `BuildConfig.partials` — inline base-layer partials defined in the build config
   - `sharedPartialsDir` file partials — shared files that override the base layer
   - Suite-local file partials — suite-scoped files that override shared
   - `onPartials` plugin hook — suite-scoped programmatic overrides, highest file-free priority
   - `onPersonaPartials` plugin hook — per-persona overrides with shallow-copy isolation guaranteeing no cross-persona leakage

Two new plugin hooks (`onPartials`, `onPersonaPartials`) were added to the `PersonaBuildPlugin` interface and wired into the `buildSuite()` / `buildPersona()` pipelines. Two new runner functions (`runPartials`, `runPersonaPartials`) were implemented with accumulating-semantics identical to the established `runBuildContext` pattern.

All changes are **fully backward-compatible**: every new field and hook is optional, and the absence of any configuration value restores the exact pre-existing behavior.

---

## Work Package Summary

| WP | Title | Pipeline Stages | Final Status |
|----|-------|----------------|--------------|
| WP-001 | Type interface additions (BuildConfig, SuiteConfig, PersonaBuildPlugin) | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-002 | `buildContext()` variable injection wiring | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-003 | `runPartials` / `runPersonaPartials` runner implementations | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-004 | `config.partials` base layer + `onPartials` hook in `buildSuite()` | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-005 | `onPersonaPartials` hook wiring in `buildPersona()` | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-006 | Unit tests for `runPartials` / `runPersonaPartials` | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-007 | Integration tests — variables and config partials | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-008 | End-to-end integration tests — all four partials layers | impl → qa → code-review → docs | ✅ COMPLETE |
| WP-009 | Project manifest updates (api-surface, data-flows, constraints) | impl → code-review → docs | ✅ COMPLETE |
| WP-010 | User-facing documentation guide (`docs/dynamic-partials.md` + README) | impl → code-review → docs | ✅ COMPLETE |

---

## Metrics

### Test Suite Growth

| Milestone | Tests | Files |
|-----------|-------|-------|
| Baseline (pre-project) | 326 | 18 |
| Post WP-003 / WP-006 (runner unit tests) | 357 | 19 |
| Post WP-002 QA (variable injection tests) | 339 | 19 |
| Post WP-004 (config partials + onPartials) | 373 | 20 |
| Post WP-005 (onPersonaPartials) | 403 | 22 |
| Post WP-007 / WP-008 (integration tests) | 408 | 22 |
| **Final** | **408** | **22** |

> Test count rose from 326 → 408 (+82 tests, +25%). Zero failures at every stage.

### Pipeline Pass/Fail Summary

| Pipeline Type | Total Runs | PASS | FAIL | Auto-Cancelled |
|--------------|-----------|------|------|----------------|
| Implementation | 11 | 10 | 0 | 1 (overload, re-run PASS) |
| QA | 8 | 8 | 0 | 0 |
| Code Review | 10 | 10 | 0 | 0 |
| Documentation | 10 | 10 | 0 | 0 |
| **Total** | **39** | **38** | **0** | **1** |

> One auto-cancelled implementation pipeline (WP-007, orchestrator overload) was immediately re-run to PASS. No rework cycles in any WP.

### Files Modified

| Category | Key Files |
|----------|-----------|
| Source — types | `src/builders/types.ts`, `src/plugins/types.ts` |
| Source — logic | `src/builders/persona-builder.ts`, `src/plugins/runner.ts`, `src/plugins/index.ts` |
| Tests — unit | `tests/plugins/plugin-runner.test.ts` |
| Tests — builder | `tests/builders/config-suite-variables.test.ts`, `tests/builders/config-partials-and-on-partials.test.ts`, `tests/builders/on-persona-partials.test.ts`, `tests/builders/build-config-variables-and-partials.test.ts` |
| Tests — integration | `tests/integration/build.test.ts` |
| Fixtures | `fixtures/integration-suite/` (2 personas: alpha, beta) |
| Docs — user | `docs/dynamic-partials.md` *(new)*, `README.md`, `docs/configuration.md`, `docs/plugins.md`, `docs/template-syntax.md`, `docs/directory-convention.md`, `docs/getting-started.md` |
| Docs — manifest | `docs/agents/project-manifest/api-surface.md`, `docs/agents/project-manifest/data-flows.md`, `docs/agents/project-manifest/constraints.md`, `docs/agents/project-manifest/file-tree.md` |
| Docs — tests | `tests/README.md` |

---

## Code Quality Observations

### Reviewer-Applied Fix-Forwards (Non-Blocking, Applied Inline)

| WP | Fix |
|----|-----|
| WP-001 | Removed redundant "Optional." suffixes from JSDoc; corrected hook-order whitespace alignment |
| WP-003 | *(no fix-forwards needed)* |
| WP-004 | Removed unused `vi` import from `config-partials-and-on-partials.test.ts` |
| WP-005 | Renamed step label `3.5` → `3b` in JSDoc for convention consistency |
| WP-007 | Added `description: ''` to minimal persona fixture to suppress benign stderr noise |
| WP-008 | Cleaned misleading `dynamic_partial: undefined` variable entry; added `_shared.yaml` dependency comment |
| WP-009 | Corrected partials layer count in `constraints.md` (4→5); added `da_file_name` to `data-flows.md` |

### Documentation-Forward Items (All Resolved)

Every documentation-forward item raised by Reviewers was addressed in the same WP's documentation pipeline stage. No carryover gaps remain.

---

## Architectural Observations (Strategic Gold Nuggets)

### 1. 🔴 Runtime Null-Guard Gap in Accumulating Runners — Priority: Medium

**Surfaced in:** WP-004 QA, WP-005 QA/Code Review, WP-008 QA/Code Review, project-level comment

**Location:** `src/plugins/runner.ts` — `runPartials()` (line ~153) and `runPersonaPartials()` (line ~193); the same pattern exists in all other accumulating runners (`runBuildContext`, `runPostRender`).

**Issue:** The accumulator variable is assigned the raw plugin hook return value with no nullish fallback:
```ts
accumulated = plugin.onPartials(accumulated, suiteName, suite);
```
If a JavaScript plugin (or a typed plugin using a type-cast workaround) returns `undefined`, `accumulated` becomes `undefined`. All subsequent plugins receive `undefined` as input, and the downstream `resolvePartials` call will crash with a runtime error.

**Recommended Fix:**
```ts
accumulated = plugin.onPartials(accumulated, suiteName, suite) ?? accumulated;
```
Apply the same pattern to `onPersonaPartials`, `onBuildContext`, and `onPostRender`. This is a pre-existing pattern surfaced — not introduced — by this project. The TypeScript types prevent this for typed consumers but offer no runtime protection.

**Impact if unaddressed:** Low probability but high blast radius — a single misbehaving third-party plugin would crash the entire build run for every persona in the suite.

---

### 2. 🟡 Growing `buildContext()` Parameter Count — Priority: Low

**Surfaced in:** WP-002 Developer note

**Location:** `src/builders/persona-builder.ts` — `buildContext()`

`buildContext()` now has 7 parameters. As an internal (non-exported) function this is not a public API concern, but as future hooks expand the context, the function will become increasingly unwieldy. **Recommended:** Group parameters into an options object in a future refactor sprint. Avoid adding additional positional parameters beyond the current 7.

---

### 3. 🟡 Step Numbering Debt in `buildPersona()` / `buildSuite()` JSDoc — Priority: Low

**Surfaced in:** WP-004 Developer note, WP-005 Developer note (resolved for WP-005 via `3b`)

**Location:** `src/builders/persona-builder.ts` — JSDoc pipeline comments in `buildSuite()` (step `3a`) and `buildPersona()` (steps now include `3b`)

The pipeline step comments use fractional labels (`3a`, `3b`) to minimise diff churn when inserting new steps. This works but will degrade readability as more hooks are added. **Recommended:** Schedule a single renumbering pass to establish a clean linear sequence. No urgency while step count is stable.

---

### 4. 🟢 Shared Test Fixture Pattern — Priority: Low (Opportunity)

**Surfaced in:** WP-007 Code Review, WP-008 Code Review

The `createMinimalSuite()` helper is duplicated (with minor variations) across four builder test files:
- `config-suite-variables.test.ts`
- `config-partials-and-on-partials.test.ts`
- `on-persona-partials.test.ts`
- `build-config-variables-and-partials.test.ts`

Extraction into `tests/helpers/suite-fixture.ts` would reduce maintenance surface. This is low urgency while the helper remains simple, but becomes more valuable if further builder tests are added. The pattern and conventions are now documented in `tests/README.md`.

---

### 5. 🟢 Depth-2 Partial Nesting Cap — Worth Documenting Proactively

**Surfaced in:** WP-010 Code Review

`src/engine/partials.ts` caps partial nesting at depth 2. Partials injected by `onPartials` or `onPersonaPartials` hooks are subject to the same cap — a hook that injects a partial referencing another partial will resolve one level, but depth-3 markers are left as literal `{{> ...}}` strings.

This constraint was documented in `docs/dynamic-partials.md` by the Documentation agent. **Recommendation for future work:** Consider whether this cap should be configurable or raised, particularly as `onPersonaPartials` makes dynamic partial injection a first-class feature.

---

## Unresolved Incident

**Reported by:** Documentation agent (project-level comment, 2026-04-13T15:05:41Z)

During the Documentation pipeline for WP-010, the ledger routing guard briefly blocked the agent from claiming WP-010 despite WP-009 being confirmed COMPLETE. The agent halted and requested PM intervention. The issue self-resolved (WP-010 is marked COMPLETE in the final ledger state), but the root cause — a possible stale "active WP" lock when WP-009 transitioned to COMPLETE — was not formally root-caused.

**Recommendation:** The ledger PM should verify whether the `ledger_begin_work` / `ledger_claim_work_package` routing guard correctly clears active-WP state on COMPLETE transitions when the prior WP was auto-finalized. No data was lost and all WPs are COMPLETE.

---

## Next Steps

### Immediate (Before Next Feature Work)

1. **Apply the null-guard fix to all accumulating runners** (`runPartials`, `runPersonaPartials`, `runBuildContext`, `runPostRender`) — add `?? accumulated` fallback. Low-risk, high-value defensive hardening. See Architectural Observation #1.

2. **Renumber `buildSuite()` / `buildPersona()` JSDoc pipeline steps** — remove the `3a` / `3b` labels and establish a clean linear sequence. Best done as a standalone 10-minute cleanup before the next WP adds further steps.

### Near-Term (Next Planning Cycle)

3. **Extract `createMinimalSuite()` into `tests/helpers/suite-fixture.ts`** — reduces duplication and gives a consistent baseline for all future builder integration tests.

4. **Evaluate the depth-2 partial nesting cap** — now that `onPersonaPartials` makes programmatic partial injection a first-class feature, assess whether the cap should be raised or made configurable.

5. **Clarify the `BuildConfig.partials` JSDoc priority chain in README** — the three-layer and four-layer descriptions appear in several places; a single canonical source of truth (already established in `docs/dynamic-partials.md`) should be cross-linked everywhere instead of re-stated inline.

### Strategic

6. **Plugin hardening guide** — the null-guard gap and the shallow-copy isolation contract on `onPersonaPartials` both point to a broader need for a "plugin author contract" document. This should specify: what each hook receives, what it must return, error handling expectations, and mutation rules.

---

## Conclusion

The dynamic partials feature was delivered across 10 work packages with zero rework cycles, zero test regressions, and zero blocking defects. The test suite grew by 25% (+82 tests), all documentation was updated in-flight, and the three-tier manifest (api-surface, data-flows, constraints) remains authoritative and accurate.

The one architectural risk worth immediate attention is the null-guard gap in the accumulating plugin runners — a low-effort fix that eliminates a class of hard-to-diagnose runtime failures caused by misbehaving third-party plugins.
