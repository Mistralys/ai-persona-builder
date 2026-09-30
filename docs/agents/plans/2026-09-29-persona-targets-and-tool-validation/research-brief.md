# Research Brief

## Scope Sketch

- Persona Builder — build orchestration — `ai-persona-builder/src/builders/` — modification (per-persona target filtering, persona pre-scan, validation wiring, build success semantics)
- Persona Builder — target registry — `ai-persona-builder/src/targets/` — modification (per-target tool metadata: tools key, dispatch tools, foreign notation)
- Persona Builder — validators and engine — `ai-persona-builder/src/validators/`, `ai-persona-builder/src/engine/partials.ts` — new code + modification (tool requirement validator, sub-agent validator relocation, partial reference collection)
- Persona Builder — CLI — `ai-persona-builder/src/cli.ts` — modification (summary output, exit code)
- Persona Builder — tests, fixtures, docs — `ai-persona-builder/tests/`, `ai-persona-builder/docs/` — new code + modification
- AI Insights — persona build wrapper and validators — `ai-insights/scripts/build-personas.js`, `ai-insights/scripts/lib/`, `ai-insights/scripts/tests/` — modification + removal (retire the logic that moves to the library)
- AI Insights — persona build config — `ai-insights/personas/persona-build.config.js` — modification (declare handoff tool requirements)
- AI Insights — dev linking — `ai-insights/personas/node_modules/@mistralys/persona-builder` — integration (temporary symlink to the local library)
- AI Insights — docs — `ai-insights/AGENTS.md`, `ai-insights/CLAUDE.md`, `ai-insights/personas/docs/`, `ai-insights/personas/changelog.md` — modification

## Area: Persona Builder — build orchestration

### Verified References
- `ai-persona-builder/src/builders/persona-builder.ts` (L83–L93): `discoverSuitePersonaYamls(suiteConfig)` lists `meta/*.yaml` except `_`-prefixed files, sorted.
- `ai-persona-builder/src/builders/persona-builder.ts` (L119–L135): `loadPersonaYaml()` parses YAML and derives `name` from the filename stem if absent.
- `ai-persona-builder/src/builders/persona-builder.ts` (L194–L236): `buildAgentNameMap(config)` is a pre-scan that already loads **every** persona YAML of every suite once to produce `agent_<slug>` and `agent_slug_<slug>` keys. It knows slug, name and version but not targets.
- `ai-persona-builder/src/builders/persona-builder.ts` (L271–L380): `buildContext()` — the 7-layer merge. Tool fallbacks are inline: `cc_tools` falls back to `tools` (L312), `da_tools` falls back to `tools` (L346). `default_cc_tools` from `_shared.yaml` is **never** read by the library.
- `ai-persona-builder/src/builders/persona-builder.ts` (L398–L420): `validateSubagentRefs(persona, agentMap)` — internal (not exported), emits an error per unknown sub-agent slug. Target-agnostic.
- `ai-persona-builder/src/builders/persona-builder.ts` (L474–L583): `buildPersona(...)` pipeline; plugins' `onBuildContext` runs at L504, `onPersonaPartials` at L511, raw body template loaded at L528, validation at L545–L548 (plugin results + sub-agent refs). The raw template and the persona-scoped partials map are both in scope at the validation step.
- `ai-persona-builder/src/builders/persona-builder.ts` (L615–L673): `buildSuite(...)` loads `_shared.yaml`, partials, fires `onSuiteInit`/`onPartials`, then calls `buildPersona()` for **every** discovered YAML — no per-persona target filtering exists.
- `ai-persona-builder/src/builders/persona-builder.ts` (L698–L746): `build(config)` — targets = `config.targets ?? registry defaults`; `success = !config.strict || strictFailures.length === 0`. **Error-severity results do not fail a non-strict build.**
- `ai-persona-builder/src/builders/types.ts` (L1–L203): `BuildConfig` (suites, sharedPartialsDir, plugins, targets, check, strict, frontmatter, variables, partials, targetRegistry), `BuildResult` (suite, target, personaYamlPath, outputPath, content, validationResults, written), `BuildSummary` (success, results, strictFailures, totalBuilt, totalWritten).
- `ai-persona-builder/src/plugins/types.ts` (L44–L65): `PersonaMetadata` — `name`, `displayName`, `description`, `version`, `tools`, `subagents`, index signature. No `targets`, `cc_tools`, `da_tools` typed fields.
- `ai-persona-builder/src/plugins/types.ts` (L158–L163): `ValidationResult { severity: 'error'|'warning'|'info'; message }`.
- `ai-persona-builder/src/builders/index.ts`, `ai-persona-builder/src/index.ts`: barrel exports; `index.ts` re-exports all layers.

