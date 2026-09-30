# Plan

## Plan Audit Cycles
- Audits: 2 (Sonnet 5.5 ×2) — Plan Auditor v1.11.0
- Architectural Reviews: 1 (Sonnet 5.5 ×1) — Plan Architect Reviewer v2.3.4

## Prior Project Context

- **Persona Builder** has no declared strategic vision. Earlier projects grew the library through declarative registry and config fields rather than target-name branches:
  - extensible target registry with deep-agents
  - dynamic partials
  - else-if chains
  - variable escaping

  This plan follows the same pattern.
- **AI Insights'** long-term goal is "Personas First" and reliable behaviour on every target environment. AI Insights had to build both features in this plan for itself. Its copy of the tool rules has already drifted from the library: `cc-tools-validation.js` assumes a `default_cc_tools` fallback that the library never applies.
- **Relevant insights:**
  - Repository insight `e41ef85e-495a-48e5-a3be-138759930fb0` (engine zero-import invariant) decides where partial-reference collection lives.
  - Global insight `7d13934f-9d72-4156-9616-15741f3e8f94` (validation has a hard ceiling) explains why rendered-prose checks stay in AI Insights. It is also why the tool correspondence list is deliberately rough: basic capabilities only, unmapped tools ignored.
- **User decisions (2026-09-29):**
  - AI Insights is the library's only consumer, so behaviour changes are acceptable (greenfield).
  - A rough VS Code ↔ Claude Code tool correspondence list should catch the biggest mismatches, such as running commands and file system access. It should ignore tools with no counterpart, such as VS Code `browser`.
  - `todo` is part of the correspondence list.
  - Step 19 resolutions reviewed: the planner keeps dispatch, the knowledge curator keeps editing.

## Knowledge Base Reconciliation

| Insight ID | Title | What the plan overtakes | Executed by |
|------------|-------|-------------------------|-------------|
| e832d2f4-7ace-4126-80c3-7f5be5ff62bd | Extract build-time validations into scripts/lib/ for fixture-based testability | (1) The rule "should be followed for all future build-time validations" no longer holds for generic checks. Target selection, tool-grant and tool-parity checks now belong in `@mistralys/persona-builder`; only checks specific to AI Insights content stay in `scripts/lib/`. (2) The claim that plugin or library validation "only emits warnings and cannot fail the build unconditionally" stops being true. After step 10, error-severity `ValidationResult`s fail every build. | Ledger Knowledge Curator v1.4.1 (Targeted Reconciliation) |

## Summary

This plan moves two capabilities from AI Insights' persona build wrapper into the `@mistralys/persona-builder` library. Every consumer then gets them, and AI Insights drops its own copies.

1. **Per-persona `targets`.** A persona YAML may list the output targets it is built for, and the library skips the others entirely. Today AI Insights renders every target, writes it, and then deletes the excluded files.
2. **Cross-target tool validation.** Each target declares a rough **capability map** that says which of its tool names grant `execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo`, plus a pattern that recognises MCP server grants. The map drives three checks:
   - **Dispatch grant.** A persona that dispatches must grant `dispatch` on every target it is built for: it declares `subagents`, or it includes a configured partial such as a handoff block.
   - **Capability parity.** A persona built for several mapped targets must grant the same mapped capabilities on each one. The exceptions are those it lists in `tool_parity_exceptions`.
   - **Foreign notation.** A tool name spelled in another target's notation raises a warning.

Supporting changes:
- A persona pre-scan index replaces the name-map-only scan.
- A registry-driven "effective tool list" resolver replaces the fallbacks hard-coded in `buildContext()`.
- Error-severity results now fail the build.

AI Insights then fixes or excepts the parity mismatches the new check finds (17 personas, listed in step 19). During development it uses the local library through a symlink. The user handles the library release and the AI Insights dependency bump.

## Architectural Context

**Persona Builder** (`ai-persona-builder/`): builders → plugins → engine / loaders / validators / targets.
- `src/builders/persona-builder.ts`:
  - `build(config)` pre-scans every persona YAML in `buildAgentNameMap()`, then loops suites × targets and calls `buildSuite()`.
  - `buildSuite()` calls `buildPersona()` for every discovered YAML, with no per-persona filtering.
  - `buildPersona()`:
    - merges the context (`buildContext()`, 7 layers; `cc_tools`/`da_tools` fall back to `tools` inline)
    - runs the plugin hooks
    - renders the frontmatter, then the body: partials → conditionals → variables
    - collects plugin `onValidate` results and the internal `validateSubagentRefs()`
  - `build()` computes `success = !strict || strictFailures.length === 0`.
- `src/targets/`: `TargetDefinition` (name, outputDirKey, filenameContextKey, defaultFrontmatter, contextFlags, defaultEnabled) and `defaultRegistry` (vscode, claude-code, deep-agents).
- `src/validators/`: pure validators (`validateFileName`, `validateStrictMarkers`).
- `src/engine/partials.ts`: `resolvePartials()`, zero imports, depth cap 2.
- `src/cli.ts`: prints only `strictFailures`, and exits 1 only when `success` is false.

**AI Insights** (`ai-insights/`):
- `scripts/build-personas.js` pre-cleans the output directories, then runs the library CLI from `personas/node_modules/@mistralys/persona-builder/dist/cli.js`.
- It then runs checks of its own:
  - `validateCcToolsInDirs()` from `scripts/lib/cc-tools-validation.js`. Checks Claude Code only, from YAML plus a raw content scan.
  - An in-memory `build({ ...config, check: true })`. Its output feeds a prune of excluded `targets` (`resolvePersonaTargets()`), then `validateSubagentReferences()` from `scripts/lib/subagent-reference-validation.js` (rendered-prose checks).
- The build config is `personas/persona-build.config.js`.

## Approach / Architecture

### Library (Persona Builder)

**A. Persona index (reshaped pre-scan).** New `src/builders/persona-index.ts` exports:
- `scanPersonas(config, registry): Promise<PersonaIndex>`, which reads every persona YAML once.
- `PersonaIndexEntry { suite, yamlPath, slug, name, version, targets, declaredTargets?, toolParityExceptions }`
- `PersonaIndex { entries; bySlug: Map<string, PersonaIndexEntry>; issues: ValidationResult[] }`
- `agentNameMapFromIndex(index)`, which replaces `buildAgentNameMap()` with identical output.

**B. Per-persona `targets`.** Add `targets?: string[]` to `PersonaMetadata`. `resolvePersonaTargets(declared, registry)` applies these rules:
- Absent → every registered target.
- Non-array, non-string entry, or empty array → error.
- Unknown names → error, and the name is dropped.
- Duplicates → removed.

A persona builds for its resolved targets ∩ the build's active targets. `buildSuite()` takes an optional trailing `personaIndex`, placed after `registry` (§C). Without one, it scans its own suite. It skips excluded personas.

`build()` records skips in `BuildSummary.skipped: SkippedBuild[]` (`{ suite, target, personaYamlPath }`) and index problems in `BuildSummary.issues`. `buildPersona()` remains an explicit single build and does not apply `targets`; this is documented.

**C. Target-aware sub-agent validation.** `validateSubagentRefs` moves to the new `src/validators/subagent-validator.ts` and is exported, which fixes the manifest drift. New signature: `validateSubagentRefs(persona, agentMap, index?, target?)`. It reports:
- an unknown slug → error (as today)
- a slug that exists but isn't built for `target` → new error

