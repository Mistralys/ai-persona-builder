
# Plan

## Summary

Follow-up rework plan addressing all four strategic recommendations from the `2026-04-08-elseif-support` synthesis. The work spans both workspaces: a micro-optimization and test hygiene pass in `ai-persona-builder-DEV`, a critical version bump fix, and a template modernisation sweep across 8 persona content files in `ai-insights-DEV`.

## Architectural Context

### ai-persona-builder-DEV

- **`src/engine/conditionals.ts`** — Pure template-engine module containing:
  - `NO_NESTED_IF` (module-level regex constant, line 18)
  - `resolveElseIf()` (internal pre-processor, lines 42–63)
  - `resolveConditionals()` (public export, lines 102–140)
- **`tests/engine/conditionals.test.ts`** — 326 tests, structured as:
  - A root `describe('resolveConditionals()')` block with 5 sections using `// ---` comment dividers (Basic, Unknown flags, Multiline, Multiple blocks, Nested, Edge cases)
  - A separate `describe('resolveConditionals() — {{else if}} chains')` block (10 tests, idiomatic style)
- **`package.json`** — version field reads `2.1.3`
- **`CHANGELOG.md`** — top entry is v2.3.0 (with v2.2.0 also preceding it)
- **`dist/`** — stale build artifacts (source maps still contain pre-`{{else if}}` code)

### ai-insights-DEV

- **`personas/ledger/src/content/`** — 9 persona content templates (1-planner through 9-synthesis)
- **`personas/standalone/src/content/`** — standalone persona templates (e.g., workflow-orchestrator.md)
- The ai-insights workspace uses `@mistralys/persona-builder` to build persona output from these templates
- Templates currently use **three separate sequential `{{#if}}`** blocks to discriminate between `target_vscode`, `target_deep_agents`, and `target_claude_code` — these are consolidation candidates for `{{else if}}` flat chains

## Approach / Architecture

Four independent work items, each addressing one synthesis recommendation:

1. **Regex micro-optimization** — Promote the `resolveElseIf()` regex pattern from a function-local `new RegExp()` call to a module-level constant alongside the existing `NO_NESTED_IF`. Trivial, zero-risk change.

2. **Test style migration** — Convert the 5 inline-comment section dividers in the root `describe` block of `conditionals.test.ts` to idiomatic nested `describe` blocks, matching the style already used by the `{{else if}}` test suite.

3. **Version bump fix** — Update `package.json` version from `2.1.3` to `2.3.0` to match CHANGELOG, then rebuild `dist/` to produce fresh artifacts.

4. **ai-insights template modernisation** — Refactor 11 three-sequential-block patterns across 8 persona content files to use `{{else if}}` flat chains. This directly unlocks the `{{else if}}` feature for its primary consumer.

## Rationale

- Items 1–3 are library-internal hygiene tasks flagged by the synthesis. Each is low-risk and independently valuable.
- Item 4 is the synthesis's highest-priority strategic recommendation: the entire `{{else if}}` feature was built to simplify exactly these persona templates. Applying the new syntax now validates the feature end-to-end in production templates and reduces template complexity by ~33% per three-way branch (3 blocks → 1 block).

## Detailed Steps

### Step 1 — Regex micro-optimization (`ai-persona-builder-DEV`)

1. In `src/engine/conditionals.ts`, extract the regex pattern currently constructed inside `resolveElseIf()` (lines 47–50) to a module-level `const ELSE_IF_PATTERN` alongside `NO_NESTED_IF`.
2. Update `resolveElseIf()` to reference `ELSE_IF_PATTERN` instead of constructing a new `RegExp` on every call.
3. Run `npm test` — all 326 tests must pass.

### Step 2 — Test style migration (`ai-persona-builder-DEV`)

1. In `tests/engine/conditionals.test.ts`, wrap each `// ---` comment section inside the root `describe('resolveConditionals()')` block in a nested `describe()`:
   - `describe('basic truthy/falsy resolution', () => { … })`
   - `describe('unknown / absent flags', () => { … })`
   - `describe('multiline content', () => { … })`
   - `describe('multiple blocks in one string', () => { … })`
   - `describe('nested conditionals', () => { … })`
   - `describe('edge cases', () => { … })`