### Established Patterns
- Pre-scan once in `build()`, pass derived data down to `buildSuite()`/`buildPersona()` as an optional trailing parameter with a default — `ai-persona-builder/src/builders/persona-builder.ts` (`agentMap` parameter).
- Optional trailing `registry` parameter defaulting to `defaultRegistry`, with the documented "two-registry limitation" — `persona-builder.ts` L466–L471.
- Validation outcomes travel as `ValidationResult[]` on `BuildResult.validationResults`.

### Structural Observations
- `persona-builder.ts` `buildAgentNameMap()`: the only persona pre-scan, but it discards everything except name/slug/version. Any new cross-persona knowledge (targets per slug) would need a second full scan unless it is reshaped into a general persona index.
- `persona-builder.ts` `validateSubagentRefs()`: lives in the builder file, while `docs/agents/project-manifest/api-surface.md` (L332) lists it under **Validator Functions** — manifest/code drift.
- `persona-builder.ts` `buildContext()`: the `cc_tools → tools` and `da_tools → tools` fallback rules are hard-coded per target name; a validator that needs "the effective tool list for target X" would have to duplicate them. AI Insights' own validator already duplicated them **wrongly** (it assumes a third `default_cc_tools` fallback the library never applies — see AI Insights area).
- `persona-builder.ts` `build()`: error-severity results are silently ignored unless `strict` is set, so the existing unknown-sub-agent error never fails a normal build.

### Constraints
- `ai-persona-builder/AGENTS.md`: breaking changes must be documented before implementation and flagged; plugin runner must stay synchronous; new engine functions must remain import-free.
- `buildPersona()` and `buildSuite()` are public API — new parameters must be optional and trailing.

## Area: Persona Builder — target registry