**How `agentMap` and `personaIndex` coexist:**
- **`agentMap` stays, with its current meaning.** It remains a parameter of `buildSuite()` and `buildPersona()`, and it still feeds the `agent_*` context variables (layer 6 of `buildContext()`). `build()` derives it from the index through `agentNameMapFromIndex()`, so both come from one scan and cannot disagree.
- **`personaIndex` is added after `registry`**, which is the current last parameter, on both `buildSuite()` and `buildPersona()`: `(…, target, agentMap = {}, registry = defaultRegistry, personaIndex?)`. This keeps every existing call valid.
- **Unknown-slug check:** keyed on `agentMap` exactly as today (`agent_slug_{underscored}`). When `agentMap` is empty (the default), no unknown-slug error is emitted. Skip-on-empty is **deliberately preserved**, so direct `buildPersona()` callers and the existing tests keep their behaviour.
- **Target-aware check:** runs only when both `index` and `target` are supplied, and only for slugs found in `index.bySlug` whose resolved `targets` exclude `target`. A slug absent from the index is left to the unknown-slug check. This also keeps a suite-only index (built by `buildSuite()` when called without one) from raising false errors for cross-suite slugs.
- **When `personaIndex` is absent,** `buildPersona()` skips the target-aware check and behaves exactly as it does today. `build()` always passes both inputs, so both checks run in a full build.

**D. Tool capability metadata on targets.** `TargetDefinition` gains three optional fields:
- `toolsContextKey?: string` — the context key holding this target's tool list. Falls back to `tools`.
- `toolCapabilities?: Record<string, string[]>` — capability → the tool names that grant it on this target (any of them).
- `mcpToolPattern?: RegExp` — group 1 captures the MCP server name. A match grants capability `mcp:<server>`. The pattern must be **non-global**: a `g` or `y` flag gives `exec()`/`test()` a `lastIndex` state, and the instance is shared between registry copies, so results would depend on call order. `TargetRegistry.register()` rejects a pattern carrying either flag with an error naming the target.

`TargetRegistry.clone()` and `allDefinitions()` currently copy each definition with a shallow spread (`src/targets/registry.ts` L100, L109–L115). Both deep-copy `toolCapabilities` (a fresh object with fresh arrays), so a copy never shares mutable arrays with the original. The `RegExp` may stay shared because it is non-global and therefore stateless.

Built-in values:

| Capability | vscode (`toolsContextKey: 'tools'`) | claude-code (`toolsContextKey: 'cc_tools'`) |
|------------|--------------------------------------|---------------------------------------------|
| `execute` | `execute` | `Bash` |
| `read` | `read` | `Read` |
| `edit` | `edit` | `Edit`, `Write` |
| `search` | `search` | `Grep`, `Glob` |
| `web` | `web` | `WebFetch`, `WebSearch` |
| `dispatch` | `agent` | `Task`, `Agent` |
| `todo` | `todo` | `TodoWrite`, `TodoRead` |
| `mcp:<server>` | `/^([\w-]+)\/.+$/` (`server/*`, `server/tool`) | `/^mcp__([\w-]+?)(?:__.+)?$/` (`mcp__server`, `mcp__server__tool`) |

- deep-agents: `toolsContextKey: 'da_tools'` and no capability map. The orchestrator always provides its `task` tool, and deep-agents personas carry no tool grants.
- Unmapped tools are ignored by every check: VS Code `vscode`, `browser`; any custom name. This keeps the list rough on purpose, as the user asked.

New `src/targets/tools.ts` exports:
- `pickToolList(record, key)` — the `key` array, falling back to `tools`, else `undefined`.
- `resolveTargetTools(context, definition)`.
- `resolveCapabilities(tools, definition): Map<string, string>` — capability → the first tool granting it.
- `recognizedBy(tool, registry, excludeTarget)` — which other targets' maps or MCP patterns recognise a tool name.

`buildContext()` uses `pickToolList()` for its `cc_tools`/`da_tools` fallbacks, so the rule is defined once.

**E. Tool requirements (dispatch grant).** A new exported type:
```ts
ToolRequirement {
  id: string;
  when: { field: string } | { partial: string };
  targets?: string[];
}
```
- Every requirement is satisfied by the target's `dispatch` capability, resolved through the target's `toolCapabilities`. There is deliberately no `capability` or `anyOf` field: no rule in this plan needs either, and `anyOf` would let a rule bypass the capability map that serves as the single tool vocabulary. Both can be added later as optional fields without a break (see Out of Scope).
- The built-in `SUBAGENT_DISPATCH_REQUIREMENT = { id: 'subagent-dispatch', when: { field: 'subagents' } }` always applies.
- `BuildConfig.toolRequirements?: ToolRequirement[]` adds consumer rules. A consumer rule with the same `id` replaces the built-in one.
- Trigger rules:
  - `field` fires when the metadata field is a non-empty array or string.
  - `partial` fires when the persona's content template includes the partial, directly or nested, within the renderer's depth cap. Detection uses the new pure engine function `collectPartialReferences(text, partialsMap): Set<string>` in `src/engine/partials.ts`.
- `validateToolRequirements(...)` in the new `src/validators/tool-requirements-validator.ts` emits one error per triggered, ungranted requirement.
- Targets without a capability map, or without a `dispatch` entry in it, are skipped.
- An absent effective tool list means the platform's default grant applies, so it is not flagged. This is documented as a limitation.
- The same validator emits the **foreign-notation warnings**: a tool not recognised on its own target but recognised by another target. Example: `read` in `cc_tools` → "vscode notation; claude-code equivalent: `Read`".
- It runs in `buildPersona()` step 10, against the post-`onBuildContext` context.

**F. Capability parity.** A new pure validator, `validateToolParity(personaLabel, perTarget, exceptions)`, in `src/validators/tool-parity-validator.ts`. `perTarget` is a list of `{ target, capabilities: Map<string, string> }`.
- For every capability granted on some mapped target but missing on another, it emits one **error** on the lacking target's result. The message names the capability, the target and tool that grant it, and the lacking target's equivalent tool names.
- Capabilities listed in the persona's `tool_parity_exceptions` are skipped.
- An exception naming a capability that no registered target maps, or that isn't an `mcp:` form, is a warning in `BuildSummary.issues`.
- Parity needs every target's result for the same persona, so it runs as a post-pass in `build()`. Each `BuildResult` gains `effectiveTools?: string[]`, recorded in `buildPersona()` from the post-plugin context.
- Only targets that are built, have a capability map, and have a defined effective list take part. At least two are required.
- `buildSuite()` and `buildPersona()` do not run parity; this is documented.

**G. Build success semantics.** In `build()`, `success` is false whenever any result or index issue has error severity. `strict` additionally fails on warnings, and keeps its throw.
- `BuildSummary` gains `errors` and `warnings` counts. `strictFailures` keeps its meaning and now includes `issues`.
- The CLI prints every error and warning with its suite, persona and target, plus the skipped count, and exits 1 on errors.
- Since AI Insights is the only consumer, no compatibility flag is added.
- This is still a behaviour break for the published 2.x contract: a build that succeeded on 2.6.x can now fail. The release is therefore proposed as a **major** version (step 14), and the changelog flags the change as breaking, per `ai-persona-builder/AGENTS.md` ("Breaking change proposed: document before implementing, flag for review"). A minor release would reach every `^2.x` consumer through a plain `npm install`.

### AI Insights

