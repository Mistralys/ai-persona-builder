# Synthesis Report — Persona Targets and Tool Validation - Rework 1

### Outcome Summary

This project rewrote the persona-builder's conditional engine as a single-pass tokenizer with a bracket-matched block resolver, fixing a whitespace bug where `{{#if}}` blocks swallowed or added blank lines, and added a new Handlebars-style comment syntax (`{{!-- ... --}}` / `{{! ... }}`) wired through the engine and builder at all three template-processing points. It also worked through every actionable deferred item from the prior cycle's synthesis: stabilizing flaky `ai-insights` subprocess test suites, reshaping the `ai-insights` build wrapper's five scattered `process.exit` calls into a single testable check-runner, closing a library documentation debt sweep, and updating persona-authoring/manifest documentation across both repositories. A cross-repo baseline-and-diff verification (recovered retroactively via `git stash` since no implementation pipeline existed for that WP) confirmed the only rendered-output differences across all nine `ai-insights` persona target directories are 138 added blank lines, with frontmatter, tool blocks, and all three named bug-report joins verified correct. One minor ledger bookkeeping artifact (a duplicate/paraphrased acceptance-criterion entry on WP-010) remains for PM cleanup, and a version bump plus a v3.0.0 migration guide were deliberately deferred to the maintainer's publish step.

---

### Metrics

| Area | Result |
|---|---|
| `ai-persona-builder` — `npm test` | 665 / 665 passing (36 files) |
| `ai-insights` — `npm test` | 319 / 319 passing (3 consecutive runs, per AC-14) |
| Combined regression (WP-010 final verification) | 984 / 984 passing |
| `ai-persona-builder` typecheck / build | Clean (tsc --noEmit, tsup dual CJS+ESM+DTS) |
| `ai-insights` `build-personas.js --check` | 130 personas processed, 0 errors, 0 warnings, exit 0 |
| `ai-insights` `build-personas.js` (real build) | 130 personas processed, 130 files written, 0 errors/warnings, exit 0 |
| Cross-repo `diff -r` (baseline vs. rebuilt) | 51 files changed, 0 removed lines (`<`), 0 non-blank added lines (`>`), 138 blank lines added, 0 added/removed files |
| Re-run diff after WP-007/008/009/010 landed | Byte-identical to the first diff — no further drift |
| Code review across all 10 WPs | 0 Blocking issues; 1 Fix-Forward (WP-003 timeout-application consistency, applied); 0 Documentation-Forward |
| Rework cycles | WP-003 implementation+QA bounced once (two suites missing shared timeout constant), fixed and re-verified PASS |

**Blockers / Failures / Security Concerns:** None outstanding. The single QA bounce (WP-003) was resolved within the same cycle. No security-audit stage was run in this plan (not in scope); no security issues were reported by any pipeline.

---

### Strategic Recommendations

- **Extend shared parsers via token-stream "views," not duplicated whitespace logic.** WP-005's `stripComments()` filters the WP-001 tokenizer's output to `kind === 'comment'` and reuses `EMPTY_BLOCK_MARKER`/`mergeMarkers` verbatim rather than re-implementing the standalone/inline/blank-run-merge contract in a second module. Flagged by code review as the template to follow for any future third entry point (e.g. a `{{#each}}` or partial-stripping pass) needing the same whitespace contract.
- **Prefer the option that turns a missing step into a test failure, not a silent fallback.** WP-006 deliberately wired `stripComments` at exactly three documented call sites with no backstop inside `resolveConditionals`, specifically because a backstop would mask a missing strip point instead of surfacing it. The new test file proves each strip point independently rather than relying on one end-to-end happy-path test.
- **Descriptor-runner / guard-registry pattern for check aggregation.** WP-007's `runBuildChecks()`/`resolveExitCode()` isolates aggregation-and-exit-code decisions from the five individual check implementations, making "one failing check must not hide a later one" directly testable with synthetic descriptors — a reusable pattern for any multi-check CLI wrapper.
- **Codify durable design patterns in the manifest, not just in synthesis documents.** WP-002 promoted "pure validator / impure orchestrator" (`validateToolParity()` vs. `build()`) and "single capability-map vocabulary" (`TargetDefinition.toolCapabilities`) from the prior cycle's synthesis into `tech-stack.md`'s Key Patterns table, so they now persist as durable architecture references rather than one-off prose that only existed in a synthesis document.
- **Baseline-and-diff acceptance oracles are fragile against incremental commits.** WP-010 had no implementation pipeline, so its step-1 baseline was never captured before the engine changes landed; QA recovered it only because every prior WP's changes were still uncommitted working-tree diffs against one known HEAD. Any future plan using a pre/post-change diff as its acceptance oracle needs an explicit, early baseline-capture step that runs before any WP begins mutating the working tree — not one assumed to be recoverable after the fact.

