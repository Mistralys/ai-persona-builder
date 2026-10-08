# Synthesis Report — Persona Targets and Tool Validation

### Outcome Summary

This plan moved per-persona output targets and cross-target tool validation out of AI Insights' persona build wrapper and into the shared `@mistralys/persona-builder` library across 17 work packages, all completed successfully. The library gained a `PersonaIndex` pre-scan, target-capability metadata, a transitive partial-reference collector, per-persona target filtering, a tool-requirement/foreign-notation validator, target-aware sub-agent validation, and a cross-target capability-parity post-pass, with error-severity results now failing every build by default (a proposed v3.0.0 breaking change). AI Insights was then migrated onto the library's checks: it declared its handoff dispatch requirements, deleted its duplicated Claude-Code-only validation logic, resolved all 17 real persona-YAML capability-parity mismatches per a user-approved resolution table, and had its full build (130 personas) and documentation verified byte-identical to the pre-change baseline aside from the intended grant edits.

### Metrics

- **Work packages:** 17/17 COMPLETE, all pipeline stages passed (0 stages missing).
- **Library (`ai-persona-builder`) test suite:** grew from 483 tests (WP-001 baseline) to 620 tests across 35 files by WP-011/WP-012; 0 failures throughout.
- **AI Insights (`ai-insights`) test suite:** 306→298 tests across 21→20 files after WP-014 deleted the retired `cc-tools-validation.test.js` (8 cases); 0 failures throughout, confirmed again in WP-016.
- **Real persona corpus:** 132 personas at baseline → 130 after per-persona target filtering (WP-005) correctly skips 2 excluded builds; final `--check` run reports 0 errors / 0 warnings after WP-015's grant alignment (down from 25 pre-existing parity errors surfaced by WP-009's new check).
- **Code review:** 0 blocking issues across all 17 WPs.
- **Security audit (WP-015):** 0 security issues; PASS across all 14 audit areas.
- **Release engineering (WP-010):** recommended MAJOR version bump (proposed v3.0.0) for the build-success semantics change; version bump and npm publish explicitly reserved for the user (Human Action).

### Strategic Recommendations

- **Pure validator / impure orchestrator split** (WP-009, flagged as a "gold nugget" by the Reviewer): `validateToolParity()` takes plain Map/Record data while `build()` owns all grouping-by-`personaYamlPath` and capability-map filtering — a reusable template for future cross-entity, cross-target post-passes.
- **Changelog-as-audit-trail convention** (WP-015): every persona YAML's changelog entry states what tool grant changed and why, making grant history self-auditing without consulting the original plan. Worth preserving as a standing convention for any future capability-affecting persona edit.
- **`tool_parity_exceptions` with inline rationale comment** (WP-015, `web-gui-specialist.yaml`): a good precedent for documenting genuine, intentional cross-target capability differences rather than silently suppressing them.
- **Single shared capability-map vocabulary** (WP-003) eliminated target-name branches from `buildContext()`, the tool-requirements validator, and the parity validator alike — the design goal of "one resolver shared by rendering and validation" was achieved and should be the template for any future target-specific behavior.

### Code Insights

**Developer:**
- WP-002: Chose `resolvePersonaTargets()`'s error-path fallback to `[]` (never all-targets) for invalid/non-array/empty declared `targets`, so a broken declaration never over-builds — later confirmed by Reviewer as correctly matching WP-005's intersection-filtering semantics.
- WP-007: Flagged that "skip-on-empty `agentMap`" is a genuine behavior change from the code it replaced (the original always errored on a declared-but-unmatched slug, regardless of map emptiness) rather than a pure relocation — no regression resulted since no prior test exercised that exact case, but called out for Reviewer awareness.
- WP-010: Changing build-success semantics immediately exposed a real latent bug in the library's own `fixtures/sample-suite/meta/example-persona.yaml` (vscode-notation tools with no `cc_tools` override), proving the new error-fails-by-default behavior has real bite even against the library's own fixtures.
- WP-014: Discovered (pre-existing, not caused by this WP) that `build-personas.js`'s `execFileSync` catch block exits the whole wrapper script before its post-build name-mapping/version steps whenever the library CLI exits nonzero — true for every non-check build until WP-015 resolved the parity findings. Flagged as debt for whoever runs a real build before WP-015 lands.

**QA:**
- WP-011: Found a pre-existing doc/behavior discrepancy — `docs/cli.md` claimed `--check` "always exits 0 unless `--strict`" while the actual CLI behavior (post-WP-010) exits 1 on any error-severity result regardless of `--strict`. Fixed in WP-012.
- WP-016: Re-confirmed a nuance first found by the WP-015 Developer — negative check 3 (foreign-notation + parity error) only reproduces both findings when lowercase `read` *substitutes* for `Read` in `cc_tools`, not when appended alongside it.

**Reviewer:**
- WP-010: Forwarded two documentation-forward items (stale `api-surface.md` `BuildSummary` snippet, stale `README.md` feature bullet) — both resolved in the same WP's documentation pass.
- WP-014: Forwarded three documentation-forward items (stale cross-references to the deleted `cc-tools-validation.js` and the removed `resolvePersonaTargets` export in `AGENTS.md` and two personas manifest docs) — all resolved in the same WP's documentation pass.