- **Dev linking:** `personas/node_modules/@mistralys/persona-builder` becomes a symlink to `../../../../ai-persona-builder` for the whole run. `package.json` and the lockfile stay unchanged.
- **Config:** `personas/persona-build.config.js` gains `toolRequirements` for `handoff-block-claude-code` → `claude-code` and `handoff-block-vscode` → `vscode`. The vscode rule is new coverage: the VS Code handoff calls `runSubagent`, which needs `agent`.
- **Retire duplicates:**
  - `scripts/lib/cc-tools-validation.js` and its test are deleted.
  - `TARGETS`, `resolvePersonaTargets` and the prune step are removed.
  - `subagent-reference-validation.js` derives each persona's targets from the library's results, and keeps only its rendered-prose checks.
- **Resolve parity findings:** the mismatches found in research are resolved as listed in step 19.

## Rationale

- **The library already owns targets:** the registry, output directories and filename keys. A per-persona target list is the same concern one level down. Skipping at render time removes wasted renders and writes, and makes `BuildSummary.results` an honest record of what was built.
- **Tool vocabulary is a property of the target.** That covers which tool dispatches, which tools read or edit, and how MCP is spelled. On `TargetDefinition`, custom targets can join, and `buildContext()` loses its target-name branches.
- **One capability map serves all three checks.** The dispatch grant, parity and foreign notation all read the same map, so there is no separate hand-maintained list of dispatch tools or foreign patterns. The capability map subsumes the separate `dispatchTools` / `foreignToolPatterns` fields considered earlier.
- **One tool resolver prevents drift.** Rendering and validation share it, which prevents the drift AI Insights already suffered.
- **`ToolRequirement` has two concrete triggers today:** `subagents`, and AI Insights' handoff partials. Both require `dispatch`, so the type carries only `id`, `when` and `targets`. A future rule needing another capability (for example `mcp_tools` requiring `mcp:<server>`) adds an optional `capability` field then; that is additive and non-breaking, so shipping it now would be structure without a caller.
- **Parity findings are errors,** because `tool_parity_exceptions` gives intentional differences an explicit, reviewable escape hatch. A warning would be printed and then ignored, which does not meet the user's goal of catching mistakes.
- **Errors fail the build.** Otherwise every new check is invisible in AI Insights' non-strict build. The library has no other known consumers, so no compatibility flag is warranted. Because the package is published under semver, the change is still released as a major version and flagged as breaking in the changelog; "greenfield" describes today's consumers, not the published contract.

## Considered Alternatives

| Decision | Chosen Shape | Alternatives Considered | Trade-Off Summary |
|----------|--------------|-------------------------|-------------------|
| Where `targets` filtering happens | Skip in `buildSuite()` using the pre-scan index | (a) Keep render-then-prune in consumers; (b) `buildPersona()` returns `BuildResult \| null` | (a) keeps the duplication this plan removes. (b) changes a public return type, and still builds the context before deciding. |
| Pre-scan structure | General `PersonaIndex`, with the agent map derived from it | Second scan beside `buildAgentNameMap()` | Two scans read the same files twice and can disagree. |
| `agentMap` vs `personaIndex` in sub-agent validation | Keep `agentMap` for the unknown-slug check (skip-on-empty preserved); `personaIndex` is optional and enables only the target-aware check | (a) Replace `agentMap` with the index; (b) scan on demand when the index is absent | (a) breaks direct callers and loses the `agent_*` context source. (b) adds hidden file I/O to a single-persona build. |
| Empty `targets: []` | Error | Treat as all targets | An empty list most likely signals an author mistake. |
| Tool correspondence storage | Per-target `toolCapabilities` + `mcpToolPattern` on `TargetDefinition` | (a) One global VS Code↔Claude Code pair table; (b) separate `dispatchTools` + `foreignToolPatterns` fields | (a) cannot extend to custom or third targets. (b) is two hand-maintained lists that the capability map already implies. |
| Correspondence scope | Seven basic capabilities (incl. `todo`, per the user) + MCP server names; everything else ignored | Exhaustive mapping incl. `browser`, `vscode` | Some tools have no counterpart (`browser`, `vscode`). A rough map catches the costly mistakes without false positives. |
| Parity severity | Error, with a per-persona `tool_parity_exceptions` list | Warning; config-level severity knob | A warning goes unnoticed in practice. A knob has no consumer that needs it. Exceptions document intent next to the tool lists. |
| Where parity runs | Post-pass in `build()` over `BuildResult.effectiveTools` | Inside `buildPersona()` | A single-target build cannot see the other targets' tool lists. |
| Handoff dispatch trigger | Declarative `ToolRequirement` (`partial` / `field`) | Predicate functions in config; an AI Insights `onValidate` | JSON configs cannot hold predicates, and `onValidate` sees neither the context nor the template. |
| Partial detection | Transitive `collectPartialReferences()` capped like `resolvePartials()` | Single-level regex on raw content (AI Insights today) | Matches exactly what the renderer expands, including nested includes. |
| Which tool list is validated | Post-`onBuildContext` context | Raw YAML | Validates what the build actually uses, including plugin changes. |
| Error handling | Errors always fail; strict escalates warnings | Status quo; opt-in `failOnError` | The only consumer is AI Insights, so compatibility doesn't argue for either alternative. |
| Release framing of "errors always fail" | Proposed major version (`v3.0.0`), with a changelog bullet marked as breaking | Minor version (`v2.7.0`) with a plain bullet | A minor release reaches every `^2.x` range silently and contradicts the `AGENTS.md` rule to flag breaking changes. A major version costs the consumer one range bump, which Human Action 2 already performs. |
| `ToolRequirement` shape | `id`, `when`, `targets`; the capability is always `dispatch` | (a) Also `capability` (default `dispatch`) and `anyOf`; (b) `capability` only | Neither knob has a caller. `anyOf` would bypass the capability map as the single vocabulary. Optional fields can be added later without a break. |
| Rendered-prose sub-agent checks | Stay in AI Insights | Move into the library | These are AI Insights prose conventions and heuristics, beyond mechanical validation. |
| Parity mismatch resolution direction | Align to the narrower grant unless the wider grant is documented or needed | Widen VS Code lists to match Claude Code | Least privilege; follows the existing `standalone/src/meta/developer.yaml` precedent. |

## Pattern Alignment

- **Follows** declarative per-target metadata consumed via the registry: `ai-persona-builder/src/targets/built-in.ts` and `resolveOutputDir()` in `src/builders/persona-builder.ts`.
- **Follows** pre-scan-then-pass-down with optional trailing parameters: `agentMap` in `src/builders/persona-builder.ts`.
- **Follows** pure one-file validators returning `ValidationResult[]`: `src/validators/strict-validator.ts`.
- **Follows** the zero-import engine invariant: `src/engine/partials.ts` and repository insight `e41ef85e…`.
- **Follows** least-privilege alignment of Claude Code grants to the VS Code grant: `ai-insights/personas/standalone/src/meta/developer.yaml`.
- **Departs** from AI Insights' "validations live in `scripts/lib/`" (insight `e832d2f4…`) for the generic checks. They are not specific to AI Insights, and a second copy had already drifted.
- **Departs** from "errors only matter in strict mode" (`build()`), because that behaviour hid every error-severity result. AI Insights is the only consumer, and the change is documented in `constraints.md` and flagged as breaking in the changelog, with a proposed major version (step 14).

## Structural Improvements