2. Remove the `// ---` comment dividers.
3. Run `npm test` — all 326 tests must pass with no changes to test logic.

### Step 3 — Version bump fix (`ai-persona-builder-DEV`)

1. Update `package.json` version from `"2.1.3"` to `"2.3.0"`.
2. Run `npm run build` to regenerate `dist/` with fresh artifacts.
3. Run `npm test` to confirm nothing broke.
4. Verify the CLI reports the correct version: `node dist/cli.js --version` → `2.3.0`.

### Step 4 — ai-insights template modernisation (`ai-insights-DEV`)

For each of the 11 three-sequential-block patterns identified below, refactor from:

```markdown
{{#if target_vscode}}
  …vscode content…
{{/if}}
{{#if target_deep_agents}}
  …deep-agents content…
{{/if}}
{{#if target_claude_code}}
  …claude-code content…
{{/if}}
```

To the equivalent `{{else if}}` flat chain:

```markdown
{{#if target_vscode}}
  …vscode content…
{{else if target_deep_agents}}
  …deep-agents content…
{{else}}
  …claude-code content…
{{/if}}
```

> Note: The final branch (typically `target_claude_code`) becomes the `{{else}}` fallback — this is correct because exactly one of the three target flags is true at build time.

**Files and locations:**

| # | File | Approximate Lines | Pattern Description |
|---|------|-------------------|---------------------|
| 1 | `personas/ledger/src/content/2-project-manager.md` | 54–72 | Step 3: WP Decomposer sub-agent |
| 2 | `personas/ledger/src/content/2-project-manager.md` | 73–87 | Step 4: Dependency Sequencer sub-agent |
| 3 | `personas/ledger/src/content/2-project-manager.md` | 92–107 | Step 5: Pipeline Configurator sub-agent |
| 4 | `personas/ledger/src/content/2-project-manager.md` | 113–128 | Step 6: Ledger Bootstrapper sub-agent |
| 5 | `personas/ledger/src/content/2-project-manager.md` | 140–154 | Step 10: Handoff blocks |
| 6 | `personas/ledger/src/content/3-developer.md` | 143–157 | Step 6: Handoff blocks |
| 7 | `personas/ledger/src/content/4-qa.md` | 85–99 | Step 7: Handoff blocks |
| 8 | `personas/ledger/src/content/5-security-auditor.md` | 73–81 | Step 7: Handoff blocks |
| 9 | `personas/ledger/src/content/6-reviewer.md` | 88–100 | Step 8: Handoff blocks |
| 10 | `personas/ledger/src/content/7-release-engineer.md` | 102–111 | Step 9: Handoff blocks |
| 11 | `personas/ledger/src/content/8-documentation.md` | 86–100 | Step 8: Handoff blocks |

After all refactors:
1. Rebuild personas: `node scripts/build-personas.js` from the `ai-insights-DEV` workspace root.
2. Verify with `node scripts/build-personas.js --check` that generated output matches expectations.
3. Spot-check 2–3 generated output files to confirm correct branch selection for each target.

## Dependencies

- Step 1 and Step 2 are independent of each other and of Steps 3 and 4.
- Step 3 (version bump) should be done before Step 4, so that ai-insights consumes the correctly versioned library.
- Step 4 depends on the `{{else if}}` feature being available in the persona-builder (already shipped in the prior plan — no code change needed).

## Required Components

### ai-persona-builder-DEV
- `src/engine/conditionals.ts` (Steps 1)
- `tests/engine/conditionals.test.ts` (Step 2)
- `package.json` (Step 3)
- `dist/` (Step 3 — rebuilt)