### Verified References
- `ai-persona-builder/src/targets/types.ts` (L17–L63): `TargetDefinition { name; outputDirKey; filenameContextKey?; defaultFrontmatter; contextFlags?; defaultEnabled? }`. Constants `TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, `TARGET_DEEP_AGENTS`.
- `ai-persona-builder/src/targets/built-in.ts` (L40–L64): `defaultRegistry` registers vscode (`vs_file_name`), claude-code (`cc_file_name`), deep-agents (`da_file_name`, `defaultEnabled: false`).
- `ai-persona-builder/src/targets/registry.ts`: `TargetRegistry` with `register`, `get` (throws on unknown), `has`, `names`, `allDefinitions`, `clone`.
- `ai-persona-builder/src/targets/registry.ts` (L100, L109–L115): `allDefinitions()` returns `{ ...def }` copies and `clone()` registers `{ ...def }` copies — both are shallow spreads, so any nested array/object field on a definition (and any `RegExp` instance) would be shared between the original and the copy. (Added during design-review integration, 2026-09-29.)
- `ai-persona-builder/docs/target-differences.md` (L40–L110): VS Code tool names are semantic lowercase (`agent` = sub-agent invocation), MCP in VS Code uses `server/tool` / `server/*`; Claude Code names are capitalised (`Task` = sub-agent invocation), MCP uses `mcp__server__tool`. The doc calls tool notation "the #1 source of mistakes".
- `ai-persona-builder/docs/target-differences.md` (L200–L204): Claude Code `tools` omitted = inherit all tools from the parent session.

### Established Patterns
- Declarative per-target metadata on `TargetDefinition`, consumed via registry lookup rather than `if (target === ...)` branches — `src/targets/built-in.ts`, `resolveOutputDir()` in `persona-builder.ts` L156–L178.

### Structural Observations
- `TargetDefinition` has no notion of which context key holds the target's tool list, nor which tool grants sub-agent dispatch. Both are target facts currently encoded as target-name branches (`buildContext`) or not at all.

### Constraints
- Custom targets registered by consumers must keep working without declaring the new optional fields.

## Area: Persona Builder — validators and engine

### Verified References
- `ai-persona-builder/src/validators/index.ts`: exports `validateFileName`, `validateStrictMarkers` only.
- `ai-persona-builder/src/validators/strict-validator.ts` (L1–L55): pure-function validator pattern — inputs in, `ValidationResult[]` out, only imports the type.
- `ai-persona-builder/src/engine/partials.ts` (L1–L49): `resolvePartials(text, partialsMap, depth=0)` — `{{> name}}` regex `/\{\{> ([\w-]+)\}\}/g`, recursion capped at depth 2, zero imports.
- `ai-persona-builder/src/utils/regex.ts`: `escapeRegExp(str)`.

### Established Patterns
- Validators are pure and live one-per-file in `src/validators/` — `src/validators/strict-validator.ts`.
- Engine files carry a zero-import invariant (repository insight `e41ef85e…` for `variables.ts`; `constraints.md` §1).

### Structural Observations
- No way to ask "which partials does this template include (transitively)?" — AI Insights re-implements a single-level regex against raw content (`HANDOFF_PARTIAL_RE` in `ai-insights/scripts/lib/cc-tools-validation.js`).

### Constraints
- Partial reference collection must mirror `resolvePartials()`'s depth cap so a validator never "sees" a partial the renderer would not expand.

- [added by: Plan Auditor, verified by Planner in rework] `ai-persona-builder/src/builders/persona-builder.ts` (L544–L548): validation step 10 currently calls `validateSubagentRefs(personaMetaTyped, agentMap)`; `docs/agents/project-manifest/api-surface.md` L64 documents that an empty `agentMap` (the default) skips the check.
- [added in rework, verified] `ai-persona-builder/src/builders/persona-builder.ts` L474–L485 / L615–L623: `buildPersona(…, target, agentMap = {}, registry = defaultRegistry)` and `buildSuite(…, target, agentMap = {}, registry = defaultRegistry)`. The current last trailing parameter is `registry`, not `agentMap`. L359: `buildContext()` also merges `agentMap` entries into the context (layer 6, `agent_*` variables), so `agentMap` has a rendering role beyond validation. L398–L420: the check is skipped when `subagents` is absent or empty, and an unknown slug is detected by the missing `agent_slug_{underscored}` key (so an empty map flags nothing).
- [added in rework, verified] `ai-persona-builder/tests/builders/subagent-validation.test.ts`: two describe blocks. `buildPersona()` cases (L142–L282) pass an explicit `agentMap` (no subagents; all known; one unknown; several unknown; hyphen → underscore lookup). `build()` strict-mode cases (L283+) cover throw on unknown and success on valid.
- [added by: Plan Auditor, unverified] `ai-insights/personas/ledger-support/src/meta/ledger-claude-coordinator.yaml` (L61–L79): `targets: [claude-code]` and `subagents` 2-project-manager..7-release-engineer; all `ai-insights/personas/*/src/meta/*.yaml` (non-`_`) declare an explicit `cc_tools`.

## Area: Persona Builder — CLI

### Verified References
- `ai-persona-builder/src/cli.ts` (L67–L125): hand-rolled arg parser (`--config`, `--check`, `--strict`, `--help`, `--version`); unknown flags warn.
- `ai-persona-builder/src/cli.ts` (L217–L232): `printSummary()` prints only `strictFailures`; non-strict error results are never printed.
- `ai-persona-builder/src/cli.ts` (L276–L290): exit 1 only when `!summary.success` or `build()` throws.

### Established Patterns
- No CLI framework; summary printed with fixed labels.

### Structural Observations
- `printSummary()`: the user never sees error/warning results in a non-strict build — the output channel for any new validation is missing.

### Constraints
- Output labels are stable text; tests (if any) of CLI output must be updated with them. No CLI test file exists in `tests/`.

## Area: Persona Builder — tests, fixtures, docs

### Verified References
- `ai-persona-builder/tests/helpers/suite-fixture.ts`: `createMinimalSuite(tmpDir, options)` builds a temp suite (shared by builder tests).
- `ai-persona-builder/tests/builders/subagent-validation.test.ts`, `tests/builders/tools-block-fields.test.ts`, `tests/targets/target-registry.test.ts`, `tests/engine/partials.test.ts`, `tests/integration/build.test.ts`: existing homes for the new assertions.
- `ai-persona-builder/fixtures/integration-suite/` (content + meta for `persona-alpha`, `persona-beta`).
- `ai-persona-builder/AGENTS.md` Manifest Maintenance Rules table: validator → `api-surface.md` + `file-tree.md`; builder → `api-surface.md` + `data-flows.md`; exported type → `api-surface.md`; new file → `file-tree.md`; CLI → `api-surface.md` + README; limitation → `constraints.md`. Stats block states "236 tests across 15 files".
- User docs: `docs/metadata-reference.md` (Tier 4c Sub-Agent Declarations), `docs/configuration.md` (BuildConfig / BuildSummary), `docs/target-differences.md` (§4 tools vs cc_tools, §7 mistakes checklist), `docs/cli.md`, `README.md`, `CHANGELOG.md`.

### Established Patterns
- Temp-directory fixtures per test via `createMinimalSuite` — `tests/helpers/suite-fixture.ts`.

### Structural Observations
- Working copy has uncommitted edits in `docs/agents/project-manifest/README.md`, `docs/agents/project-manifest/constraints.md`, `docs/metadata-reference.md` (git status). `package.json` version reads `2.5.1` while tag `v2.6.0` exists and CHANGELOG tops at `v2.6.1`.
- Semver exposure (added during design-review integration, 2026-09-29): the package is published on npm, and the only known consumer declares `^2.6.0` (`ai-insights/personas/package.json` L12), so any 2.x minor/patch release is picked up by a plain `npm install`. `ai-persona-builder/AGENTS.md` Failure Protocol requires a breaking change to be documented and flagged, never implemented silently.

### Constraints
- Do not overwrite the user's uncommitted doc edits; edit on top of them.
- Versioning and publishing are the user's (see Human Actions in the plan).

## Area: AI Insights — persona build wrapper and validators

### Verified References
- `ai-insights/scripts/build-personas.js` (L1–L63): pre-cleans every suite output dir (`*.md`) on real builds, then runs the library CLI from `personas/node_modules/@mistralys/persona-builder/dist/cli.js`.
- `ai-insights/scripts/build-personas.js` (block "validate cc_tools / subagents consistency"): calls `validateCcToolsInDirs(suiteMetas)` and exits 1 on errors.
- `ai-insights/scripts/build-personas.js` (block "per-persona targets and rendered sub-agent references"): loads `dist/index.cjs`, runs `build({ ...config, check: true })`, on real builds **deletes** output files for targets not in the persona's `targets` (render-then-prune), then runs `validateSubagentReferences(summary.results)`.
- `ai-insights/scripts/lib/cc-tools-validation.js`: `validateCcTools(yamlText, filename, sharedDefault, contentText)` — requires `Task` in the effective CC list when the persona declares `subagents` or its content includes `{{> handoff-block-claude-code}}`. Effective list: `cc_tools` → `tools` → `_shared.yaml default_cc_tools` (the third step disagrees with the library). Only Claude Code is checked — the VS Code `agent` tool is never checked.
- `ai-insights/scripts/lib/subagent-reference-validation.js`: `TARGETS` constant, `resolvePersonaTargets(yamlText)` (absent/empty → all three; unknown names reported), `collectPersonas(results)`, `checkRenderedReferences(...)` (declared-but-unreferenced, wrong selector, label-only dispatch, and "declares sub-agent not built for target"), `validateSubagentReferences(results)`.
- `ai-insights/scripts/tests/cc-tools-validation.test.js` (8 cases), `ai-insights/scripts/tests/subagent-reference-validation.test.js` (incl. `resolvePersonaTargets` and target-skip cases).
- `ai-insights/personas/package.json`: `"@mistralys/persona-builder": "^2.6.0"`; installed copy is `2.6.0` as a real directory under `personas/node_modules/@mistralys/persona-builder`. `/personas/node_modules/` is gitignored (`ai-insights/.gitignore` L18).
- `ai-insights/personas/ledger-support/src/meta/ledger-claude-coordinator.yaml`: the only persona declaring `targets: [claude-code]`.
- Personas with `subagents` all carry `agent` in VS Code `tools` and (after v3.38.1) `Task` in `cc_tools`. Ledger personas 2–8 include `{{> handoff-block-vscode}}` and `{{> handoff-block-claude-code}}` inside `{{#if}}`/`{{else if target_claude_code}}` branches (e.g. `ai-insights/personas/ledger/src/content/3-developer.md` L148–L152).
- `ai-insights/personas/ledger/src/partials/handoff-block-vscode.md`: instructs `runSubagent` — i.e. the VS Code handoff needs the `agent` tool, which the current validator never checks.
- `ai-insights/personas/ledger/src/partials/handoff-block-claude-code.md`: the Claude Code handoff (needs `Task`).

### Established Patterns
- Build-time validations extracted into `scripts/lib/` with fixture tests in `scripts/tests/` (repository insight `e832d2f4-7ace-4126-80c3-7f5be5ff62bd`).
- Validator blocks in `build-personas.js` print `[ERROR] …` and `process.exit(1)`.

### Structural Observations
- `cc-tools-validation.js`: duplicates library tool-resolution rules and got them wrong (`default_cc_tools` fallback); Claude-Code-only; hard-codes one partial name.
- `subagent-reference-validation.js`: owns `targets` resolution (`TARGETS`, `resolvePersonaTargets`) that is a library concern; hard-codes the three target names.
- `build-personas.js`: render-then-prune for excluded targets — the library renders and (via the CLI) writes files that the wrapper then deletes.

### Constraints
- Rendered-prose checks (selector argument names `agentName` / `subagent_type`, label-only dispatch patterns) are AI Insights content conventions, not library concerns.
- Generated persona output is gitignored; the wrapper's in-memory `build()` is the only reliable view of rendered output.

## Area: AI Insights — tool capability parity (simulation)

A throwaway simulation compared each persona's VS Code `tools` with its effective Claude Code list (`cc_tools` → `tools`), for personas built for both targets. It used this rough map:
- execute: `execute` / `Bash`
- read: `read` / `Read`
- edit: `edit` / `Edit`, `Write`
- search: `search` / `Grep`, `Glob`
- web: `web` / `WebFetch`, `WebSearch`
- dispatch: `agent` / `Task`, `Agent`
- todo: `todo` / `TodoRead`, `TodoWrite`
- MCP: `server/*` / `mcp__server`

### Verified References
- `todo` flags 11 personas: ledger 1–9, `standalone/ctx-architect.yaml` and `standalone/module-intent-architect.yaml`. Each grants VS Code `todo` but no Claude Code `TodoRead`/`TodoWrite`.
- In the other direction, `ledger-bootstrapper.yaml`, `ledger-knowledge-archiver.yaml` and `ledger-knowledge-curator.yaml` grant Claude Code `TodoRead`/`TodoWrite` but no VS Code `todo`. All 11 personas above already have explicit `cc_tools` lists.
- Findings outside `todo`:
  - `ai-insights/personas/ledger/src/meta/1-planner.yaml` — VS Code grants `agent`, Claude Code has no `Task`. The planner has no `subagents` and its content never dispatches (`grep` of `ledger/src/content/1-planner.md`: 0 hits).
  - `ai-insights/personas/ledger-support/src/meta/ledger-orchestrator-runner.yaml` — Claude Code grants `Task`, VS Code has no `agent`. No `subagents`; the content never dispatches (0 hits).
  - `ai-insights/personas/standalone/src/meta/plan-refiner.yaml` — VS Code grants `web`, Claude Code has none. The `cc_tools` comment says "no Write, no web access" on purpose.
  - `ai-insights/personas/standalone/src/meta/web-gui-specialist.yaml` — Claude Code grants `WebFetch`/`WebSearch`, VS Code has `browser` but no `web`.
  - `ai-insights/personas/ledger-support/src/meta/ledger-bootstrapper.yaml` — VS Code `[vscode, execute, read, search, central_pm/*]`. Claude Code additionally grants `Edit`, `Write`, `WebFetch`, `WebSearch`.
  - `ai-insights/personas/ledger-support/src/meta/ledger-knowledge-archiver.yaml` — VS Code `[vscode, read, edit, search, central_pm/*]`. Claude Code additionally grants `Bash`, `WebFetch`, `WebSearch`.
  - `ai-insights/personas/ledger-support/src/meta/ledger-knowledge-curator.yaml` — VS Code `[vscode, read, search, central_pm/*]`. Claude Code additionally grants `Bash`, `Edit`, `Write`, `WebFetch`, `WebSearch`.
- The MCP mapping produced no mismatch: every `central_pm/*` pairs with `mcp__central_pm`. No foreign-notation tool appears in any effective Claude Code list today.
- `ai-insights/personas/standalone/src/meta/developer.yaml` comment sets a precedent: "no WebFetch/WebSearch, matching the vscode grant (no `web` tool)". Claude Code lists are aligned to the VS Code grant.

### Established Patterns
- Least-privilege alignment of `cc_tools` to the VS Code grant — `standalone/src/meta/developer.yaml`.

### Structural Observations
- The three ledger-support Claude Code lists match a generic default rather than each persona's VS Code grant. This looks like copy-paste rather than intent.

### Constraints
- Changing a persona's tool list changes its rendered output. The persona's integrated YAML `changelog` needs a new entry.

## Area: AI Insights — persona build config

### Verified References
- `ai-insights/personas/persona-build.config.js`: CJS config; `targets: ['vscode', 'claude-code', 'deep-agents']`, three suites, `ledgerPlugin(...)`; loaded both by the CLI and by `build-personas.js` via `_require(CONFIG)`.

### Established Patterns
- Plain-object config consumed by both the library CLI and the wrapper.

### Structural Observations
- New code only in this file (one added config key) — no existing structure reshaped.

### Constraints
- The config must stay loadable by the published library version too (unknown keys are ignored by `build()` because `BuildConfig` is read by property).

## Area: AI Insights — dev linking

### Verified References
- `ai-insights/personas/node_modules/@mistralys/persona-builder/` — real directory (installed 2.6.0).
- `ai-insights/scripts/build-personas.js` resolves the library only through that path (`CLI` constant and the `index.cjs` require).
- Library lives at `STABLE/ai-persona-builder/`; from `ai-insights/personas/node_modules/@mistralys/` the relative path is `../../../../ai-persona-builder`.
- `ai-insights/scripts/lib/npm-link.js`: unrelated (global link of the `ai-insights` CLI binary).

### Established Patterns
- None for linking the persona builder — this is a temporary developer setup.

### Structural Observations
- New setup only — no existing structure reshaped.

### Constraints
- The symlinked library executes from `dist/`, so the library must be rebuilt (`npm run build`) after every source change before AI Insights sees it.
- `package.json` / `package-lock.json` of `ai-insights/personas` must not change (the user updates the dependency after release).

## Area: AI Insights — docs

### Verified References
- `ai-insights/AGENTS.md` L419–L420 and `ai-insights/CLAUDE.md` L421–L422: script table rows for `cc-tools-validation.js` and `subagent-reference-validation.js`.
- `ai-insights/personas/docs/agents/project-manifest/constraints.md` L204–L205: dispatch/`Task` rule and rendered-check rule.
- `ai-insights/personas/docs/agents/project-manifest/api-surface.md` L33–L35 (validations list), L46 (`targets` config), L222 and L462 (`targets` persona field: "The library renders every target regardless…").
- `ai-insights/personas/docs/persona-build-system.md` L777 (`targets` config row).
- `ai-insights/AGENTS.md` Changelog Convention: module changelog `personas/changelog.md` is summary-only; root `changelog.md` aggregates at release.
- `ai-insights/AGENTS.md` Generated Context Docs: `node scripts/cli.js ctx-generate` regenerates `.context/` (tracked).

### Established Patterns
- Manifest Maintenance Rules (Personas): build-script function change → `api-surface.md`.

### Structural Observations
- Several persona YAML comments state "the builder resolves cc_tools from cc_tools → tools (never default_cc_tools)" — still true after this plan.

### Constraints
- `personas/changelog.md` entries are outcome-only, one line per theme.

## Strategic Context

- `ai-persona-builder` has no declared strategic vision; prior projects (extensible targets, dynamic partials, else-if, variable escape) all extended the library declaratively via the registry/config — this plan continues that line.
- `ai-insights` long-term goal: "Personas First" and reliability on target environments. Moving target/tool invariants into the library makes them available to every consumer and removes duplicated, already-drifted rule copies.
- Relevant insights:
  - `e832d2f4-7ace-4126-80c3-7f5be5ff62bd` (ai-insights) — "Extract build-time validations into scripts/lib/…"; states all future build-time validations follow that pattern and that plugin validation "only emits warnings and cannot fail the build unconditionally". Both claims are affected by this plan.
  - `e41ef85e-495a-48e5-a3be-138759930fb0` (ai-persona-builder) — engine zero-import invariant; constrains where partial-reference collection may live.
  - `7d13934f-9d72-4156-9616-15741f3e8f94` (global) — validation has a hard ceiling; mechanical checks only. Supports keeping prose-pattern checks in AI Insights and only structural tool/target checks in the library.