| Structure | Observation | Decision | Reason |
|-----------|-------------|----------|--------|
| `ai-persona-builder/src/builders/persona-builder.ts` `buildAgentNameMap()` | Only pre-scan; keeps just name, slug and version | Promoted to step 2 | Target filtering, target-aware sub-agent checks and parity exceptions all need cross-persona data. |
| `ai-persona-builder/src/builders/persona-builder.ts` `validateSubagentRefs()` | Lives in the builder; the manifest lists it under validators | Promoted to step 4 | It is being extended anyway, and relocating it fixes the drift. |
| `ai-persona-builder/src/builders/persona-builder.ts` `buildContext()` tool fallbacks | `cc_tools → tools` / `da_tools → tools` hard-coded per target | Promoted to step 5 | The validators need the same rule, and a shared helper removes the duplication behind AI Insights' drift. |
| `ai-persona-builder/src/targets/registry.ts` `clone()` / `allDefinitions()` | Shallow `{ ...def }` spreads, so any nested field is shared between the original and its copies | Promoted to step 5 | The new `toolCapabilities` arrays would otherwise be shared between copies, which defeats `clone()`'s stated test-isolation purpose. |
| `ai-persona-builder/src/builders/persona-builder.ts` `build()` success | Errors ignored unless strict | Promoted to step 10 | Without this, the new checks do nothing in a non-strict build. |
| `ai-persona-builder/src/cli.ts` `printSummary()` | Prints only strict failures | Promoted to step 10 | This is the output channel for the new checks. |
| `ai-persona-builder/src/builders/persona-builder.ts` derived `cc_tools_*` fields computed before `onBuildContext` | A plugin that changes `cc_tools` leaves `cc_tools_json` stale | Rejected | Pre-existing render-ordering quirk that affects rendering, not validation. Recorded as a known limitation in step 13. |
| Library `default_cc_tools` support | AI Insights declares it; the library never reads it | Rejected | A third fallback changes render semantics. That is a separate decision. |
| `ai-insights/scripts/lib/cc-tools-validation.js` | Duplicates library rules with a wrong fallback; Claude Code only | Promoted to step 17 (removed) | Superseded by the library. |
| `ai-insights/scripts/lib/subagent-reference-validation.js` `TARGETS` / `resolvePersonaTargets` | Owns target resolution | Promoted to step 17 | The library now resolves targets. |
| `ai-insights/scripts/build-personas.js` prune block | Renders excluded targets, then deletes them | Promoted to step 17 | The library no longer renders excluded targets. |
| `ai-insights/scripts/build-personas.js` output-dir pre-clean | Hand-rolled directory list | Rejected | Still needed for stale or renamed files, and unrelated to these features. |
| AI Insights ledger-support `cc_tools` lists (bootstrapper, knowledge archiver, knowledge curator) | Match a generic default rather than each persona's VS Code grant | Promoted to step 19 | Parity surfaces them as errors, and aligning them is the fix. |
| `ai-insights/personas/persona-build.config.js` | Gains one key | New code only — no existing structure reshaped | — |

## Detailed Steps

1. **Link the local library into AI Insights (dev setup).**
   - In `ai-persona-builder/`, run `npm install` (if needed) and `npm run build`.
   - Record a baseline. In `ai-insights/`, run `node scripts/build-personas.js` with the currently installed library. Copy `personas/{ledger,standalone,ledger-support}/{vs-code,claude-code,deep-agents}/` and `personas/name-mapping.json` to the session scratchpad.
   - Replace the real directory `ai-insights/personas/node_modules/@mistralys/persona-builder` with a relative symlink: `ln -s ../../../../ai-persona-builder ai-insights/personas/node_modules/@mistralys/persona-builder`. On Windows, use `mklink /J` with absolute paths.
   - Do not edit `personas/package.json` or `personas/package-lock.json`.
   - Verify that `node scripts/build-personas.js --check` exits 0.
   - Write `ai-persona-builder/docs/agents/plans/2026-09-29-persona-targets-and-tool-validation/dev-linking.md` (new) covering:
     - the link command
     - "rebuild the library (`npm run build`) after every change"
     - the revert command: `cd ai-insights/personas && rm node_modules/@mistralys/persona-builder && npm ci`

2. **Persona index** (includes the metadata fields and target resolution the index depends on).
   - Add `targets?: string[]` and `tool_parity_exceptions?: string[]` to `PersonaMetadata` in `src/plugins/types.ts`.
   - Create `ai-persona-builder/src/builders/persona-files.ts` (new). Move `discoverSuitePersonaYamls`, `loadRawYaml` and `loadPersonaYaml` there.
   - Create `src/builders/persona-index.ts` (new) with `PersonaIndexEntry`, `PersonaIndex`, `resolvePersonaTargets()` (§B; messages name the persona YAML path), `scanPersonas()` and `agentNameMapFromIndex()`. `scanPersonas()` fills `targets` / `declaredTargets` via `resolvePersonaTargets()`, and `toolParityExceptions` from the new field. Step 9 later extends it with exception-name validation.
   - `build()` uses them in place of `buildAgentNameMap()`. The agent map must stay byte-identical.

3. **Per-persona `targets`** (builder skip behaviour; builds on the step 2 index).
   - Give `buildSuite()` the optional trailing `personaIndex` after `registry` (§C), and skip excluded personas.
   - Add `SkippedBuild`, `BuildSummary.skipped` and `BuildSummary.issues`.
   - Document in the TSDoc that `buildPersona()` does not apply `targets`.

4. **Target-aware sub-agent validation.**
   - Create `src/validators/subagent-validator.ts` (new) with `validateSubagentRefs(persona, agentMap, index?, target?)`, covering both errors in §C. The unknown-slug check keeps its `agentMap` lookup and its skip-on-empty behaviour. The target-aware check runs only when `index` and `target` are both supplied.
   - Export it from `src/validators/index.ts` and remove the private copy.
   - `buildPersona()` gains an optional trailing `personaIndex` parameter after `registry`, and keeps `agentMap` unchanged, since it also feeds the `agent_*` context variables. Step 10 calls `validateSubagentRefs(personaMetaTyped, agentMap, personaIndex, target)`.
   - `buildSuite()` forwards its `personaIndex` (given or self-scanned) to `buildPersona()`, and `build()` passes both the index and the `agentMap` derived from it.
   - Update the `buildPersona()` / `buildSuite()` TSDoc to describe both parameters and the absent-index behaviour.

5. **Tool capability metadata and a single resolver.**
   - Extend `TargetDefinition` in `src/targets/types.ts` with `toolsContextKey?`, `toolCapabilities?` and `mcpToolPattern?`.
   - Set the built-in values in `src/targets/built-in.ts` (table in §D).
   - Create `src/targets/tools.ts` (new) with `pickToolList`, `resolveTargetTools`, `resolveCapabilities` and `recognizedBy`, and export them from `src/targets/index.ts`.
   - Refactor `buildContext()` to use `pickToolList()`. Rendered output must stay byte-identical.
   - `TargetRegistry.clone()` and `allDefinitions()` in `src/targets/registry.ts` must deep-copy `toolCapabilities` (fresh object, fresh arrays), so copies never share arrays with the original. Today both use a shallow `{ ...def }` spread.
   - Document `mcpToolPattern` as non-global in its TSDoc, and make `TargetRegistry.register()` throw when the pattern has the `g` or `y` flag (§D). The built-in patterns carry neither flag.

6. **Partial reference collection.** Add `collectPartialReferences(text, partialsMap): Set<string>` to `src/engine/partials.ts`, with the same regex and depth-2 cap as `resolvePartials()`, no imports and no console output. Export it from `src/engine/index.ts`.