---

### Code Insights

**Developer**
- Chose a NUL-character sentinel (`EMPTY_BLOCK_MARKER`) resolved in a single end-of-pass regex, instead of threading blank-run state through recursive calls, keeping the renderer a pure linear scan (WP-001).
- Used bracket-matching (a stack computing each `{{#if}}`'s matching `{{/if}}` up front) instead of building an explicit tree object, so malformed-tag pass-through falls out of the algorithm's own LIFO invariants rather than needing special-case branches (WP-001).
- Built a separate `strippedPersonaPartialsMap` rather than mutating the suite-level partials map in place, keeping the strip step visually traceable as its own pipeline stage (WP-006).
- Rewrote in-code comments in `build-personas.js` that happened to contain the literal string `process.exit(` in prose, to keep the new source-text regex test (exactly one call site) simple rather than building a comment-aware parser for the test (WP-007).

**QA**
- WP-001: flagged two low-priority, non-blocking edge cases beyond the committed suite — a literal NUL byte in source text is silently swallowed by the sentinel mechanism (accepted trade-off), and two adjacent emits-nothing blocks leave two blank lines instead of fully collapsing to one (outside AC-02's single-block scope).
- WP-005: identified a coverage gap for empty comment bodies, adjacent standalone comments with no blank line between them, and an end-of-string comment with no trailing newline — all manually verified correct but not covered by a committed regression test.
- WP-007: caught that the implementation also deleted `scripts/lib/cc-tools-validation.js`, outside WP-007's declared scope text; code review later confirmed via filesystem mtimes this predated the WP's own working window by ~5 hours and was a pre-existing state, not new work.
- WP-010: reconstructed the missing baseline via `git stash`/`pop`, ran the strict `diff -r` twice (before and after WP-007–010 landed) and confirmed byte-identical results, and explicitly flagged the fragility of this recovery method for future plans.

**Reviewer**
- WP-005: called out `stripComments()`'s zero-new-whitespace-logic design as a "gold nugget" template for future tokenizer extensions.
- WP-007: applied one Fix-Forward in `health-checks.test.js`, converting four per-`it()` timeout applications to two describe-level applications for consistency with the other seven retrofitted suites; verified via a targeted and a full test run.
- WP-010: independently re-verified the git-stash baseline-recovery methodology left a clean working tree, and flagged the duplicate acceptance-criterion ledger entry for PM cleanup (see Deferred & Follow-Up Items).

**Documentation**
- WP-001, WP-006, WP-007, WP-008, WP-009: each pass ran its own independent gap analysis beyond what code review flagged, catching several stale cross-references that the implementation stage alone had missed — e.g. `api-surface.md`'s `renderFrontmatter()` entry still describing a two-step pipeline after a three-step change landed (WP-006), and two `ai-insights` manifests still describing the pre-WP-007 inline fail-fast `{{agent_slug_*}}` check (WP-007).
- WP-008: executed all 8 illustrative `docs/api.md` code examples directly against the built engine via `tsx` before committing them, catching one incorrect claim about `collapseBlankLines()`'s actual collapsing behavior (3+ blank lines → 2, not → 1).
- WP-008: deliberately removed hand-maintained per-directory test-count annotations from `file-tree.md` and a hardcoded file-count claim from `AGENTS.md`, since embedded counts are exactly the kind of value that drifts on the next test addition — replaced with a pointer to `npm test` as the source of truth.

---

### Deferred & Follow-Up Items

- **[Out-of-scope]** WP-001 (QA) — Two adjacent emits-nothing standalone conditional blocks between paragraphs leave two blank lines instead of collapsing to one. Outside AC-02's scope (single-block behavior only); flagged as worth a future regression test, low priority.
- **[Deferred]** WP-005 (QA) — Coverage gap: empty comment bodies (`{{!----}}` / `{{!}}`), two adjacent standalone comments with no blank line between them, and a standalone comment at end-of-string with no trailing newline are all manually verified correct but lack permanent regression tests. Low priority, candidate for a future test-hardening pass.
- **[Deferred]** WP-003 (Developer) — `scripts/lib/ledger-dirs.js` also calls `spawnSync` (rebuilding `mcp-server/dist` when stale) but has no dedicated `*.test.js` file exercising that path in `scripts/tests/`, so nothing could be retrofitted with the new timeout constant. Noted for completeness only.
- **[Out-of-scope]** WP-003 (Developer) — `claude-cli.test.js`, `npm-link.test.js`, and `health-checks.test.js` genuinely spawn subprocesses but were not named in this WP's scope and none had reported flakiness (`health-checks.test.js` already had its own 15s timeouts). These were later brought in during the QA rework round after QA correctly identified they contradicted the WP's own broader Scope bullet.
- **[Deferred]** WP-006 (Release Engineer) — Before the eventual v3.0.0 publish, a migration guide should be authored for the one breaking change already in `CHANGELOG.md` (validation severity always-fails builds now, not just in `--strict` mode). That change predates WP-006; flagged for whichever WP or release step finalizes the v3.0.0 cut.
- **[Deferred]** WP-006 (Release Engineer) — `package.json` version bump intentionally deferred to the maintainer at final publish time, per `CHANGELOG.md`'s own documented policy for the `v3.0.0 (proposed)` heading, since this plan was not the terminal set of changes against that heading.
- **[Deferred — needs PM action]** WP-010 (QA / Reviewer) — QA's `acceptance_criteria_updates` call paraphrased AC-3's text ("...including that partial" vs. the verbatim "...that includes that partial"), creating a duplicate entry instead of updating the original. WP-010 now shows 5 acceptance-criteria entries instead of 4; the original verbatim criterion is marked `met: true`, but the duplicate paraphrased entry still exists. **Action required:** a Project Manager should call `ledger_update_acceptance_criteria` to remove the duplicate entry. The underlying verification (all 3 `documentation-ownership.md` joins confirmed blank-line-separated in all 9 rendered personas) is independently confirmed correct by both QA and code review — this is a bookkeeping artifact only, not a functional gap.
- **[Process note for future plans]** WP-010 (QA / Reviewer) — This WP had no implementation pipeline, so its required step-1 baseline was never captured by a Developer before the engine changes landed. QA reconstructed it after the fact via `git stash`/`pop`, which only worked because every prior WP's changes were still uncommitted. Flagged for the Planner/PM: any future plan using a pre/post-change diff as an acceptance oracle needs an explicit early baseline-capture step, not one assumed recoverable after other work has already started.
- **[Low-priority traceability note]** Project comments (Documentation/Reviewer, WP-004, WP-005, WP-010) — Three pipeline completions (WP-004 documentation, WP-005 documentation, WP-010 code-review) declared `PASS` without populating `artifacts.files_modified`, even though in two of those three cases no files were actually modified (verification-only passes). Low priority; consider always declaring an explicit empty array for traceability rather than omitting the field.

---

### Next Steps

1. **PM housekeeping:** Run `ledger_update_acceptance_criteria` on WP-010 to remove the duplicate/paraphrased AC-3 entry so the record cleanly shows 4 criteria, all met.
2. **Release planning:** Before cutting `v3.0.0`, author the migration guide for the validation-severity breaking change and decide the final version number — both were deliberately left to the maintainer's publish step by WP-006.
3. **Test hardening (low priority, opportunistic):** Add the permanent regression tests flagged by QA in WP-001 (adjacent emits-nothing blocks) and WP-005 (empty comment bodies, adjacent standalone comments, end-of-string comments).
4. **Planning process improvement:** For any future plan with a pre/post-change diff as its acceptance oracle, schedule an explicit, early, standalone baseline-capture step (its own implementation pipeline) rather than relying on the working tree being recoverable retroactively.
5. **Scope watch:** `scripts/lib/ledger-dirs.js`'s untested `spawnSync` call (noted in WP-003) has no dedicated test file — worth a small follow-up WP if that script's subprocess behavior becomes flaky in the future.