### ai-insights-DEV
- `personas/ledger/src/content/2-project-manager.md` (Step 4)
- `personas/ledger/src/content/3-developer.md` (Step 4)
- `personas/ledger/src/content/4-qa.md` (Step 4)
- `personas/ledger/src/content/5-security-auditor.md` (Step 4)
- `personas/ledger/src/content/6-reviewer.md` (Step 4)
- `personas/ledger/src/content/7-release-engineer.md` (Step 4)
- `personas/ledger/src/content/8-documentation.md` (Step 4)

## Assumptions

- Exactly one target flag (`target_vscode`, `target_deep_agents`, or `target_claude_code`) is true at build time. The `{{else}}` fallback is therefore safe for the last branch.
- The three-sequential-block pattern is semantically equivalent to a three-way `{{else if}}` chain because the template engine only enables one target flag per build.
- No other consumers of `CHANGELOG.md` or `package.json` version need updating beyond the two files themselves (the library is consumed via npm link or local path — no published registry to update).

## Constraints

- **Zero-dependency engine invariant**: Step 1 must not introduce any imports into `src/engine/conditionals.ts`.
- **ai-insights generated files**: Never edit generated output in `personas/ledger/vs-code/`, `personas/ledger/claude-code/`, or `personas/ledger/deep-agents/` — only edit the source templates in `personas/ledger/src/content/`.
- **Test count must stay at 326**: Steps 1 and 2 must not add or remove tests.
- **Cross-platform**: No path-separator assumptions or OS-specific code.

## Out of Scope

- Refactoring simple two-way `{{#if}}…{{else}}…{{/if}}` blocks that only discriminate between two targets (these are already clean).
- Refactoring standalone persona templates (`personas/standalone/src/content/`) — these currently have only two-way conditionals, not three-way.
- Adding new tests beyond what already exists (Step 2 restructures existing tests only).
- Publishing a new npm release of persona-builder.
- Updating ai-insights-DEV changelogs (separate workflow step).

## Acceptance Criteria

- `npm test` in `ai-persona-builder-DEV` passes with 326 tests.
- `package.json` version reads `2.3.0`.
- `node dist/cli.js --version` outputs `2.3.0`.
- `resolveElseIf()` in `conditionals.ts` no longer constructs a regex per call.
- `conditionals.test.ts` contains no `// ---` comment-divider sections; all sections use nested `describe()` blocks.
- All 11 three-sequential-block patterns in ai-insights persona templates are replaced with `{{else if}}…{{else}}…{{/if}}` flat chains.
- `node scripts/build-personas.js --check` in `ai-insights-DEV` exits 0 (no stale output).
- Spot-check: generated VS Code, Deep Agents, and Claude Code output files for at least one persona contain the correct target-specific content.

## Testing Strategy

| Step | Verification |
|------|-------------|
| 1 — Regex optimization | `npm test` (326 pass), manual inspection of `conditionals.ts` |
| 2 — Test migration | `npm test` (326 pass), verify `describe` nesting in test output |
| 3 — Version bump | `npm run build`, `npm test`, `node dist/cli.js --version` |
| 4 — Template refactor | `node scripts/build-personas.js`, `--check` mode, spot-check 2–3 outputs per target |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Regex hoisting changes `lastIndex` semantics** | The existing regex uses the `'g'` flag; hoisting to module level means `lastIndex` persists between calls. However, `String.prototype.replace()` resets `lastIndex` on each call, so this is safe. Confirm with a test that calls `resolveElseIf()` twice in succession. |
| **Three-sequential blocks are not exactly equivalent to `{{else if}}`** | They are equivalent when exactly one target flag is true (guaranteed by the build system's target injection). If none or multiple flags were true, behaviour would differ — but this cannot happen in the current architecture. Document the assumption in the plan. |
| **Version bump breaks downstream consumer** | ai-insights-DEV consumes persona-builder via local path. The version bump is a SemVer-consistent increment (2.1.3 → 2.3.0 minor, no public API breakage). No risk to downstream. |
| **Stale `dist/` forgotten** | Step 3 explicitly runs `npm run build`. The pre-commit hook in ai-persona-builder does not currently guard dist freshness, but the explicit build step covers this. |