7. **Tool requirement validator.**
   - Create `src/validators/tool-requirements-validator.ts` (new) with `ToolRequirement` (`id`, `when`, `targets` only — §E), `SUBAGENT_DISPATCH_REQUIREMENT` and the pure function `validateToolRequirements({ personaName, target, effectiveTools, triggered, definition, registry })`.
   - It emits the errors in §E: requirement id, target, source key, and the tools that would grant it.
   - It emits the foreign-notation warnings, naming the recognising target and the capability-equivalent tool names on the current target.
   - Add `BuildConfig.toolRequirements?` in `src/builders/types.ts`.

8. **Wire requirements into `buildPersona()` step 10.**
   - Applied list: the built-in requirement first, then config entries, with a duplicate `id` replacing the built-in.
   - Triggers: `when.field` is checked against the post-`onBuildContext` context; `when.partial` against `collectPartialReferences(bodyTemplate, personaPartialsMap)`.
   - `effectiveTools` comes from `resolveTargetTools()`. Store it on the new `BuildResult.effectiveTools`.

9. **Capability parity.**
   - Create `src/validators/tool-parity-validator.ts` (new) with the pure function `validateToolParity(personaLabel, perTarget, exceptions)` (§F).
   - In `build()`, after all suites × targets, group results by `personaYamlPath`. For each group, compute capabilities with `resolveCapabilities()` for every result whose target has a capability map and whose `effectiveTools` is defined. Run the validator and append its results to the lacking results' `validationResults`.
   - Extend `scanPersonas()` (created in step 2) to validate exception names: unknown names produce issue warnings.

10. **Build success semantics and CLI output.**
    - Add `BuildSummary.errors` and `BuildSummary.warnings`.
    - Set `success = errors === 0 && (!strict || warnings === 0)`, keeping the strict throw, and include `issues` in `strictFailures`.
    - `src/cli.ts`: `printSummary()` prints every error and warning with its suite/persona/target, the skipped count and the totals.
    - Exit 1 when `!success`.
    - Update the `USAGE` text.

11. **Library tests** (see Test Plan).

12. **Library verification.**
    - Run `npm run typecheck`, `npm test` and `npm run build` in `ai-persona-builder/`.
    - Manually run `node dist/cli.js --config <temp config>` against a temporary fixture that contains an error, and confirm the output and exit code 1.

13. **Library documentation** (see Documentation Updates). Include these limitations:
    - an absent tool list is not flagged
    - unmapped tools are ignored
    - derived `cc_tools_*` fields are computed before `onBuildContext`
    - `buildPersona()` ignores `targets`
    - `buildSuite()` and `buildPersona()` do not run parity
    - the library never deletes output for excluded targets

14. **Library changelog.**
    - Add a new top entry to `ai-persona-builder/CHANGELOG.md`, `## v3.0.0 - Persona Targets & Tool Validation`, in house style. The version is a proposal; the user sets it at release. It is proposed as a major because of the build-semantics break (§G).
    - Include one bullet, prefixed `Breaking:`, stating that error-severity results now fail every build (and the CLI exits 1) without `--strict`, and that the previously ignored unknown-sub-agent error is now among them.

15. **Rebuild** the library (`npm run build`) so the symlinked AI Insights build sees steps 2–10.

16. **AI Insights config.** In `ai-insights/personas/persona-build.config.js`, add the following, with a comment explaining that the handoff partials dispatch the successor agent:
    ```js
    toolRequirements: [
      { id: 'ledger-handoff-claude-code', when: { partial: 'handoff-block-claude-code' }, targets: ['claude-code'] },
      { id: 'ledger-handoff-vscode',      when: { partial: 'handoff-block-vscode' },      targets: ['vscode'] },
    ],
    ```

17. **AI Insights: retire the moved logic.**
    - Delete `ai-insights/scripts/lib/cc-tools-validation.js` and `ai-insights/scripts/tests/cc-tools-validation.test.js`, and remove their import and block from `ai-insights/scripts/build-personas.js`.
    - In `ai-insights/scripts/lib/subagent-reference-validation.js`:
      - remove `TARGETS`, `resolvePersonaTargets`, and target-error collection in `collectPersonas()`
      - derive each persona's targets from the `r.target` values present for its `personaYamlPath`
      - make `checkRenderedReferences()` skip the "not built for target" case, which the library now owns
      - update the header comment
    - In `build-personas.js`, remove the prune loop and the `resolvePersonaTargets` import. Keep the in-memory `build({ ...config, check: true })` for the rendered checks, and ignore its `success` there (the CLI run has already failed on errors).

18. **Confirm the parity findings.** Run `node scripts/build-personas.js --check`. The library's parity errors must be exactly the ones listed in step 19; any other finding is resolved with the same rule before continuing. The rule: align to the narrower grant, unless the persona content needs the wider one, or a YAML comment documents the difference as intentional.

19. **AI Insights: resolve parity findings.** Apply these edits. Each changes the tool list, so each persona YAML also gets a new patch entry at the top of its integrated `changelog` (dated 2026-09-29) stating the grant change and why.

    | Persona YAML | Finding | Resolution |
    |--------------|---------|------------|
    | `ai-insights/personas/ledger/src/meta/1-planner.yaml` | VS Code `agent`, no Claude Code dispatch | Add `Task` to `cc_tools`, because the planner dispatches ad-hoc sub-agents such as the Researcher (user decision, 2026-09-29). Do **not** add a `subagents` list: the content names no specific sub-agent, and a declared slug the output never references would fail AI Insights' rendered-reference check. Also add `TodoRead`, `TodoWrite` (todo row below) |
    | `ai-insights/personas/ledger-support/src/meta/ledger-orchestrator-runner.yaml` | Claude Code `Task`, no VS Code `agent` | Remove `Task` from `cc_tools`: no `subagents`, no dispatch in content |
    | `ai-insights/personas/standalone/src/meta/plan-refiner.yaml` | VS Code `web`, no Claude Code web tool | Remove `web` from `tools`, matching the documented "no web access" `cc_tools` comment |
    | `ai-insights/personas/standalone/src/meta/web-gui-specialist.yaml` | Claude Code `WebFetch`/`WebSearch`, VS Code has `browser` only | Add `tool_parity_exceptions: [web]`, with a comment that VS Code web access comes from `browser`, which has no Claude Code counterpart |
    | `ai-insights/personas/ledger-support/src/meta/ledger-bootstrapper.yaml` | Claude Code grants `Edit`, `Write`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite` beyond VS Code | Remove those six from `cc_tools` |
    | `ai-insights/personas/ledger-support/src/meta/ledger-knowledge-archiver.yaml` | Claude Code grants `Bash`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite` beyond VS Code | Remove those five from `cc_tools` |
    | `ai-insights/personas/ledger-support/src/meta/ledger-knowledge-curator.yaml` | Claude Code grants `Bash`, `Edit`, `Write`, `WebFetch`, `WebSearch`, `TodoRead`, `TodoWrite` beyond VS Code | Remove `Bash`, `WebFetch`, `WebSearch`, `TodoRead` and `TodoWrite` from `cc_tools`. Keep `Edit` and `Write`, and add `edit` to VS Code `tools`, so both targets can edit documents that mention specific insights (user decision, 2026-09-29) |
    | `ai-insights/personas/ledger/src/meta/{2-project-manager,3-developer,4-qa,5-security-auditor,6-reviewer,7-release-engineer,8-documentation,9-synthesis}.yaml`, `ai-insights/personas/standalone/src/meta/ctx-architect.yaml`, `ai-insights/personas/standalone/src/meta/module-intent-architect.yaml` (plus `1-planner` above) | VS Code `todo`, explicit `cc_tools` without todo tools | Add `TodoRead` and `TodoWrite` to `cc_tools`. The VS Code grant is deliberate and the tools are harmless; the pairing matches `plan-refiner.yaml` and `ledger-orchestrator-runner.yaml` |

    Before narrowing a list, grep the persona's content file for an instruction that needs the removed capability (e.g. a shell command, a file write, a URL fetch). If one exists, widen the other target's list instead, and record the reason in the YAML changelog.