**Documentation:**
- WP-002/WP-005/WP-007/WP-008/WP-009/WP-010/WP-012: Ran extensive gap analyses beyond reviewer-forwarded items, repeatedly finding and fixing stale "not yet enforced"/"not yet wired" callouts across `api-surface.md`, `docs/api.md`, `docs/plugins.md`, `data-flows.md`, `constraints.md`, and `metadata-reference.md` as each library capability went from defined-but-unwired to fully wired.
- WP-013/WP-014/WP-017: Repeatedly found that `.context/` generated snapshots had drifted behind the source docs they mirror, sometimes by multiple prior WPs' worth of changes; regenerated scoped subsets each time rather than the whole tree.
- WP-015: Found and fixed a self-introduced staleness — an `api-surface.md` example citing `module-intent-architect` as a persona that "omits TodoRead/TodoWrite" became false once this same WP added those tools to that persona; replaced the example and removed a matching stale inline YAML comment.

### Deferred & Follow-Up Items

- **Source:** WP-001 · **Originating agent:** Developer · **Description:** `ai-insights`'s `npm test` intermittently times out in `scripts/tests/store-commands.test.js` and `scripts/tests/backfill-duration.test.js` when run as part of the full suite (default 5000ms timeout), though both pass in isolation. **Status:** deferred (pre-existing flakiness, unrelated to this plan). **Priority/rationale:** low — "worth raising the timeout or isolating shared fixtures if it recurs."
- **Source:** WP-002 · **Originating agent:** Documentation · **Description:** `tests/README.md` and `file-tree.md`'s test-count annotations for test directories not touched by this plan (e.g. "(125 tests)") were left unfixed. **Status:** out-of-scope. **Priority/rationale:** low — flagged rather than fixed to avoid scope creep; later WP-008 found this staleness had grown broader still (several missing test-file entries in the `builders/` tree) and again deferred it.
- **Source:** WP-004 · **Originating agent:** Documentation · **Description:** `docs/api.md` (public-facing) has never documented any engine function (`resolvePartials`, `resolveConditionals`, `resolveVariables`, `collectPartialReferences`, etc.) despite them being exported from the package root. **Status:** deferred, pre-existing gap not introduced by this plan. **Priority/rationale:** low — "flagged for a future documentation pass rather than fixed here to avoid unbounded scope creep."
- **Source:** WP-014 · **Originating agent:** Documentation · **Description:** CTX `.context/` snapshots (`scripts.md`, `agents.md`, `workspace-structure.md`, personas `manifest.md`) remained stale after this WP's source-doc edits because the Task tool (needed to delegate to CTX Architect) was unavailable in-session. **Status:** resolved — WP-017's documentation pass regenerated `.context/` via `node scripts/cli.js ctx-generate` and confirmed scope.
- **Source:** WP-013 · **Originating agent:** Documentation · **Description:** Recommends a periodic `ctx generate` + commit as part of routine doc maintenance, since multiple prior WPs' documentation passes had skipped CTX regeneration (no `context.yaml` delegation invoked) even though the source docs they touched are mirrored by ctx-generated files. **Status:** process recommendation, not a code deferral — worth carrying into the next planning cycle as a checklist item.
- **Source:** WP-015 (security-audit) · **Originating agent:** Security Auditor · **Description:** Non-blocking hardening/posture observation — `1-planner`'s Task dispatch allowlist (kept on both targets per user override) is undocumented as a deliberate exception; noted as worth a documentation cross-reference in a future pass. **Status:** deferred, non-blocking. **Priority/rationale:** low.
- **Source:** WP-014 · **Originating agent:** Developer · **Description:** `build-personas.js`'s `execFileSync` catch block exits the whole wrapper script before its post-build name-mapping/version steps whenever the library CLI exits nonzero, which was true for every non-check build until WP-015 resolved the pending parity findings. Not caused by this WP; not fixed in this plan. **Status:** deferred debt. **Priority/rationale:** medium — could resurface if a future library-level check introduces new errors that the wrapper's post-build steps depend on completing.
- **Source:** Plan-level (Human Actions) · **Originating agent:** Release Engineer (WP-010) / Plan · **Description:** Two actions are explicitly reserved for the user and were not performed by any agent: (1) publishing the new `@mistralys/persona-builder` version (final version number, `package.json` bump, tag, `npm publish` — proposed v3.0.0 per WP-010's release-engineering pass), and (2) bumping `ai-insights/personas/package.json`'s dependency range to match. **Status:** out-of-scope by design (explicit plan boundary), pending user action.

### Next Steps

1. **Publish the library and update the dependency range** (the two Human Actions above) — this plan's changes are inert for any consumer other than the dev-symlinked `ai-insights` until `@mistralys/persona-builder` v3.0.0 (proposed) is published and `personas/package.json`'s range is bumped to consume it.
2. **Revert the WP-001 dev-link** once the published version is installed, per `dev-linking.md`'s documented revert command, so `ai-insights` returns to consuming the registry package rather than the local checkout.
3. **Sweep remaining doc/test-count staleness** flagged as out-of-scope during this plan (`tests/README.md` test-count annotations, missing `docs/api.md` engine-function coverage) in a small dedicated documentation-debt WP.
4. **Consider formalizing a periodic CTX regeneration step** in the standard documentation pipeline stage, given the recurring drift observed across WP-013/014/017.
5. **Watch `build-personas.js`'s error-propagation behavior** (WP-014's flagged debt) the next time a library-level check introduces new build-failing errors, to confirm the wrapper's post-build steps still run to completion when they should.
