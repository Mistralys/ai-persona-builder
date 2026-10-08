# Constraints & Conventions

> **Scope:** Architectural invariants, naming rules, and known limitations of the library itself.
> Conventions for authoring the manifest documents live in the [manifest README](README.md).

## Contents

- [Architectural Invariants](#architectural-invariants)
- [Naming Conventions](#naming-conventions)
- [Template Syntax](#template-syntax)
- [package.json Path Conventions](#packagejson-path-conventions)
- [Sub-Agent Validation Constraints](#sub-agent-validation-constraints)
- [Known Limitations](#known-limitations)
- [Directory Convention](#directory-convention)
- [Test Suite](#test-suite)

---

## Architectural Invariants

### 1. Zero-Dependency Engine Layer — MUST preserve

All five engine modules (`partials.ts`, `conditionals.ts`, `variables.ts`, `postProcessor.ts`, `serializer.ts`) have **zero imports** — no Node built-ins, no external packages, no internal cross-module references. This makes the engine fully portable to browser environments or non-Node runtimes.

> Any new function added to `src/engine/` **must** maintain this zero-dependency invariant. If a function requires `node:fs`, `node:path`, or any npm package, it belongs in `src/loaders/` or `src/builders/`, not `src/engine/`.

`conditionals.ts`'s `resolveConditionals()` and `stripComments()` normalise CRLF/lone-CR input to LF as their first statement, via a module-private `toLf()` that mirrors `postProcessor.ts`'s `normalizeNewlines()`. The rule is duplicated, not imported, because the zero-import invariant above forbids `conditionals.ts` from importing anything, even from a sibling engine module — `toLf()`'s JSDoc names `normalizeNewlines()` as its twin so a change to one prompts review of the other.

### 2. Synchronous Plugin Runner — plan for async before adding remote plugins

The plugin runner (`src/plugins/runner.ts`) is fully synchronous. All six hook functions (`runSuiteInit`, `runPartials`, `runBuildContext`, `runPersonaPartials`, `runPostRender`, `runValidate`) are synchronous. This is correct for the current use case (local file-based builds).

> Before integrating any plugin that performs network I/O or heavy async work (e.g., schema-fetching, API calls), the runner must be refactored to `async` + sequential `await`. Design new plugin hooks with async compatibility in mind.

### 3. Strict + Check Mode Interaction

When `strict: true` is used **without** `check: true`, `build()` writes all output files to disk before evaluating validation failures — leaving partial artefacts on failure. CI pipelines calling `build()` in validation mode **must** combine `strict: true` with `check: true` to avoid partial writes.

### 3b. `TargetDefinition.mcpToolPattern` MUST NOT carry the `g` or `y` flag

`TargetRegistry.register()` throws if a registered `mcpToolPattern` is a global (`g`) or sticky
(`y`) `RegExp`. Both flags give `exec()`/`test()` mutable `lastIndex` state, and the same `RegExp`
instance is shared between registry copies (`clone()`, `allDefinitions()`, `get()`) — a
global/sticky pattern would make match results depend on call order across those copies. Any new
built-in or custom target's `mcpToolPattern` must be a plain (non-`g`, non-`y`) pattern.

### 3c. Build Success: Error-Severity Results Always Fail — MUST preserve

Since WP-010 (Build Success Semantics), `build()` computes
`success = errors === 0 && (!strict || warnings === 0)`. An error-severity `ValidationResult` —
from a plugin's `onValidate`, a built-in validator (`validateSubagentRefs()`,
`validateToolRequirements()`, `validateToolParity()`), or an index-level issue in
`PersonaIndex.issues` — fails **every** build and exits the CLI with code `1`, whether or not
`config.strict` is set. `strict: true` only adds a warnings-fail-too requirement and its throw
behaviour; it is no longer the sole gate on error-severity results. `BuildSummary.strictFailures`
reflects this: it is populated unconditionally (every result's `validationResults` plus `issues`),
not only when `strict` is set. Any future validator or index-level issue **must** use `'error'`
severity if its finding should fail a non-strict build — `'warning'` severity is silently
non-fatal outside `strict` mode. See `docs/cli.md` and `docs/agents/project-manifest/api-surface.md`
(`BuildSummary`) for the consumer-facing semantics.

---

## Naming Conventions

### Filenames

All source and output filenames must follow **kebab-case**: lowercase letters, digits, and hyphens only. The `validateFileName()` function enforces this with three rules:

1. No uppercase letters
2. No spaces
3. All dot-separated segments must be valid kebab tokens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

Valid examples: `my-persona.md`, `1-developer.agent.md`
Invalid examples: `My_Persona.md`, `--bad.md`, `foo..bar.md`

### Module Structure

- Each layer directory contains an `index.ts` barrel that re-exports all public symbols.
- The top-level `src/index.ts` re-exports from all layer barrels (`export *`).
- Type-only exports use `export type { … }` syntax.
- **Named re-export for utility barrels:** `src/utils/index.ts` uses explicit named re-exports (`export { escapeRegExp } from './regex.js'`) rather than `export *`. This prevents accidental public-surface leakage if internal helpers are later added to utility files. All future utility barrels must follow this pattern.
- **Utility module structure:** The `src/utils/` directory follows a one-file-per-domain pattern (e.g. `regex.ts` for regex utilities). Each file contains focused, pure functions. New utilities should create a new domain file rather than appending to an existing one, and the barrel (`index.ts`) must be updated with an explicit named re-export.

### YAML Metadata

- Shared suite defaults live in `meta/_shared.yaml` (underscore prefix = excluded from persona discovery).
- Per-persona YAML files are named to match their content file stem: `persona-name.yaml` ↔ `content/persona-name.md`.

---

## Template Syntax

| Syntax | Purpose | Processor |
|--------|---------|-----------|
| `{{!-- comment --}}` | Comment (multi-line, may contain a literal `}}`) | `stripComments()` — run first, before everything else |
| `{{! comment }}` | Comment (multi-line, cannot contain a literal `}}`) | `stripComments()` — run first, before everything else |
| `{{> partialName}}` | Partial inclusion | `resolvePartials()` — depth-2 recursion |
| `{{#if flag}}…{{/if}}` | Conditional block | `resolveConditionals()` |
| `{{#if flag}}…{{else}}…{{/if}}` | Conditional with fallback | `resolveConditionals()` |
| `{{#if flag}}…{{else if flag2}}…{{else}}…{{/if}}` | Else-if chain (first truthy branch wins; final `{{else}}` optional) | `resolveConditionals()` — resolved natively by the tokenizer, no rewrite pre-pass |
| `{{variableName}}` | Variable substitution | `resolveVariables()` |
| `\{{varName}}` | Escaped variable marker (literal pass-through, no warning) | `resolveVariables()` |

> **Escape syntax note:** The backslash prefix is consumed by the engine and does **not** appear in the rendered output. `\{{varName}}` in a template produces `{{varName}}` verbatim in the final file — no substitution occurs and no unresolved-variable warning is emitted. To produce a literal `\{{varName}}` string in output (backslash included), use a double backslash: `\\{{varName}}` → `\{{varName}}`.

> **Comment whitespace note:** Both comment forms share the identical standalone/inline/blank-run-merge whitespace contract as conditional tags (see `api-surface.md`'s `stripComments()` entry). A standalone tag on its own line — conditional or comment — has its entire line removed; an unmatched or unterminated tag of either kind passes through the output literally. Two or more removed tags — conditional blocks that resolve to nothing, standalone comments, or a mix separated only by whitespace-only lines (including no gap at all) — merge their surrounding blank-line runs into one, instead of merging pairwise and leaving leftover runs to add together; a kept block's content still breaks the merge.

**Processing order matters:** stripComments → partials → conditionals → variables. Running them out of order will produce incorrect output — in particular, a comment must be stripped before the raw-template tool-requirement scan (see Sub-Agent Validation Constraints below) and before partials expand, or a commented-out `{{> partial}}` would still be treated as a live reference.

---

## package.json Path Conventions

When modifying paths in `package.json`, strictly adhere to these prefix rules to satisfy both npm and Node.js module resolution:

1. **`bin` paths MUST NOT start with `./`** (e.g., `"dist/cli.js"`). npm's strict normalizer treats `bin` as OS file paths and will strip `./` automatically, generating a confusing warning during `npm pack` or `npm publish` if it is present.
2. **`exports`, `main`, `module`, and `types` paths MUST start with `./`** (e.g., `"./dist/index.js"`). Node.js requires this exact format for local module resolution; omitting it will cause an `ERR_INVALID_PACKAGE_TARGET` error at runtime.

---

## Sub-Agent Validation Constraints

### 4. `subagents` Slugs Must Reference Existing Cross-Suite Personas

`PersonaMetadata.subagents` declares a list of cross-suite persona slugs this persona may delegate to as sub-agents. Every declared slug **must** have a corresponding `agent_slug_*` key in the agent map built by `agentNameMapFromIndex()` (derived from `scanPersonas()`'s `PersonaIndex`, `src/builders/persona-index.ts`) during the pre-scan phase. If a slug has no matching entry, `validateSubagentRefs()` (`src/validators/subagent-validator.ts`, exported from `src/validators/index.ts`) emits an `error`-severity `ValidationResult` for each unknown slug at validation step 10 of `buildPersona()`.

**Key derivation rule:** Slug `my-agent` maps to key `agent_slug_my_agent` (hyphens → underscores). The agent map is populated from the `slug` field of every persona YAML in all configured suites — a slug only resolves if the corresponding persona exists *and* is discoverable in the build configuration.

**Target-aware check:** When `buildPersona()` is called with a `personaIndex` (the case whenever `buildSuite()`/`build()` orchestrate the call, since both forward their index), `validateSubagentRefs()` also flags a slug that *does* resolve to a real persona but whose resolved `targets` (see invariant on target resolution below) exclude the target currently being built — e.g. a `claude-code` persona declaring a sub-agent that is only built for `vscode`. This is a second, independent `error`-severity `ValidationResult`, additive to the unknown-slug check: a slug can fail both if `agentMap` and `personaIndex` were built from different scans. Omitting `personaIndex` (a direct `buildPersona()` call without one) skips only this check.

**Build failure without `strict`:** Both checks emit `error`-severity `ValidationResult`s, and since WP-010 (Build Success Semantics) any error-severity result fails the build by default — `build()` returns `BuildSummary.success = false` (CLI exit 1) whether or not `strict` is set. `strict: true` changes *how* that failure surfaces: instead of a returned failed summary, `build()` throws after collecting all validation results across every suite (see also invariant 3 on combining `strict` with `check` to avoid partial writes on that throw path).

**Absence is valid:** Personas that do not declare `subagents` (or declare an empty list) pass validation silently — `validateSubagentRefs()` early-exits with `[]` before either check runs.

> **User-facing reference:** See [Metadata Reference — Sub-Agent Declarations](../../metadata-reference.md#tier-4c--sub-agent-declarations) for YAML examples, slug resolution walkthrough, and template access patterns.

---

### 4b. Tool Validation Is Driven Entirely by `TargetDefinition.toolCapabilities`

The dispatch-grant (`validateToolRequirements()`), capability-parity (`validateToolParity()`), and
foreign-notation checks all read the same `TargetDefinition.toolCapabilities` /
`mcpToolPattern` vocabulary (`src/targets/tools.ts`) — there is **no separate hand-maintained list**
of dispatch tools or foreign-notation patterns anywhere in the codebase. Any change to what counts
as a "dispatch tool" or a "foreign spelling" for a target **must** go through
`TargetDefinition.toolCapabilities` / `mcpToolPattern`, not a new branch in a validator.

- **Rough correspondence is deliberate.** Only seven capabilities are mapped
  (`execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo`) plus `mcp:<server>` via
  `mcpToolPattern`. A tool name with no counterpart on another target (VS Code's `vscode`,
  `browser`; any custom or extension tool) is invisible to every check — this is a scope decision
  (2026-09-29), not an oversight. Do not add exhaustive mapping without a fresh decision.
- **Parity requires ≥ 2 mapped, built targets.** `validateToolParity()` short-circuits to no
  findings when fewer than two of a persona's built targets have both a registered
  `TargetDefinition` capability map and a defined `BuildResult.effectiveTools`. `deep-agents`
  (no capability map) never participates on either side of a parity comparison.
  `tool_parity_exceptions` on the persona YAML exempts named capabilities from this check only —
  it has no effect on the dispatch-grant or foreign-notation checks.
- **Dispatch-grant runs per-persona, per-target**, inside `buildPersona()` step 10 — it needs only
  that target's `effectiveTools`, not a cross-target view. **Parity runs as a `build()` post-pass**
  — it needs every built target's `effectiveTools` for the same persona, which a single-target
  `buildPersona()`/`buildSuite()` call cannot see (see Known Limitation below).
- **`SUBAGENT_DISPATCH_REQUIREMENT` is always applied.** A consumer `BuildConfig.toolRequirements`
  entry with the same `id` (`'subagent-dispatch'`) replaces it; any other `id` is additive.

---

### 5. Planned `onPreRender` Hook — Not Yet Implemented

> **Planned — not yet implemented.** This hook does not exist in the current library. The description below documents the *intended* design for a future release.

The plan calls for an `onPreRender` hook on `PersonaBuildPlugin` that fires after `resolvePartials()` but before `resolveConditionals()` in the body render phase (step 7 of `buildPersona()`). At this injection point, partials have been inlined but `{{variable}}` references and `{{#if}}` blocks remain unresolved — making raw template inspection (e.g., scanning for `{{agent_slug_*}}` variable references) possible.

**Intended signature:**
```ts
onPreRender?(
  rawTemplate: string,
  context: Record<string, unknown>,
  persona: PersonaMetadata,
  suite: SuiteConfig,
  target: TargetType,
): void;
```

**Intended behaviour:** Inspection-only — the return value is ignored and the hook cannot modify the template. Side-effects (e.g., collecting template dependency metadata for use in `onValidate`) are the primary use case.

**Migration path:** Once this hook ships, the `agent_slug_*` ↔ `subagents` cross-reference check currently implemented in the workspace-specific `scripts/build-personas.js` can move into a persona-builder plugin. The plugin would scan `rawTemplate` in `onPreRender` and compare against `persona.subagents` in `onValidate`. Until the hook exists, the workspace-specific script remains the pragmatic home for that check.

---

## Known Limitations

### 1. `serializeTools` Single-Quote Escaping

`serializeTools()` does not escape single quotes inside tool names (e.g., `Tool's` → `['Tool's']` which is invalid YAML). Acceptable for alphanumeric tool names. Add escaping before any consumer registers tool names with apostrophes.

### 2. `cc_model` / `cc_memory` Not Auto-Derived

The default Claude Code frontmatter template references these two context variables, but they are not computed by `buildContext()`. They must come from `_shared.yaml` or a plugin's `onBuildContext` hook. Missing values produce `[WARN] Unresolved variable` in stderr but do not fail the build unless `strict: true`.

### 3. Node.js Version Floor

`readdir` with `{ recursive: true }` (used in `discoverPersonaYamls`) requires Node ≥ 18.17. The `package.json` currently states `>=18.0.0`, which creates a confusing `TypeError` window for consumers on Node 18.0–18.16. Bump `engines.node` to `>=18.17.0` before 1.0.

### 4. Path Traversal Trust Boundary

The loaders (`loadPartials`, `discoverPersonaYamls`, `loadContent`) pass caller-supplied paths directly to `fs/promises` APIs. This is acceptable for a build-time library with developer-controlled paths. If any future layer exposes these functions to CLI arguments, plugin-provided paths, or HTTP input, a `path.resolve(input).startsWith(allowedRoot)` containment guard must be added before that exposure.

### 5. Target Registry Extensibility

`buildContext()` spreads `contextFlags` from the registry definition via `registry.get(target).contextFlags ?? {}`, injecting all declared flags into the template context. For all three built-in targets the `contextFlags` entry is `{ target_<name>: true }` (with hyphens converted to underscores) — e.g. `target_deep_agents: true`. Custom targets registered with their own `contextFlags` map will have those entries injected automatically.

`resolveFrontmatterTemplate()` resolves the frontmatter template via the precedence chain: plugin `frontmatterTemplates` → `BuildConfig.frontmatter` → `registry.get(target).defaultFrontmatter` → library default (`DEFAULT_FRONTMATTER_CLAUDE_CODE`). Custom targets that provide a `defaultFrontmatter` in their `TargetDefinition` do not need to supply a plugin or config override.

This extensibility mechanism supports non-persona content types — e.g. skills can be built by registering custom targets with skill-appropriate frontmatter templates. See the [Building Skills](../../building-skills.md) guide.

**Two-registry limitation:** `buildPersona()` and `buildSuite()` accept an optional `registry` parameter that defaults to `defaultRegistry`. If a consumer passes a custom `TargetRegistry` only to `build()` (via `config.targetRegistry`) and calls these functions directly without the registry argument, their custom targets will not be visible. Pass the same registry instance explicitly to avoid this, or call `build()` to have it forwarded automatically.

### 6. Ledger Plugin Removed in v2.0.0

The `@mistralys/persona-builder/plugins/ledger` sub-path export was removed in v2.0.0 and
has been migrated to the `ai-insights` workspace as a local CommonJS module at
`personas/plugins/ledger/`. The symbols `ledgerPlugin`, `LedgerPluginOptions`, `RosterEntry`,
`McpToolEntry`, `renderRoster`, `renderMcpToolsTable`, `validateRole`,
`validateNoteOnlyGuard`, `FRONTMATTER_LEDGER_VSCODE`, and `FRONTMATTER_LEDGER_CC` are no
longer exported by this package. Any code that imports from
`@mistralys/persona-builder/plugins/ledger` will receive an `ERR_PACKAGE_PATH_NOT_EXPORTED`
error at runtime.

### 7. Changelog-Derived Versioning

`version` and `last_updated` in the template context are **always derived by `buildContext()` from the `changelog` YAML field** — they must not be set manually in per-persona YAML.

**Changelog entry format:**
- With date: `X.Y.Z (YYYY-MM-DD): Description of changes`
- Without date: `X.Y.Z: Description of changes`

`resolveChangelogMeta()` inspects lines in order and returns the first match. The derivation chains are:
- `version`: `resolveChangelogMeta(changelog)?.version` → `default_version` → `'0.0.0'`
- `last_updated`: `resolveChangelogMeta(changelog)?.date` → `''` (only injected when absent from YAML)

**Rules:**
1. Set `changelog:` as a YAML block scalar in per-persona YAML to control the rendered version and date.
2. Do **not** add a `version:` key to per-persona YAML — it is silently overwritten by `buildContext()` and has no effect.
3. Do **not** add a `last_updated:` key to per-persona YAML for version-date purposes — let it be derived from the `changelog` field. Explicit `last_updated:` in YAML is preserved but will not be overridden by the changelog date.
4. The `default_version` key in `_shared.yaml` remains valid as a suite-wide fallback for personas with no `changelog` field.

### 8. Partial Recursion Depth Cap Is Hardcoded at 2

`resolvePartials()` uses a hardcoded recursion depth cap of `2`. This supports a "partial → nested partial → innermost partial" chain (two levels of nesting), but a third level is **not expanded** — the `{{> name}}` marker is left as-is in the output. This cap is **not configurable** via `BuildConfig` or any other option.

**Decision (2026-04-14):** Making the cap configurable was evaluated and rejected. Depth 2 covers all practical persona template patterns. Adding a `maxPartialDepth` option would increase API surface and complexity with no demonstrated demand. If a third nesting level is required in the future, raise the `depth >= 2` guard in `src/engine/partials.ts` and update the tests in `tests/engine/partials.test.ts`.

### 9. An Absent Effective Tool List Is Not Flagged

`validateToolRequirements()` short-circuits to `[]` when `BuildResult.effectiveTools` is
`undefined` (the target has no registered `TargetDefinition`, so there is no capability map to
resolve against). This is deliberate: an absent tool list means the platform's own default grant
applies, so there is nothing meaningful to compare — but it also means a custom target registered
without `toolsContextKey`/`toolCapabilities` gets no dispatch-grant, parity, or foreign-notation
checking at all, silently.

### 10. Unmapped Tools Are Ignored By Every Check

Only the seven capabilities in `TargetDefinition.toolCapabilities` (plus `mcp:<server>` via
`mcpToolPattern`) are resolvable. A tool name outside that vocabulary — VS Code's `vscode` or
`browser`, any custom or extension-contributed tool — never triggers a dispatch-grant error, a
parity finding, or a foreign-notation warning, even if it is the *only* capability difference
between two targets. This is the same rough-correspondence scope decision as invariant 4b above,
restated here because it is a limitation from the validation user's perspective.

### 11. Derived `cc_tools_*` Fields Are Computed Before `onBuildContext`

`cc_tools_list`, `cc_tools_json`, and `cc_tools_block` (and their `tools_*`/`da_tools_*` siblings)
are computed at context merge step 3, *before* plugin `onBuildContext` hooks run at step 5 (`ctx →
onBuildContext`). A plugin that adds or changes `cc_tools` in `onBuildContext` does not see its
change reflected in these derived fields — they were already serialized from the pre-plugin value.
This is a pre-existing render-ordering quirk, not new to this plan; it affects template rendering
of these specific derived fields, not the tool-validation checks (which resolve `effectiveTools`
freshly, post-`onBuildContext`, via `resolveTargetTools()`).

### 12. `buildPersona()` Ignores `targets`

`buildPersona()` builds exactly the single persona × target combination it is given — calling it
directly is an explicit request to build that combination, so it never consults the persona's
resolved `targets` field. Only `buildSuite()`/`build()` apply per-persona target filtering. A
direct `buildPersona()` call for an excluded target still renders and returns a `BuildResult`.

### 13. `buildSuite()` and `buildPersona()` Do Not Run the Capability-Parity Check

`validateToolParity()` only runs as a `build()` post-pass (see invariant 4b above), because it
needs every target's `effectiveTools` for the same persona — information a single-suite or
single-persona call cannot see. Calling `buildSuite()` or `buildPersona()` directly, without going
through `build()`, never produces parity findings, regardless of `tool_parity_exceptions`.

### 14. The Library Never Deletes Output For Excluded Targets

When a persona's resolved `targets` excludes a target it previously built for (e.g. after editing
`targets:` in YAML), the library skips rendering and writing for that target on the next build —
it does **not** delete any file already written there from a prior build. Consumers that rely on
`targets` to retire stale output for a persona must delete the file themselves (e.g. as part of an
output-directory pre-clean step, the pattern this plan's AI Insights consumer already uses).

### 15. No Escape Form for a Literal `{{!`

Unlike `{{variableName}}`, which has a backslash escape (`\{{varName}}`) for emitting a literal
marker, comment tags have no equivalent. A template that needs to show the literal three-character
sequence `{{!` in rendered output cannot do so directly — `stripComments()` has no escape syntax to
suppress comment recognition for a specific occurrence. Splitting the sequence across two adjacent
`{{variableName}}`/text boundaries, or emitting it from a variable's resolved value instead of
writing it as template source, are the only workarounds until an escape form is added.

### 16. A Literal NUL Character in Template Source Is Dropped

`resolveConditionals()` and `stripComments()` both signal "this block/comment resolved to
nothing" internally with a single reserved character, `'\0'` (`EMPTY_BLOCK_MARKER`), then run
one shared `mergeMarkers()` pass to collapse the surrounding blank-line runs. That marker and a
literal NUL byte typed or pasted into template source are indistinguishable once the merge pass
runs: the character is silently removed, along with any blank-line run directly around it,
exactly as if it had been a vanished block or comment. This only surfaces once at least one real
`{{#if}}`/`{{else}}`/`{{!--…--}}`/`{{!…}}` tag is present elsewhere in the same template — with no
recognised tag at all, both functions return the input unchanged apart from line-ending
normalisation (see §1's `toLf()` mirror note) before the merge pass ever runs, so the literal NUL
survives untouched in that case.

A NUL byte in a Markdown template is malformed content — no editor or YAML/Markdown toolchain
in this project's pipeline writes one deliberately. This is documented as a known limitation
rather than engineered around: a dynamic per-call sentinel code point would need its own regex
construction and branching to protect a case no template author actually exercises. The
behaviour is pinned by a characterization test
(`ai-persona-builder/tests/engine/conditionals.test.ts`, "Known Limitation 16").

---

## Directory Convention

Each suite's `srcDir` must contain three sub-directories (configurable via `SuiteConfig`):

| Default Name | Purpose | Config Override |
|-------------|---------|-----------------|
| `meta/` | YAML metadata files (`_shared.yaml` + per-persona) | `metaSubdir` |
| `content/` | Markdown content templates | `contentSubdir` |
| `partials/` | Suite-local reusable content fragments | `partialsSubdir` |

Partials are resolved in five layers of increasing precedence: (1) `BuildConfig.partials` inline map (lowest), (2) shared cross-suite partials from `BuildConfig.sharedPartialsDir`, (3) suite-local partials from `<srcDir>/partials/`, (4) `onPartials` plugin hooks (suite-level, once per suite), (5) `onPersonaPartials` plugin hooks (per-persona, highest — always win). See **Partials Resolution** in `data-flows.md` for the full pipeline.

---

## Test Suite

| Directory | Scope |
|-----------|-------|
| `tests/engine/` | Pure engine functions |
| `tests/loaders/` | File I/O loaders |
| `tests/plugins/` | Plugin runner (incl. `runPartials` + `runPersonaPartials`) |
| `tests/builders/` | Build orchestration, variables/partials merge, persona partials isolation |
| `tests/validators/` | Validation functions |
| `tests/integration/` | End-to-end builds against fixtures |

All tests use Vitest with `globals: true`. Run `npm test` for the authoritative count. Integration tests operate against the `fixtures/` directory.