20. **AI Insights verification.**
    - Run `npm test` in `ai-insights/` and `node scripts/build-personas.js`.
    - Diff the output trees and `name-mapping.json` against the step 1 baseline. The only allowed differences are the `tools:` frontmatter lines, and the persona version/changelog-derived lines, of the personas changed in step 19. The coordinator's VS Code and deep-agents files are absent in both.
    - Run `node scripts/build-personas.js --check`, which must exit 0.
    - Negative checks, each reverted afterwards:
      - remove `Task` from one handoff persona's `cc_tools` → dispatch error
      - remove `agent` from one ledger persona's VS Code `tools` → handoff error
      - write `read` into one `cc_tools` → foreign-notation warning plus a parity error

21. **AI Insights documentation** (see Documentation Updates) and a `personas/changelog.md` entry. Do not change the `personas/package.json` dependency range.

## Dependencies

- Step 1 runs before any AI Insights step; its baseline feeds step 20.
- Order within the library:
  - index and sub-agent checks: 2 → 3 → 4. Step 2 is self-contained: it carries the `PersonaMetadata` fields and `resolvePersonaTargets()` that `scanPersonas()` needs, so it compiles and tests on its own.
  - tool checks: 5 → 7, and 6 → 7, then 7 → 8 → 9 → 10
  - tests, docs and changelog (11–14) follow 2–10
- Step 15 (rebuild) gates steps 16–21.
- Step 16 precedes 17: handoff coverage must exist in the library before AI Insights' check is deleted.
- Order within AI Insights: 18 → 19 → 20 → 21.

## Required Components

- **Modified (library):** `ai-persona-builder/src/builders/persona-builder.ts`, `src/builders/types.ts`, `src/builders/index.ts`, `src/plugins/types.ts`, `src/targets/types.ts`, `src/targets/built-in.ts`, `src/targets/registry.ts`, `src/targets/index.ts`, `src/engine/partials.ts`, `src/engine/index.ts`, `src/validators/index.ts`, `src/cli.ts`
- **New (library):** `ai-persona-builder/src/builders/persona-index.ts`, `src/builders/persona-files.ts`, `src/targets/tools.ts`, `src/validators/subagent-validator.ts`, `src/validators/tool-requirements-validator.ts`, `src/validators/tool-parity-validator.ts`
- **New tests:** `ai-persona-builder/tests/builders/persona-index.test.ts`, `tests/builders/persona-targets.test.ts`, `tests/validators/subagent-validator.test.ts`, `tests/validators/tool-requirements-validator.test.ts`, `tests/validators/tool-parity-validator.test.ts`, `tests/builders/tool-requirements.test.ts`, `tests/builders/tool-parity.test.ts`, `tests/targets/target-tools.test.ts`, `tests/builders/build-success.test.ts`
- **Modified tests:** `ai-persona-builder/tests/builders/subagent-validation.test.ts`, `tests/engine/partials.test.ts`, `tests/targets/target-registry.test.ts`, `tests/integration/build.test.ts`
- **AI Insights modified:** `ai-insights/scripts/build-personas.js`, `ai-insights/scripts/lib/subagent-reference-validation.js`, `ai-insights/scripts/tests/subagent-reference-validation.test.js`, `ai-insights/personas/persona-build.config.js`, and the 17 persona YAMLs in step 19
- **AI Insights removed:** `ai-insights/scripts/lib/cc-tools-validation.js`, `ai-insights/scripts/tests/cc-tools-validation.test.js`
- **Dev only:** the symlink `ai-insights/personas/node_modules/@mistralys/persona-builder` → `ai-persona-builder/`; `docs/agents/plans/2026-09-29-persona-targets-and-tool-validation/dev-linking.md` (new)

## Assumptions

- Tool names: VS Code uses `execute`, `read`, `edit`, `search`, `web` and `agent`. Claude Code uses `Bash`, `Read`, `Edit`/`Write`, `Grep`/`Glob`, `WebFetch`/`WebSearch` and `Task`/`Agent`. Sources: `ai-persona-builder/docs/target-differences.md` §2 and the current AI Insights personas.
- The user reviewed the step 19 resolutions on 2026-09-29 and approved them, with two changes: the planner keeps dispatch on both targets, and the knowledge curator keeps editing on both targets. For the remaining narrowed lists, step 19's content grep guards against removing a grant the persona still needs.
- The developer workstation is macOS. Windows linking is documented but not exercised.

## Constraints

- `build()`, `buildSuite()` and `buildPersona()` change only by optional trailing parameters. `BuildSummary` and `BuildResult` only gain fields.
- Engine functions stay import-free, and the plugin runner stays synchronous.
- AI Insights `package.json` and lockfiles stay unchanged. The symlink is never committed (`personas/node_modules/` is gitignored).
- The user's uncommitted doc edits in `ai-persona-builder/docs/` must be preserved.
- No git write commands and no publishing by agents.

## Out of Scope

- The library release: version bump, tag, `npm publish`. Also the AI Insights dependency update (see Human Actions).
- An exhaustive tool mapping: `browser`, `vscode`, and custom or extension tools stay unmapped.
- Moving AI Insights' rendered-prose sub-agent checks into the library.
- Library support for `default_cc_tools`, and removing that unused key and its YAML comments from AI Insights.
- Deleting stale output for excluded targets inside the library.
- A `--target` CLI flag for the library.
- `capability` and `anyOf` fields on `ToolRequirement`. No rule in this plan needs them; add `capability` as an optional field when a field-triggered rule such as `mcp_tools` needs a capability other than `dispatch`.

## Human Actions

| # | Action | When | Why an agent cannot do it |
|---|--------|------|---------------------------|
| 1 | Publish the new `@mistralys/persona-builder` version (final version number, `package.json` bump, tag, `npm publish`) | After the run | Needs npm credentials, and the release decision is the user's |
| 2 | In AI Insights, remove the dev symlink, bump `personas/package.json` to the released range (a new major such as `^3.0.0` if action 1 follows the step 14 proposal), run `npm install`, rebuild personas | After the run | Depends on action 1; the user reserved the dependency update |

## Acceptance Criteria

- AC-01: A persona YAML `targets` list limits the targets the library renders and writes. Excluded persona × target pairs appear in `BuildSummary.skipped`, never in `results`.
- AC-02: Absent `targets` builds for every active target. Unknown names, an empty list and non-string entries produce error-severity `BuildSummary.issues`.
- AC-03: A sub-agent that exists but is not built for the current target yields an error. Unknown slugs still error. `agentMap` keeps its parameter position and its context role. An empty `agentMap` still skips the unknown-slug check, and an absent `personaIndex` skips the target-aware check.
- AC-04: Built-in vscode and claude-code definitions declare `toolsContextKey`, the capability map from §D and `mcpToolPattern`; deep-agents declares `toolsContextKey` only. `resolveTargetTools()` applies the rendering fallback, and rendered output for existing fixtures is byte-identical. `clone()` and `allDefinitions()` deep-copy `toolCapabilities`, and `register()` rejects an `mcpToolPattern` with the `g` or `y` flag.
- AC-05: A persona that declares `subagents` gets an error on each built, mapped target whose effective tool list is present but grants no `dispatch` tool.
- AC-06: `BuildConfig.toolRequirements` rules with a `partial` trigger fire only for their `targets`, when the template includes the partial directly or nested within the renderer's depth cap.
- AC-07: A tool unrecognised on its own target but recognised by another target's map or MCP pattern yields a warning that names the equivalent tools.
- AC-08: For a persona built for two or more mapped targets, each mapped capability (`execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo`, `mcp:<server>`) granted on one but not another yields an error on the lacking target. Capabilities in `tool_parity_exceptions` are exempt. Unknown exception names yield a warning, and unmapped tools never trigger parity.
- AC-09: Any error-severity result or issue makes `success` false and the CLI exit 1 without `--strict`. `--strict` also fails on warnings. The CLI prints all errors, warnings and the skipped count.
- AC-10: `validateSubagentRefs`, `validateToolRequirements` and `validateToolParity` are exported from the validators layer. `collectPartialReferences` is exported from the engine, and the `src/targets/tools.ts` helpers from the targets layer. `npm run typecheck`, `npm test` and `npm run build` pass.
- AC-11: AI Insights builds against the symlinked local library, with `package.json` and lockfiles unchanged.
- AC-12: AI Insights no longer contains `scripts/lib/cc-tools-validation.js`, `resolvePersonaTargets`, `TARGETS` or the prune step. Handoff coverage comes from `toolRequirements` for both the Claude Code and the VS Code handoff partials.
- AC-13: The parity findings are resolved per step 19, each with a persona changelog entry. The AI Insights build then reports zero errors.
- AC-14: The full AI Insights output differs from the baseline only in the step 19 personas' tool and version lines. `npm test` passes in `ai-insights/`. The three negative checks fail or warn with the library's messages.
- AC-15: Library and AI Insights documentation reflect the new fields, behaviour and limitations, per each repository's maintenance rules.

## Testing Strategy

- **Unit (library):** each pure function directly — `resolvePersonaTargets`, `collectPartialReferences`, the `tools.ts` helpers, and the three validators.
- **Builder (library):** temp suites via `tests/helpers/suite-fixture.ts`, covering skip behaviour, summary fields, plugin-modified tool lists, config requirements, the parity post-pass and success semantics.
- **Regression (library):** existing suites pass unchanged, especially `tools-block-fields`, `agent-name-map`, `subagent-validation` and `integration/build`. The sub-agent validator's signature only gains optional trailing parameters, so the existing `subagent-validation` cases need no edits.
- **Consumer integration (AI Insights):**
  - diff against the baseline, restricted to the step 19 personas
  - scripts test suite
  - three negative checks

## Test Plan

- `ai-persona-builder/tests/builders/persona-index.test.ts`:
  - `scanPersonas()` indexes every persona across suites with slug, name, version and parity exceptions. `agentNameMapFromIndex()` equals the former agent map on the integration fixture — AC-01, AC-10
- `ai-persona-builder/tests/builders/persona-targets.test.ts`:
  - `resolvePersonaTargets` rules: absent → all; subset kept; unknown → error and dropped; `[]` → error; non-string → error; duplicates removed — AC-02
  - `build()` with a `targets: ['claude-code']` persona → no vscode result, a `skipped` entry, no vscode file written — AC-01
  - `buildSuite()` without an index still skips excluded personas — AC-01
  - A persona's `targets` intersect with `config.targets` — AC-01
- `ai-persona-builder/tests/validators/subagent-validator.test.ts`:
  - `agentMap` only: unknown slug → error; empty `agentMap` → `[]` (skip-on-empty preserved)
  - `agentMap` + index + target: slug built only for claude-code, referenced during a vscode build → error
  - slug built for the target → pass
  - index given but `target` omitted → target-aware check skipped
  - slug in `agentMap` but absent from a suite-only index → no target-aware error
  - AC-03
- `ai-persona-builder/tests/builders/subagent-validation.test.ts` (modified):
  - existing `buildPersona()` cases stay as they are: they pass only `agentMap`, run through the relocated validator, and must produce the same results
  - new `buildPersona()` case with `agentMap` + `personaIndex`: a slug excluded from the current target → error
  - new `buildPersona()` case with `agentMap` only: the same persona → no target error
  - new `build()` case: target-aware error without `--strict` gives `success: false`
  - existing strict-mode `build()` cases stay unchanged
  - AC-03
- `ai-persona-builder/tests/targets/target-tools.test.ts`:
  - `pickToolList` falls back to `tools`; returns `undefined` when neither exists
  - `resolveTargetTools` uses `toolsContextKey`
  - `resolveCapabilities` maps `Edit` or `Write` → `edit`
  - MCP pattern: `central_pm/*` → `mcp:central_pm` on vscode; `mcp__central_pm` and `mcp__central_pm__ledger_ping` → `mcp:central_pm` on claude-code
  - `TodoWrite` or `TodoRead` → `todo` on claude-code; unmapped `browser` is ignored
  - `recognizedBy('read', registry, 'claude-code')` → `['vscode']`
  - AC-04, AC-07, AC-08
- `ai-persona-builder/tests/targets/target-registry.test.ts` (modified):
  - built-in definitions expose the §D values
  - `clone()` and `allDefinitions()` deep-copy `toolCapabilities`: mutating a copy's array leaves the original unchanged
  - `register()` throws for an `mcpToolPattern` with the `g` or `y` flag; the built-in patterns register
  - a custom target without the new fields registers and builds
  - AC-04
- `ai-persona-builder/tests/builders/tools-block-fields.test.ts` (unchanged, must pass) — derived tool fields are byte-identical after the refactor — AC-04
- `ai-persona-builder/tests/engine/partials.test.ts` (modified):
  - `collectPartialReferences` finds direct and depth-1 nested references
  - it stops at the depth-2 cap exactly like `resolvePartials`
  - it emits no console output
  - AC-06
- `ai-persona-builder/tests/validators/tool-requirements-validator.test.ts`:
  - triggered and granted → `[]`
  - triggered, not granted → one error naming the id, target, key and tools
  - untriggered → `[]`
  - undefined effective tools → `[]`
  - target without a capability map → skipped
  - target whose map has no `dispatch` entry → skipped
  - foreign tool `read` in claude-code → a warning naming `Read`
  - AC-05, AC-07
- `ai-persona-builder/tests/validators/tool-parity-validator.test.ts`:
  - vscode `[execute, read]` vs claude-code `[Read]` → one `execute` error on claude-code naming `Bash`
  - `Edit`-only satisfies `edit`
  - `mcp:central_pm` mismatch → error
  - capability in exceptions → no error
  - a single mapped target → `[]`
  - `browser` differences → `[]`; a `todo` difference → error
  - AC-08
- `ai-persona-builder/tests/builders/tool-requirements.test.ts`:
  - `subagents` persona lacking `Task` → error on the claude-code result only
  - lacking `agent` → error on the vscode result
  - config rule `{ partial: 'handoff', targets: ['claude-code'] }` fires for a nested include, and not on vscode
  - a plugin `onBuildContext` adding `Task` clears the error
  - a config rule reusing the built-in id replaces it
  - `BuildResult.effectiveTools` is recorded
  - AC-05, AC-06
- `ai-persona-builder/tests/builders/tool-parity.test.ts`:
  - two-target build with a mismatched `execute` → error attached to the lacking target's result
  - `tool_parity_exceptions: [execute]` → no error
  - unknown exception name → a warning in `issues`
  - a persona excluded from vscode via `targets` → no parity run
  - deep-agents results do not take part
  - AC-08, AC-02
- `ai-persona-builder/tests/builders/build-success.test.ts`:
  - error result → `success: false` without strict, and no throw
  - warnings only → success without strict; throws with strict
  - `errors`/`warnings` counts are correct
  - `issues` are included in `strictFailures`
  - AC-09
- `ai-persona-builder/tests/integration/build.test.ts` (modified) — three-target build over the integration fixture, with one persona restricted by `targets` and one parity exception. Asserts results, skipped entries, file presence and zero errors — AC-01, AC-08, AC-10
- CLI output and exit code — manual check in step 12 (no CLI test harness exists) — AC-09
- `ai-insights/scripts/tests/subagent-reference-validation.test.js` (modified):
  - remove the `resolvePersonaTargets` cases
  - targets come from which results are present
  - a dispatch to a persona absent on vscode is not reported by this module
  - prose-check cases stay
  - AC-12
- `ai-insights/scripts/tests/cc-tools-validation.test.js` — deleted with its module. Its cases (subagents, handoff partial, both reasons, non-matching partials ignored) are covered by `tool-requirements-validator.test.ts` / `tool-requirements.test.ts` — AC-12
- AI Insights verification (steps 18 and 20) — the expected step 19 findings, then zero errors, restricted baseline diff, `npm test` green, three negative checks — AC-11, AC-13, AC-14
- Documentation review against Documentation Updates (steps 13 and 21) — AC-15

## Documentation Updates

**Persona Builder** (per `ai-persona-builder/AGENTS.md` Manifest Maintenance Rules):
- `ai-persona-builder/docs/agents/project-manifest/api-surface.md`, covering:
  - `PersonaMetadata.targets` / `tool_parity_exceptions`
  - the new `TargetDefinition` fields
  - `BuildConfig.toolRequirements`
  - `BuildResult.effectiveTools`
  - `BuildSummary.skipped` / `issues` / `errors` / `warnings`
  - `SkippedBuild`, `ToolRequirement`, `SUBAGENT_DISPATCH_REQUIREMENT`
  - `validateSubagentRefs` (corrected location and signature), `validateToolRequirements`, `validateToolParity`
  - the `buildPersona()` paragraph at L64, which gains the `agentMap` / `personaIndex` coexistence rules (§C). The skip-on-empty sentence stays true.
  - `collectPartialReferences` and the `src/targets/tools.ts` helpers
  - `scanPersonas` / `PersonaIndex`
  - the new optional parameters
  - CLI semantics
- `ai-persona-builder/docs/agents/project-manifest/data-flows.md`:
  - §1 pipeline: index pre-scan, target skip, requirement validation, parity post-pass
  - §6 CLI flow
- `ai-persona-builder/docs/agents/project-manifest/constraints.md`:
  - Invariant 3, updated for "errors always fail"
  - tool-validation constraints next to §4
  - Known Limitations (step 13)
  - preserve the uncommitted edits
- `ai-persona-builder/docs/agents/project-manifest/file-tree.md` — the six new source files and nine new test files.
- `ai-persona-builder/docs/agents/project-manifest/README.md` — test count or version line if present (preserve uncommitted edits).
- `ai-persona-builder/AGENTS.md` — the "236 tests across 15 files" figures in Project Stats and Test Command.
- `ai-persona-builder/docs/metadata-reference.md` — `targets` and `tool_parity_exceptions` fields; a dispatch-grant note in Tier 4c (preserve uncommitted edits).
- `ai-persona-builder/docs/configuration.md` — `BuildConfig.toolRequirements`, the new `BuildSummary`/`BuildResult` fields, success semantics.
- `ai-persona-builder/docs/target-differences.md`:
  - §2: the capability correspondence table from §D, with a note that unmapped tools are ignored
  - §4: parity and exceptions
  - §7 checklist: the build now catches these mistakes
- `ai-persona-builder/docs/cli.md` — exit codes and printed output.
- `ai-persona-builder/README.md` — Features: per-persona targets, tool-grant, parity and notation validation.
- `ai-persona-builder/CHANGELOG.md` — the step 14 entry.

**AI Insights** (per `ai-insights/AGENTS.md` Manifest Maintenance Rules and Changelog Convention):
- `ai-insights/AGENTS.md` and `ai-insights/CLAUDE.md`:
  - remove the `scripts/lib/cc-tools-validation.js` row
  - update the `subagent-reference-validation.js` row: prose checks only, targets taken from library results
  - note that target, dispatch-grant and parity checks come from the library
- `ai-insights/personas/docs/agents/project-manifest/constraints.md` (L204–L205) — the library enforces dispatch grants on both targets and capability parity, with `tool_parity_exceptions`; update the rendered-check wording.
- `ai-insights/personas/docs/agents/project-manifest/api-surface.md`:
  - L33–L35 validations list
  - L222 and L462 `targets` text: the library now skips excluded targets
  - new `tool_parity_exceptions` field row next to `targets`
  - `toolRequirements` config key
- `ai-insights/personas/docs/persona-build-system.md` — config table (near L777): `toolRequirements`; persona `targets` and `tool_parity_exceptions` are library-enforced.
- `ai-insights/personas/changelog.md` — outcome-only lines:
  - one "Build:" line: the library enforces persona targets, dispatch grants and tool parity
  - one line for the aligned tool grants of the step 19 personas
- `.context/` — regenerate with `node scripts/cli.js ctx-generate` after the doc and persona edits.


## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Narrowing a grant removes a tool a persona needs** | Step 19 greps each content file before narrowing; if something needs the tool, widen the other target instead. Each change is recorded in the persona changelog for the user to review. |
| **The rough map produces false positives** | Only seven basic capabilities plus MCP server names are mapped, and everything else is ignored. `tool_parity_exceptions` documents intentional differences. Step 18 confirms the AI Insights findings are exactly the known ones from step 19. |
| **Refactoring the pre-scan or tool fallbacks changes rendered output** | The existing library tests stay unchanged, and the step 20 baseline diff is restricted to the step 19 personas. |
| **A stale `dist/` means AI Insights tests the old library** | Step 15 rebuilds. `dev-linking.md` states the rebuild rule. The step 20 negative checks prove the new code is live. |
| **Symlinked module resolution fails (e.g. `js-yaml`)** | The library resolves from its own `node_modules` (step 1 installs it). The step 1 `--check` run validates the setup. |
| **Deleting AI Insights' `Task` check before the library covers handoffs** | Step 16 precedes 17. The step 20 negative check exercises the handoff path. |
| **Partial detection disagrees with rendering** | Shared regex and depth cap, with a test asserting parity at the cap. |
| **The build-semantics change reaches consumers unannounced** | Step 14 proposes a major version and marks the changelog bullet `Breaking:`; the user confirms the final number at release (Human Action 1). |
| **Shared definition state between registry copies** | `clone()`/`allDefinitions()` deep-copy `toolCapabilities`, and `register()` rejects stateful (`g`/`y`) `mcpToolPattern`s; both are tested in `target-registry.test.ts`. |
| **Overwriting the user's uncommitted library doc edits** | Stated constraint: edit in place, never replace. |

## Recommended Workflow
- **Workflow:** ledger
- **Rationale:** Two repositories and several distinct concerns: library architecture (persona index, registry capability metadata, three validators, engine API), a build-semantics change, retiring consumer code, and persona grant changes. The run needs formal QA and code review.
