# Plan

## Plan Audit Cycles
- Audits: none — Plan Auditor v1.11.0
- Architectural Reviews: none — Plan Architect Reviewer v2.3.4

## Prior Project Context

- **Origin.** This is the first rework of `2026-09-30-persona-targets-and-tool-validation` (17/17 WPs COMPLETE). Its synthesis (`../2026-09-30-persona-targets-and-tool-validation/synthesis.md`) left seven deferred or follow-up items. This plan triages each one and also takes in the bug report `docs/agents/bug-reports/command-whitespace-handling.md`. At the user's request (2026-09-30), it also adds template comment syntax.
- **Strategic vision.** `ledger_get_repository_context` returns no declared short-, mid- or long-term vision for `ai-persona-builder`. The plan follows the direction the synthesis recommends: one shared implementation in the library, with consumers thin.
- **Reused insights.**
  - `b3ea12b4-1fb3-4aa3-8e72-6dcc501d426d`: the Template Syntax table in `constraints.md` is the authoritative syntax contract. Updating it is a first-class acceptance criterion (AC-08, AC-18).
  - `e41ef85e-495a-48e5-a3be-138759930fb0`: engine files keep zero imports. The new parser and the comment stripper therefore live together inside `conditionals.ts` (AC-05).
  - `2cd87f16-2556-4523-af27-0b88a6adbf0b`: guard registry, where checks return structured results and one runner owns the exit decision. This shapes the build-wrapper reshape (step 9).
  - `48607cdb-51a9-4483-a9ec-28b4ead77b23`: every guard needs a synthetic failing fixture (Test Plan).
  - `7d13934f-9d72-4156-9616-15741f3e8f94`: validation of supplied content has a hard ceiling. So malformed conditional or comment tags stay a literal pass-through instead of becoming a new error class.
- **Pending from the prior plan (user actions).** The library is not yet published as the proposed v3.0.0, and `ai-insights` still consumes it through the dev symlink. This plan builds on that same unpublished state. The whitespace fix and comment syntax ship in the same proposed major release.

## Summary

This plan does three things.

First, it fixes the conditional-engine bug in `@mistralys/persona-builder`: `{{#if}}…{{/if}}` blocks currently swallow the blank lines around them and add line breaks around inline conditionals.

Second, it adds template comments (`{{!-- … --}}` and `{{! … }}`). This syntax is expected of any `{{…}}` templating language, and `ai-insights` already writes it — two content files contain `{{!-- … --}}` lines that the engine does not yet understand.

Third, it works through every actionable item left in the synthesis of `2026-09-30-persona-targets-and-tool-validation`.

The engine work replaces the regex-and-rewrite resolver in `src/engine/conditionals.ts` with a single-pass tokenizer. One set of line rules governs both conditional tags and comments:
- a tag standing alone on its line removes that whole line;
- an inline tag removes only itself;
- where removing a tag line would put two blank-line runs next to each other, they merge into the longer one.

Comments are stripped by the builder before partial expansion, frontmatter rendering, and any raw-template scan. So a commented-out partial, variable or conditional is fully inert.

The synthesis items are:
- the deferred documentation debt in the library (the engine API in `docs/api.md`, and stale test inventories);
- codifying the synthesis' two reusable design patterns in the manifest;
- the medium-priority `build-personas.js` fail-fast debt in `ai-insights`, reshaped into a check runner so one failure no longer hides the rest;
- the flaky subprocess test timeouts in `ai-insights`;
- documenting the planner's deliberate dispatch grant;
- documenting the changelog-as-audit-trail and parity-exception conventions;
- a CTX regeneration pass.

A byte-level diff of the full `ai-insights` persona build verifies the engine changes end to end. The only differences allowed are added blank lines.

## Architectural Context

**Library (`ai-persona-builder/`)** is layered as builders → plugins → engine / loaders / validators (`AGENTS.md`).
- The engine (`src/engine/`) is pure: five modules with zero imports and no cross-module references (`docs/agents/project-manifest/constraints.md` §1).
- `buildPersona()` in `src/builders/persona-builder.ts` works like this:
  - It copies the suite partials map and runs `onPersonaPartials` plugins over it (L446–L456).
  - It renders frontmatter through `renderFrontmatter()` in `src/builders/frontmatter.ts` (L98–L106), which runs conditionals → variables.
  - It loads the body template (L468) and runs `resolvePartials` → `resolveConditionals` → `resolveVariables` → `collapseBlankLines` → `ensureBlankLineBeforeHeadings` → `trimEnd` (L471–L476).
  - It checks tool requirements with `isToolRequirementTriggered()` (L318–L333). This scans the **raw** body template via `collectPartialReferences()`.
- The suite partials map merges `BuildConfig.partials`, the shared partials directory, the suite partials directory and `runPartials` plugins (L614–L632).
- `resolveConditionals(text, context): string` is exported from the package root (`src/engine/index.ts` L9, `src/index.ts` L9).
- Today, `resolveConditionals` works in two stages. A pre-pass (`resolveElseIf`) rewrites `{{else if}}` into nested `{{else}}{{#if}}`. Then an innermost-first regex loop runs; its pattern consumes `\n*` on both sides of a block and re-emits exactly one `\n` (`src/engine/conditionals.ts` L111–L155).
- `collapseBlankLines()` caps blank runs at **two** blank lines. `ensureBlankLineBeforeHeadings()` repairs headings and `---` rules only (`src/engine/postProcessor.ts`).
- There is no comment syntax.

**AI Insights (`ai-insights/`)** consumes the library through a dev symlink at `personas/node_modules/@mistralys/persona-builder`, which points at `../../../../ai-persona-builder`. It runs the built `dist/cli.js` from the thin wrapper `scripts/build-personas.js`. The wrapper runs, in order:
1. a pre-clean;
2. the library CLI (`execFileSync`, whose `catch` calls `process.exit`);
3. two real-build-only post-build steps: version sync and `name-mapping.json`;
4. five checks. Three are errors, each with its own `process.exit(1)`: the inline `{{agent_slug_*}}` check, which scans raw content files; insight fields; and rendered sub-agent references. Two are warnings: philosophy tone and changelog size.

Checks otherwise live in `scripts/lib/*.js` as pure functions returning string arrays. Tests run with Vitest from `scripts/tests/`, using the default 5 s timeout (`vitest.config.ts`). The persona sources live in `personas/{ledger,standalone,ledger-support}/src/` and `personas/shared/partials/`. The persona manifest lives in `personas/docs/agents/project-manifest/`.

## Approach / Architecture

### 1. Block-tag engine — tokenizer + block tree (library)

Rewrite the internals of `src/engine/conditionals.ts`. The file keeps zero imports, and `resolveConditionals`' exported signature stays the same.

1. **Tokenize** the input in one linear scan into text runs and tag tokens.
   - **Conditional tags** are exactly today's: `{{#if NAME}}`, `{{else if NAME}}`, `{{else}}`, `{{/if}}`, where `NAME` matches `\w+`.
   - **Comment tags** (new) come in two forms:
     - `{{!-- … --}}`: ends at the first `--}}`, may contain `}}`, and may span lines;
     - `{{! … }}`: ends at the first `}}`, and may span lines.
   - Each tag token records whether it is **standalone**. For a single-line tag, that means it is the only non-whitespace content on its line (spaces and tabs allowed around it). For a multi-line comment, it means only whitespace precedes it on its first line and only whitespace follows it on its last line.
2. **Build a block tree** with a stack.
   - Each `{{#if}}` opens a block with an ordered list of branches (`if`, any number of `else if`, an optional final `else`).
   - `{{else if}}` is handled natively, so the `resolveElseIf` pre-pass, `ELSE_IF_PATTERN` and `NO_NESTED_IF` are retired.
3. **Render** by walking the tree. The first truthy branch wins, the `else` branch applies if none is truthy, and nothing is emitted otherwise. Unknown flags are falsy. Truthiness is JS truthiness of `context[flag]`, as today. Comment tokens emit nothing.
4. **Whitespace rules**, one contract for both tag kinds, documented in `docs/template-syntax.md`:
   - **Standalone tag:** its entire line (or lines, for a multi-line comment) is removed, including the final line terminator. On a last line without a terminator, only the line content is removed.
   - **Inline tag:** only the tag characters are removed. The rest of the line is untouched.
   - **Blank-run merge:** where removing standalone tag lines leaves a blank-line run directly above and another directly below, the two merge into the longer run instead of adding together. A blank line is empty or whitespace-only. The merge applies at every block boundary, whether a branch was kept or the whole block was removed, and around removed comment lines. So a removed block or comment between two paragraphs leaves exactly one paragraph break.
5. **Malformed input keeps today's behaviour:** it is emitted literally.
   - A `{{/if}}` with no open block, an `{{else}}`/`{{else if}}` outside any block, and an unclosed `{{#if}}` all pass through as text. Balanced blocks nested inside an unclosed opener still resolve.
   - Once a block has a plain `{{else}}`, any further `{{else}}`/`{{else if}}` in that block is literal text of the final branch. Today's regex behaves the same way.
   - An unterminated `{{!--` or `{{!` (no closing delimiter before end of input) passes through as text.
6. **Two entry points share the tokenizer:**
   - **`stripComments(text: string): string`** (new, exported). It removes comment tokens under the whitespace rules and leaves conditional tags and all other text untouched.
   - **`resolveConditionals(text, context)`** also drops any comment tokens it meets. So a direct API caller that skips `stripComments` still gets comment-free output. For callers that already stripped, the extra pass changes nothing.

Worked examples, which also serve as test vectors:

| Input | Context / call | Output |
|---|---|---|
| `Para one.\n\n{{#if a}}\nInside.\n{{/if}}\n\nPara two.` | `a: true` | `Para one.\n\nInside.\n\nPara two.` |
| same | `a: false` | `Para one.\n\nPara two.` |
| `Para one.\n\n{{#if a}}\nX\n{{else}}\nY\n{{/if}}\n\nPara two.` | `a: false` | `Para one.\n\nY\n\nPara two.` |
| `Intro:\n\n{{#if a}}\nA\n{{else if b}}\nB\n{{else}}\nC\n{{/if}}\n\nOutro.` | `b: true` | `Intro:\n\nB\n\nOutro.` |
| `Line one.\n{{#if a}}\nInside.\n{{/if}}\nLine two.` | `a: true` / `false` | `Line one.\nInside.\nLine two.` / `Line one.\nLine two.` |
| `Use the {{#if a}}Task{{else}}task{{/if}} tool.` | `a: true` | `Use the Task tool.` |
| `{{#if o}}\nRO\n{{else}}\nIntro:\n\n{{#if t}}\nT\n{{/if}}\n\nAfter.\n{{/if}}` | `o: false, t: true` | `Intro:\n\nT\n\nAfter.\n` |
| `description: 'd'\n{{#if model}}model: 'm'\n{{/if}}role: r` | `model: true` / `false` | `description: 'd'\nmodel: 'm'\nrole: r` / `description: 'd'\nrole: r` |
| `A\n\n{{!-- note\nspanning }} lines --}}\n\nB` | `stripComments` | `A\n\nB` |
| `Use {{! short }}this.` | `stripComments` | `Use this.` |
| `{{else}}{{!-- fallback --}}\nX` | `stripComments` | `{{else}}\nX` (the line is now a standalone `{{else}}`) |
| `{{!-- {{> p}} {{#if a}} {{v}} --}}` | `stripComments` | `` (empty) |

The frontmatter row mirrors `ai-insights/personas/plugins/ledger/frontmatter-templates.js` L50–L51. That is the only mixed inline/multi-line conditional in the consumer, and it renders exactly as it does today. The `{{else}}{{!-- fallback --}}` row mirrors the two existing `ai-insights` lines, which become well-formed.

### 2. Comment stripping in the builder (library)

Comments are removed before anything else reads a template:
- **Body template:** in `buildPersona()`, `stripComments(normalizeNewlines(...))` runs immediately after loading (L468). The stripped template feeds both rendering and `isToolRequirementTriggered()`. So a commented-out `{{> partial}}` never expands and never triggers a tool requirement.
- **Partials:** in `buildPersona()`, every value of the final per-persona partials map is passed through `stripComments` right after `runPersonaPartials` (step 4). That one point covers every partial source: config, shared directory, suite directory, and both plugin hooks. The builder keeps the stripped map in a local variable and passes it on, never mutating the suite map.
- **Frontmatter:** `renderFrontmatter()` calls `stripComments` before `resolveConditionals`.
- **Order:** the documented pipeline becomes stripComments → partials → conditionals → variables.

`stripComments` is exported from the package root through `src/engine/index.ts`. It lives in `conditionals.ts`, not a new module, so the whitespace contract has exactly one implementation (see Considered Alternatives).

### 3. Library documentation

- **Fix and feature documentation.** Update `docs/template-syntax.md` (new Comments section, whitespace subsection), `api-surface.md`, the `constraints.md` Template Syntax table and Known Limitations, `data-flows.md` (pipeline), `README.md` (feature bullet), the `postProcessor.ts` JSDoc, and `CHANGELOG.md`.
- **Documentation-debt sweep (promoted from the synthesis).**
  - Document the engine API, including `stripComments`, in `docs/api.md`.
  - Correct the test inventories in `tests/README.md`, `file-tree.md` and `AGENTS.md`.
  - Codify the synthesis' two design templates in `tech-stack.md` Key Patterns.

### 4. AI Insights build wrapper — check runner

- **New `scripts/lib/build-checks.js`.** It exports a runner and an exit-code resolver:
  - The runner executes an ordered list of check descriptors, `{ id, label, severity: 'error' | 'warning', run(): string[] | Promise<string[]> }`. It prints each non-empty result under its label and returns the counts, `{ errorCount, warningCount }`.
  - The resolver combines the library CLI's status with the error count.
- **New `scripts/lib/agent-slug-validation.js`.** The inline `{{agent_slug_*}}` check moves here, including its `extractSubagentsList` helper. It accepts an injected `stripComments` function, and the wrapper passes the library's, so a slug reference inside a comment is not reported.
- **`scripts/build-personas.js` changes:**
  - It records the library CLI's exit status instead of exiting.
  - It always runs the real-build post-build steps. Both derive from source YAML and the changelog, not from rendered output.
  - It passes all five checks to the runner.
  - It calls `process.exit` exactly once, at the end, with the resolved code.

### 5. AI Insights tests, persona sources and docs

- **Subprocess timeout.** Add a shared constant `SUBPROCESS_TEST_TIMEOUT_MS` and apply it per suite to every `scripts/tests/` suite that spawns child processes.
- **Planner dispatch grant.** Add an inline rationale comment at the planner's dispatch grant, plus a cross-reference in the persona `constraints.md`.
- **Conventions.** Record the two conventions in the persona `constraints.md`, and point persona authors at the new comment syntax.
- **Wrapper documentation and changelog.** Update the wrapper documentation, and add summary bullets to the WIP personas changelog entry.
- **CTX.** Regenerate `.context/`.

### 6. Verification

- **Baseline.** Before touching the engine, build `ai-insights` against the current library and copy the nine rendered output directories to a baseline directory outside both repositories.
- **Diff.** After the engine and builder changes, rebuild and diff:
  - `diff -rB baseline current` must be empty (no change apart from blank lines);
  - every line `diff -r` reports must be an added empty line.

  The two existing `{{!-- … --}}` lines sit in branches no registered target selects, so the comment work must not change output either.

## Rationale

- **Tokenizer instead of a patched regex.** Both reported defects come from the regex's shape. It has no concept of "a tag alone on its line", so it cannot tell a paragraph break the author wrote apart from surplus whitespace. The `{{else if}}` pre-pass makes things worse, because it creates synthetic lines that hold two tags. A line-aware fix on top of it would have to see through those. A tokenizer that knows each tag's line context resolves both defects with one rule. It handles `{{else if}}` natively, and it replaces an O(depth × n) multi-pass loop with one pass. The standalone-line rule is the de facto convention of Mustache and Handlebars, which this syntax already imitates, so template authors meet no surprises.
- **Comments in scope, using Handlebars syntax.**
  - Comments are table stakes for a templating language: authors need notes that never reach the output, such as why a fallback branch exists or why a partial is excluded.
  - `ai-insights` already writes `{{!-- … --}}` in two content files, expecting it to work. Those lines are the named first consumer.
  - Both Handlebars forms are supported. The short form is the natural choice for a one-word note, and the long form is needed whenever the note mentions template syntax (`}}`).
- **Comments stripped first, in the builder.**
  - Partials expand before conditionals, and `isToolRequirementTriggered()` scans the raw template. Removing comments inside `resolveConditionals` alone would come too late: a commented-out `{{> handoff-block-claude-code}}` would still expand, warn if missing, and trigger a dispatch-grant requirement.
  - Stripping at load time in `loadPartials` would miss partials injected through `BuildConfig.partials` and plugin hooks.
  - The final per-persona partials map, the loaded body template and `renderFrontmatter()` are the three points every template passes through.
- **One module for both tag kinds.** The engine forbids cross-module references, so a separate `comments.ts` would need its own copy of the standalone-line and blank-run-merge logic. That duplicates a whitespace contract that must stay identical for both tag kinds. Keeping both in the tokenizer of `conditionals.ts` gives the contract one implementation. The module doc names its wider scope instead of renaming the file (see Structural Improvements).
- **Blank-run merge inside the engine.** `collapseBlankLines()` caps runs at two blank lines, so it cannot turn a removed block's `\n\n\n\n` into the single paragraph break the bug report requires. Changing that cap would alter unrelated authored output. Only the tokenizer knows that two runs became adjacent because of a removed tag, so the merge belongs there.
- **Malformed tags stay literal.** The engine API returns strings and never throws; findings flow through validators. Turning malformed tags into errors would be new API surface without a consumer. Per insight `7d13934f`, it would also chase content mistakes that are not the engine's to police.
- **Wrapper runner instead of deleting one `process.exit`.** Deleting only the CLI `catch` exit would still leave four other fail-fast exits. Each hides later findings, so one broken persona costs a build per error to uncover. One runner that owns the exit decision fixes the whole class, makes the decision testable with synthetic checks, and gives the next wrapper check an obvious place to go. The wrapper has gained two checks in recent months (philosophy tone, changelog size).
- **Promoting the deferred items.** Each promoted item lies inside the blast radius:
  - The documentation debt sits in the same manifest files this fix must update anyway.
  - The wrapper and the flaky tests are the tools this plan's verification relies on.
  - The planner-grant comment and the convention docs extend the persona constraints section on dispatch grants and parity, which the prior plan wrote.

## Considered Alternatives

| Decision | Chosen Shape | Alternatives Considered | Trade-Off Summary |
|----------|--------------|-------------------------|-------------------|
| Conditional resolver structure | Single-pass tokenizer + block tree inside `conditionals.ts`, native `{{else if}}` | (a) Patch the regex to capture and re-emit the surrounding newlines; (b) repair blank lines afterwards in `postProcessor.ts` | (a) cannot tell inline from standalone tags and still fights the `{{else if}}` rewrite's multi-tag lines. (b) runs after the information has been lost. The tree is the only shape where each rule is local. |
| Whitespace semantics | Standalone tag line removed whole; inline tag removed alone; adjacent blank runs merge to the longer | (a) Keep every newline verbatim and remove only tag text; (b) keep today's behaviour and add an opt-in `preserveBlankLines` flag | (a) leaves an empty line wherever a tag line was, which breaks tight lists, tables and frontmatter. (b) adds API surface and leaves the broken default in place for every consumer. |
| Removed-block paragraph break | Merge inside the tokenizer | (a) Rely on `collapseBlankLines()`; (b) lower `collapseBlankLines()` to cap at one blank line | (a) caps at two blank lines, which is still wrong. (b) changes output wherever authors deliberately wrote two blank lines, unrelated to conditionals. |
| Comment syntax | Handlebars `{{!-- … --}}` and `{{! … }}` | (a) Long form only; (b) HTML comments `<!-- -->` stripped by the engine; (c) a new custom marker such as `{{# …}}` | (a) forces the verbose form for trivial notes. (b) breaks legitimate HTML comments that authors want rendered, such as the column-0 partial notes (insight `660d8039`). (c) has no prior art. `ai-insights` already writes the Handlebars form. |
| Where comments are stripped | Builder: loaded body template, final per-persona partials map, `renderFrontmatter()` — before partials and raw scans | (a) Inside `resolveConditionals` only; (b) in `loadPartials` / content loader | (a) runs after partial expansion, so commented partials still expand, warn and trigger tool requirements. (b) misses config- and plugin-injected partials. |
| Module for comment handling | Same tokenizer in `conditionals.ts`, with a new `stripComments` export | (a) New `src/engine/comments.ts`; (b) rename `conditionals.ts` to a block-tags module | (a) must duplicate the whitespace contract, because engine modules may not reference each other. (b) churns import paths, the test mirror and manifest references, for naming alone. |
| Malformed tag handling | Literal pass-through (unchanged; also for unterminated comments) | Throw, or emit a validation warning | The engine has no error channel. A warning would need a validator hook and new surface for a case no consumer has reported. |
| Wrapper failure propagation | Check runner (`scripts/lib/build-checks.js`) with one exit point | (a) Remove only the CLI `catch` exit; (b) wrap everything in `try/finally` | (a) leaves four fail-fast exits. (b) runs the post-build steps but still stops at the first failing check, and cannot be tested in isolation. |
| Flaky subprocess suites | Shared `SUBPROCESS_TEST_TIMEOUT_MS` applied per suite | (a) Raise the global `testTimeout`; (b) disable file parallelism | (a) also hides real hangs in pure unit suites. (b) slows the whole suite to fix two files. |
| Planner dispatch-grant documentation | Inline YAML rationale comment + persona `constraints.md` cross-reference | Add a `subagents` list to `1-planner.yaml` | The planner names no specific sub-agent. A declared slug that the output never references fails the rendered-reference check (1-planner changelog 2.12.0). |

## Pattern Alignment

- **Follows** the zero-import engine invariant. All tokenizer, conditional and comment code stays in `ai-persona-builder/src/engine/conditionals.ts` (`constraints.md` §1).
- **Follows** hoisted module-level constants with documented regex state, the pattern at `ai-persona-builder/src/engine/conditionals.ts` L19–L30, for the tag-matching regexes the tokenizer uses.
- **Follows** the engine barrel export at `ai-persona-builder/src/engine/index.ts` for the new `stripComments` export.
- **Extends** the mandatory partials → conditionals → variables order with a leading comment-strip step: stripComments → partials → conditionals → variables. Justification: comments must be inert for every later stage (Rationale). The rest of the order is unchanged at `ai-persona-builder/src/builders/persona-builder.ts` L471–L476.
- **Follows** Handlebars' comment syntax, consistent with the library's Handlebars-style tags and with the variable-escape plan's stated preference for prior art (`docs/agents/implementation-history/2026-05-31-variable-escape-syntax/plan.md` L71).
- **Follows** tests mirroring `src/` (`ai-persona-builder/tests/engine/conditionals.test.ts`), and builder tests using `createMinimalSuite()` from `ai-persona-builder/tests/helpers/suite-fixture.ts`.
- **Follows** the proposed-version changelog section in `ai-persona-builder/CHANGELOG.md` L5–L7. Both changes are added to the existing `v3.0.0 (proposed)` entry rather than opening a new version.
- **Follows** `ai-insights/scripts/lib/*.js` pure check functions returning string arrays (`ai-insights/scripts/lib/insight-validation.js`) for the extracted `{{agent_slug_*}}` check.
- **Follows** the inline-rationale-comment precedent of `ai-insights/personas/standalone/src/meta/web-gui-specialist.yaml` L36–L44 for the planner grant comment.
- **Departs** from the wrapper's inline `process.exit` per check (`ai-insights/scripts/build-personas.js`) in favour of a runner descriptor list. Justification: global insight `2cd87f16` (guard registries). The departure is recorded in the persona `api-surface.md` wrapper section.
- **Departs** from Mustache in one respect: the blank-run merge. Mustache would leave two blank lines where a removed block sat between two paragraphs. The bug report's "Behaviour to keep" explicitly requires one.

## Structural Improvements

| Structure | Observation | Decision | Reason |
|-----------|-------------|----------|--------|
| `ai-persona-builder/src/engine/conditionals.ts` — regex loop + `resolveElseIf` rewrite pre-pass | Whitespace is a by-product of a greedy `\n*` regex. The `{{else if}}` rewrite creates multi-tag lines. Resolution takes multiple passes. | Promoted to step 2 | It is the root cause of both reported defects. Reshaping is cheaper than patching around the rewrite. |
| `ai-persona-builder/src/engine/conditionals.ts` — module name vs. its wider scope once comments join | The module will own all block-level tags (conditionals and comments), not only conditionals. | Rename rejected; module doc widened in step 3 | A rename churns import paths, the test mirror, `file-tree.md`/`api-surface.md` and consumer-facing docs, for naming alone. The exports keep their names. |
| `ai-persona-builder/src/builders/persona-builder.ts` — `isToolRequirementTriggered()` scans the raw body template | Once comments exist, a commented-out partial reference would count as a trigger. | Promoted to step 3 | The body template is stripped at load, so every consumer of `bodyTemplate`, this one included, sees comment-free text. |
| `ai-persona-builder/src/engine/postProcessor.ts` — `ensureBlankLineBeforeHeadings()` | Its JSDoc cites the conditional single-`\n` delimiter as a reason to exist. | Promoted to step 5 (JSDoc only); removal of the function rejected | Partials are still `trimEnd()`-ed (`partials.ts` L46–L47), so the heading repair is still needed. Removing it would change output outside this fix. |
| `ai-persona-builder/src/engine/postProcessor.ts` — `collapseBlankLines()` two-blank-line cap | The bug report assumed it would absorb surplus from removed blocks. It caps at two, not one. | Rejected | Lowering the cap alters authored double blank lines unrelated to conditionals. The tokenizer's merge handles the tag case. |
| `ai-persona-builder/tests/README.md`, `docs/agents/project-manifest/file-tree.md`, `AGENTS.md` test inventories | Hand-maintained counts and file lists have drifted (`serializers.test.ts` vs the real `serializer.test.ts`; stale per-directory counts). | Promoted to step 6 | Synthesis deferred item (WP-002/WP-008). This plan edits these files anyway to register new tests. |
| `ai-persona-builder/docs/api.md` | No engine function is documented, although all are root exports. | Promoted to step 6 | Synthesis deferred item (WP-004). This plan changes one engine function and adds another. |
| `ai-persona-builder/docs/agents/project-manifest/tech-stack.md` Key Patterns | The two design templates from the synthesis are recorded nowhere durable. | Promoted to step 7 | Synthesis strategic recommendations. A manifest is where agents look for patterns. |
| `ai-insights/scripts/build-personas.js` — five scattered `process.exit` points | The first failure hides every later post-build step and check. | Promoted to step 9 | Synthesis deferred debt (WP-014, medium). The wrapper is this plan's verification tool. |
| `ai-insights/scripts/build-personas.js` L371–L458 — inline `{{agent_slug_*}}` check scanning raw content | The only check not in `scripts/lib/`. It has its own list parser, is untestable in isolation, and would report slug references inside comments. | Promoted to step 9 | Needed to register it as a runner descriptor. It gains unit tests and comment awareness. |
| `ai-insights/scripts/lib/philosophy-tone.js` — also scans raw content | It would read comment text inside Operating Philosophy sections. | Rejected | A warn-only heuristic, and comments inside philosophy prose are not an expected authoring pattern. Revisit if a false warning appears. |
| `ai-insights/scripts/build-personas.js` L88–L369 — inline name-mapping generation | A large inline block. | Rejected | Independent of the failure-propagation problem, and already covered by `scripts/tests/build-personas-model-resolution.test.js`. Extracting it would widen the diff with no behavioural gain in this plan. |
| `ai-insights/scripts/tests/backfill-duration.test.js`, `store-commands.test.js` — default 5 s timeout | Subprocess-spawning tests time out under parallel load. | Promoted to step 10 | Synthesis deferred item (WP-001). Flaky suites undermine this plan's green-suite criteria. |
| `ai-insights/personas/ledger/src/meta/1-planner.yaml` — dispatch grant without `subagents` | The deliberate exception is visible only in a changelog line. | Promoted to step 11 | Synthesis deferred item (WP-015 security audit). |
| `ai-insights/personas/standalone/src/content/developer.md` L177, `web-gui-specialist.md` L270 — `{{!-- … --}}` pseudo-comments | They rely on comment syntax the engine does not have. | Promoted to steps 2–3 (the engine gains the syntax); the source lines stay unchanged | These lines become the first valid comment usages and are covered by an exact test vector. No content edit is needed. |

## Detailed Steps

1. **Verify the dev link and capture the baseline** (`ai-insights`, `ai-persona-builder`).
   - Confirm `ai-insights/personas/node_modules/@mistralys/persona-builder` is a symlink to `../../../../ai-persona-builder`. If it is missing, re-create it with the link command in `ai-persona-builder/docs/agents/plans/2026-09-30-persona-targets-and-tool-validation/dev-linking.md`.
   - In `ai-persona-builder/`, run `npm install` (if `node_modules/` is absent) and `npm run build`.
   - In `ai-insights/`, run `node scripts/build-personas.js`.
   - Copy the nine rendered output directories to a new directory outside both repositories, created with `mktemp -d`. The directories are `personas/{ledger,standalone,ledger-support}/{vs-code,claude-code,deep-agents}`, per `personas/persona-build.config.js` L105–L130.
   - Record the baseline path and both test-suite pass counts (`npm test` in each repository) in the pipeline notes.

2. **Rewrite the block-tag tokenizer and conditional resolver** in `ai-persona-builder/src/engine/conditionals.ts`, following Approach §1:
   - tokenizer with conditional and comment tokens and standalone detection, including multi-line comments;
   - stack-built block tree with native `{{else if}}`;
   - branch selection;
   - the shared whitespace rules and blank-run merge;
   - literal pass-through for malformed and unterminated tags;
   - `resolveConditionals` dropping any comment tokens it meets.

   Remove `resolveElseIf`, `ELSE_IF_PATTERN` and `NO_NESTED_IF`. Keep `resolveConditionals`' exported signature and zero imports. Rewrite the module and function JSDoc to state the new whitespace contract, replacing the "single `\n` delimiters" text at L87–L99.

3. **Add template comments.**
   - In `ai-persona-builder/src/engine/conditionals.ts`, export the new `stripComments(text: string): string` (Approach §1 item 6). Widen the module JSDoc to "block-level tags: conditionals and comments".
   - Re-export `stripComments` from `ai-persona-builder/src/engine/index.ts`. It reaches the package root through the existing `export *` in `src/index.ts`.
   - Wire it into the builder (Approach §2):
     - `ai-persona-builder/src/builders/persona-builder.ts`: strip the loaded body template at L468. After `runPersonaPartials` (L446–L456), build a stripped copy of the per-persona partials map and use it for rendering and for `isToolRequirementTriggered()`.
     - `ai-persona-builder/src/builders/frontmatter.ts` `renderFrontmatter()`: strip before `resolveConditionals`, and update its JSDoc pipeline list (L10–L18, L88–L92).

4. **Test the engine and builder changes.**
   - Extend and adjust `ai-persona-builder/tests/engine/conditionals.test.ts` with the obligations in the Test Plan, including a new `describe('stripComments()')`. Keep every existing test; update only assertions that encoded the old `\n` padding, if any fail.
   - Add the new builder-level test file `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts`, which uses `createMinimalSuite()`.

5. **Document the fix and the comment syntax in the library.**
   - `ai-persona-builder/src/engine/postProcessor.ts`: update the JSDoc of `ensureBlankLineBeforeHeadings()` (L25–L28) so partial `trimEnd()` is the remaining reason it exists.
   - `ai-persona-builder/docs/template-syntax.md`:
     - add a new "Comments" section (both forms, multi-line use, inertness of tags inside comments, stripped before everything else, no escape form);
     - add a new "Whitespace and line handling" subsection covering conditionals and comments (standalone vs inline tags, blank-run merge, examples);
     - replace the pre-processor sentence (L86–L87) and the multi-pass paragraph (L107–L108).
   - `ai-persona-builder/docs/agents/project-manifest/api-surface.md`: rewrite the `resolveConditionals` entry (L274–L287) and add a `stripComments` entry.
   - `ai-persona-builder/docs/agents/project-manifest/constraints.md`:
     - Template Syntax table (L90–L103): drop "via pre-processor" from the else-if row; add rows for `{{!-- … --}}` and `{{! … }}` (processor `stripComments()`, run first); add a note on standalone and inline tag whitespace and on literal pass-through of unmatched or unterminated tags; change the processing-order line to stripComments → partials → conditionals → variables.
     - New Known Limitation: there is no escape form for emitting a literal `{{!` sequence.
   - `ai-persona-builder/docs/agents/project-manifest/data-flows.md`: add the strip step to the render tree (L61–L70, frontmatter step 6 and body step 8, plus the partials map after step 4) and to the numbered render list (L182).
   - `ai-persona-builder/AGENTS.md`: change the Failure Protocol row "Verify processing order: partials → conditionals → variables" to include the leading comment strip.
   - `ai-persona-builder/README.md` L15: mention `{{!-- comments --}}` in the templating feature bullet. At L77, add "comments" to the Template Syntax doc description.
   - `ai-persona-builder/CHANGELOG.md`, `v3.0.0 (proposed)` entry, add two bullets:
     - "Engine: Conditional blocks keep the blank lines around them; inline conditionals no longer insert line breaks" (noting that rendered output gains the author's blank lines next to conditional tags);
     - "Engine: Added template comments (`{{!-- … --}}`, `{{! … }}`) via `stripComments()`, applied before partials, frontmatter and tool-requirement scans".

6. **Sweep the library documentation debt.**
   - `ai-persona-builder/docs/api.md`: add a new "Template engine" section documenting every engine function exported from the root, with signature, purpose and a one-line example each. The functions are `stripComments`, `resolvePartials`, `collectPartialReferences`, `resolveConditionals`, `resolveVariables`, `collapseBlankLines`, `ensureBlankLineBeforeHeadings`, `normalizeNewlines`, `serializeTools`, `serializeToolsList` and `serializeToolsBlock`. Link the syntax and whitespace rules to `template-syntax.md`.
   - Bring `ai-persona-builder/tests/README.md` (file list; fix `serializers.test.ts` → `serializer.test.ts`; add every missing test file, including the new one) and `ai-persona-builder/docs/agents/project-manifest/file-tree.md` (per-directory test counts, missing test-file entries, header file counts) in line with the actual tree and the `npm test` output.
   - Update the test totals in `ai-persona-builder/AGENTS.md` (Project Stats and Test Command).

7. **Codify the design templates** in `ai-persona-builder/docs/agents/project-manifest/tech-stack.md` → Key Patterns. Add two entries:
   - **Pure validator / impure orchestrator**: `validateToolParity()` takes plain data, while `build()` owns the grouping and filtering. Use it as the template for future cross-entity post-passes.
   - **Single capability-map vocabulary**: `TargetDefinition.toolCapabilities` is shared by `buildContext()`, `validateToolRequirements()` and `validateToolParity()`. Use it as the template for any target-specific behaviour.

8. **Verify the engine changes against the consumer.**
   - Run `npm run build` in `ai-persona-builder/`, then `node scripts/build-personas.js` in `ai-insights/`.
   - Diff the nine output directories against the step-1 baseline:
     - `diff -rB <baseline> <current>` must produce no output;
     - every changed line in `diff -r <baseline> <current>` must be an added empty line (no line starting with `<`, and no line starting with `>` that has content).
   - Confirm the three joins named in the bug report are now separated by a blank line in every rendered persona that includes `personas/shared/partials/documentation-ownership.md`:
     - "…every other row is a handoff target." / "**Acting on a finding.**";
     - "Dispatch works like this:" / "Use the `Task` tool…";
     - "Use the `Task` tool…" / "Read what the agent returns…".
   - Confirm the frontmatter blocks show no differences, and that no rendered file contains `{{!`.
   - Record the diff statistics (files changed, blank lines added) in the pipeline notes.

9. **Reshape the build wrapper** (`ai-insights`).
   - Add the new `ai-insights/scripts/lib/build-checks.js`, exporting:
     - `runBuildChecks(checks, { log, warn, error })`, which runs every descriptor in order (awaiting async ones), prints non-empty results under the descriptor's label and severity prefix (`[ERROR]` / `[WARN]`, preserving today's messages), and returns `{ errorCount, warningCount }`;
     - `resolveExitCode(libraryStatus, { errorCount })`, which returns `libraryStatus` when it is non-zero, otherwise `1` when `errorCount > 0`, otherwise `0`.
   - Add the new `ai-insights/scripts/lib/agent-slug-validation.js`, exporting `validateAgentSlugReferences(metaDir, contentDir, { stripComments = (t) => t } = {})`. It returns the same error strings as the inline block at `build-personas.js` L371–L458, applies `stripComments` to each content file before scanning, and moves `extractSubagentsList` with it.
   - In `ai-insights/scripts/build-personas.js`:
     - capture the CLI status (`err.status ?? 1`) and print `[ERROR] persona-builder CLI exited with status N` instead of exiting;
     - leave the two real-build post-build steps unconditional on the CLI status (they still skip in `--check`);
     - replace the five inline check blocks with one descriptor list passed to `runBuildChecks`, passing the library's `stripComments` (from the already-loaded `dist/index.cjs`) to the agent-slug check;
     - end with a single `process.exit(resolveExitCode(...))`;
     - update the header comment and the stale comment at L490–L492 ("The build's own `success` is ignored here — the CLI run above has already failed…").

10. **Stabilise the subprocess suites** (`ai-insights`).
    - Add the new `ai-insights/scripts/tests/helpers/timeouts.js`, exporting `SUBPROCESS_TEST_TIMEOUT_MS = 30_000` with a comment on why.
    - Apply it as the suite-level `timeout` option on the `describe` blocks of `scripts/tests/backfill-duration.test.js` and `scripts/tests/store-commands.test.js`. Apply it also to any other `scripts/tests/*.test.js` suite whose tests spawn child processes (`spawnSync` / `execFileSync` / `spawn` / `exec` in the test or its module under test).
    - Leave `vitest.config.ts` unchanged. The `helpers/` file is not matched by the `*.test.*` include.

11. **Document the planner grant and the persona conventions** (`ai-insights`).
    - In `ai-insights/personas/ledger/src/meta/1-planner.yaml`, add inline YAML comments at the `agent` entry in `tools:` and the `Task` entry in `cc_tools:`. They should say the dispatch grant is deliberate: the planner dispatches ad-hoc sub-agents, such as the Researcher, that it does not name. So there is no `subagents` list, and the grant is kept on both targets per the user's decision. This is a comment-only change: rendered output is unchanged, and neither a persona version bump nor a changelog entry is required.
    - In `ai-insights/personas/docs/agents/project-manifest/constraints.md`, after the dispatch-grant bullet at L204, add a sentence naming `1-planner` as the documented exception, pointing at the YAML comment. After the parity bullet at L206, add two conventions:
      - every capability-affecting persona edit records, in that persona's integrated changelog, which grant changed and why;
      - every `tool_parity_exceptions` entry carries an inline YAML comment with its rationale, as `web-gui-specialist.yaml` does.
    - In `ai-insights/personas/docs/agents/project-manifest/api-surface.md`, in the template syntax section (Personas Maintenance Rules: "Change template syntax"), add the `{{!-- … --}}` / `{{! … }}` comment forms and link the library's `docs/template-syntax.md`.

12. **Update the AI Insights documentation.**
    - `ai-insights/personas/docs/agents/project-manifest/api-surface.md` §`scripts/build-personas.js` — CLI Interface (L14ff): all checks run on every build, post-build steps run despite a failing library CLI, there is one exit code, the new `scripts/lib/build-checks.js` and `scripts/lib/agent-slug-validation.js` exist, and slug references inside comments are ignored.
    - `ai-insights/scripts/tests/README.md`: the subprocess timeout helper.
    - `ai-insights/personas/changelog.md`: in the `v3.39.0 - **WIP, UNRELEASED**` entry, add summary bullets following the summary-only rule 8:
      - "Build: The persona build reports every failing check in one run";
      - "Build: Persona sources can use `{{!-- … --}}` comments".
    - Regenerate `ai-insights/.context/` with `node scripts/cli.js ctx-generate` and confirm the regenerated scope covers the edited docs.

13. **Run the final verification.**
    - In `ai-persona-builder/`: `npm run typecheck`, `npm test`, `npm run build`.
    - In `ai-insights/`: `npm test`, three consecutive times, all green; `node scripts/build-personas.js --check`, which must report 0 errors and 0 warnings from the library and exit 0; a real `node scripts/build-personas.js`, which must exit 0.
    - Re-run the step-8 diff against the baseline to confirm steps 9–12 did not alter rendered output.
    - Leave the baseline directory in place and report its path; the user may delete it.

## Dependencies

- Step 1 must complete before step 2, because the baseline has to be rendered by the unmodified engine.
- Step 3 depends on step 2 (shared tokenizer).
- Step 4 depends on steps 2–3.
- Step 8 depends on steps 2–4.
- Step 5 depends on steps 2–3, since it documents the implemented contract.
- Step 6 depends on step 4 (final test counts).
- Step 7 has no code dependency.
- Step 9 depends on step 3 for the `stripComments` export. Its runner and extraction work can start earlier; the comment wiring lands after step 3.
- Steps 10 and 11 do not depend on the library steps.
- Step 12 depends on steps 9–11.
- Step 13 depends on all previous steps.
- External: `ctx` CLI on `PATH` for step 12. It was used successfully by the prior plan's WP-017.

## Required Components

- `ai-persona-builder/src/engine/conditionals.ts` (rewrite; new `stripComments` export)
- `ai-persona-builder/src/engine/index.ts` (re-export)
- `ai-persona-builder/src/builders/persona-builder.ts` (strip body template and per-persona partials map)
- `ai-persona-builder/src/builders/frontmatter.ts` (strip in `renderFrontmatter()`)
- `ai-persona-builder/src/engine/postProcessor.ts` (JSDoc only)
- `ai-persona-builder/tests/engine/conditionals.test.ts` (extend)
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` (**new**)
- `ai-persona-builder/docs/template-syntax.md`, `ai-persona-builder/docs/api.md`, `ai-persona-builder/CHANGELOG.md`, `ai-persona-builder/AGENTS.md`, `ai-persona-builder/README.md`, `ai-persona-builder/tests/README.md`
- `ai-persona-builder/docs/agents/project-manifest/{api-surface,constraints,data-flows,file-tree,tech-stack}.md`
- `ai-insights/scripts/build-personas.js` (reshape)
- `ai-insights/scripts/lib/build-checks.js` (**new**)
- `ai-insights/scripts/lib/agent-slug-validation.js` (**new**)
- `ai-insights/scripts/tests/helpers/timeouts.js` (**new**)
- `ai-insights/scripts/tests/build-checks.test.js` (**new**)
- `ai-insights/scripts/tests/agent-slug-validation.test.js` (**new**)
- `ai-insights/scripts/tests/backfill-duration.test.js`, `ai-insights/scripts/tests/store-commands.test.js` (timeout option), plus any other subprocess suite found in step 10
- `ai-insights/personas/ledger/src/meta/1-planner.yaml` (comments only)
- `ai-insights/personas/docs/agents/project-manifest/{constraints,api-surface}.md`, `ai-insights/personas/changelog.md`, `ai-insights/scripts/tests/README.md`, `ai-insights/.context/` (regenerated)
- External tool: `ctx` CLI (step 12)

## Assumptions

- The dev symlink `ai-insights/personas/node_modules/@mistralys/persona-builder → ../../../../ai-persona-builder` is in place. It was verified on 2026-09-30 during research; step 1 re-checks it and re-creates it if absent.
- `ai-insights`' current full build is clean: 0 errors and 0 warnings, per the synthesis after WP-015. So the step-1 baseline is a valid reference.
- Both repositories sit side by side in the same workspace, and both are present: `DEV/ai-persona-builder`, `DEV/ai-insights`.
- No persona source or partial contains a literal `{{!` intended for output. Verified: only the two `{{!-- … --}}` lines exist.
- The development workstation is macOS/Linux, so `diff -r` and `mktemp -d` are available for verification. They are verification commands, not shipped code.
- The engine changes ship in the same, still unpublished, proposed major release as the prior plan's changes.

## Constraints

- `src/engine/conditionals.ts` keeps zero imports. `resolveConditionals` keeps its exported signature.
- The processing order becomes stripComments → partials → conditionals → variables. The relative order of the last three is unchanged.
- Rendered `ai-insights` output may differ from the baseline only by added blank lines.
- No step publishes, tags, bumps `package.json` versions, bumps `ai-insights/personas/package.json`'s dependency range, or reverts the dev symlink.
- `ai-insights` code is Node-only, per its Cross-Platform Policy. No shell utilities in shipped scripts.
- `personas/changelog.md` entries stay summary-only (Changelog Convention rule 8).

## Out of Scope

- Publishing `@mistralys/persona-builder`, reconciling the orphaned `v2.6.0` tag, bumping `ai-insights`' dependency range, and reverting the dev link. These are Human Actions.
- An escape form for emitting a literal `{{!`. It is recorded as a Known Limitation; no consumer needs it.
- Comment awareness in `ai-insights/scripts/lib/philosophy-tone.js` (see Structural Improvements).
- Extracting the name-mapping block from `build-personas.js` (see Structural Improvements).
- Changing `collapseBlankLines()` or `ensureBlankLineBeforeHeadings()` behaviour.
- Editing `ai-insights` persona content to add or remove blank lines or comments. The fix makes the existing authored spacing and comments render as intended.
- Behaviour notes from the synthesis that need no action: the WP-007 skip-on-empty `agentMap` change (reviewed, intended) and the WP-016 negative-check nuance (test-authoring observation).

## Human Actions

| # | Action | When | Why an agent cannot do it |
|---|--------|------|---------------------------|
| 1 | Bring the `v2.6.0` release commit (`52f1e63`, tag not on any branch) onto `main`, settle the final version number and `package.json` bump for the proposed v3.0.0 (which now also carries the whitespace fix and comment syntax), tag, and `npm publish` `@mistralys/persona-builder` | After the run | Needs git history decisions, npm credentials, and the release decision, all reserved for the user |
| 2 | In `ai-insights`, bump `personas/package.json` to the released range. Then remove the dev symlink and reinstall (the `dev-linking.md` revert command), and rebuild personas | After the run | Depends on action 1; the user reserved the dependency update and the symlink revert |

## Acceptance Criteria

- AC-01: `resolveConditionals()` returns exactly the outputs in the Approach §1 worked-examples table (conditional rows), including the three bug-report reproductions and the nested case.
- AC-02: A block removed between two paragraphs leaves exactly one paragraph break (`\n\n`). Source without blank lines around standalone tags renders without blank lines. Nested-`{{else}}` output equals flat-`{{else}}` output (the existing symmetry test passes).
- AC-03: Inline conditional tags are removed without inserting or removing any line break (`Use the {{#if a}}Task{{else}}task{{/if}} tool.` → `Use the Task tool.`).
- AC-04: Unmatched or stray tags (`{{/if}}` with no opener, an unclosed `{{#if}}`, `{{else}}` outside a block, a second `{{else}}` in one block) pass through literally, as before. Flags that do not match `\w+` stay literal. Unterminated `{{!--` / `{{!` pass through literally.
- AC-05: `src/engine/conditionals.ts` has zero `import` statements. `resolveElseIf`, `ELSE_IF_PATTERN` and `NO_NESTED_IF` are gone. `resolveConditionals`' exported signature is unchanged.
- AC-06: For the full `ai-insights` build against the rebuilt library, `diff -rB` against the step-1 baseline is empty. Every `diff -r` change is an added empty line. Frontmatter blocks are unchanged. No rendered file contains `{{!`. The three `documentation-ownership.md` joins are separated by a blank line.
- AC-07: In `ai-persona-builder`, `npm run typecheck`, `npm test` and `npm run build` pass.
- AC-08: `docs/template-syntax.md` documents the whitespace rules with examples. The `api-surface.md` `resolveConditionals` entry and the `constraints.md` Template Syntax table describe the tokenizer contract, with no remaining mention of a pre-processor. The `ensureBlankLineBeforeHeadings()` JSDoc no longer cites conditional delimiters. `CHANGELOG.md` `v3.0.0 (proposed)` lists the fix.
- AC-09: `docs/api.md` documents every engine function exported from the package root, including `stripComments`.
- AC-10: The test file lists and counts in `tests/README.md`, `file-tree.md` and `AGENTS.md` match the actual `tests/` tree and the `npm test` totals.
- AC-11: `tech-stack.md` Key Patterns contains the "Pure validator / impure orchestrator" and "Single capability-map vocabulary" entries.
- AC-12: `scripts/build-personas.js` has exactly one `process.exit` call. A failing library CLI no longer skips the post-build steps or the checks. Every check runs on every invocation. The exit code is non-zero when the CLI failed or any error-severity check reported.
- AC-13: The `{{agent_slug_*}}` check lives in `scripts/lib/agent-slug-validation.js`, produces the same messages as before, ignores references inside comments when given `stripComments`, and has unit tests including a synthetic failing fixture.
- AC-14: Every `ai-insights` test suite that spawns child processes uses `SUBPROCESS_TEST_TIMEOUT_MS`. `npm test` in `ai-insights` passes three consecutive runs.
- AC-15: `1-planner.yaml` carries inline rationale comments at its dispatch grants. The persona `constraints.md` names it as the documented exception.
- AC-16: The persona `constraints.md` states the changelog-as-audit-trail and parity-exception rationale-comment conventions.
- AC-17: The persona `api-surface.md` wrapper and template-syntax sections, `scripts/tests/README.md` and the WIP `personas/changelog.md` entry are updated. `.context/` is regenerated. `node scripts/build-personas.js --check` exits 0 with 0 library errors and 0 warnings.
- AC-18: `stripComments()` is exported from the package root and returns exactly the outputs in the Approach §1 comment rows:
  - both forms are removed, including multi-line and `}}`-containing long comments;
  - standalone comment lines are removed whole, and inline comments leave their line intact;
  - blank runs around a removed comment merge;
  - `resolveConditionals()` also drops comments.
- AC-19: Comments are inert throughout the build:
  - a commented-out `{{> partial}}` in a body template or a partial neither expands, nor warns, nor triggers a `ToolRequirement` `partial` trigger;
  - a commented-out `{{variable}}` produces no unresolved-variable warning;
  - comments in frontmatter templates and in plugin- or config-injected partials are removed;
  - `{{else}}{{!-- … --}}` resolves as a standalone `{{else}}`.
- AC-20: The comment syntax is documented: the `template-syntax.md` Comments section; `constraints.md` Template Syntax rows, processing order and the Known Limitation; the `data-flows.md` pipeline; the `api-surface.md` `stripComments` entry; the `AGENTS.md` processing-order row; the `README.md` feature bullet; and a `CHANGELOG.md` bullet.

## Testing Strategy

- **Engine unit tests.** They pin the whitespace and comment contracts with exact-string assertions, which the old suite lacked. That gap is why the defect survived.
- **Builder-level tests.** They prove the contracts survive the whole pipeline: comment stripping before partials, frontmatter rendering and tool-requirement scans, then post-processing.
- **The consumer diff.** It is the end-to-end oracle. `diff -rB` proves nothing other than blank lines changed, and the added-blank-line check proves the direction of the change.
- **Wrapper runner tests.** They use synthetic check descriptors, so failure paths are exercised without real persona breakage (insight `48607cdb`).
- **Flakiness evidence.** Repeated full-suite runs provide it.

## Test Plan

- `ai-persona-builder/tests/engine/conditionals.test.ts` — "keeps blank lines around a truthy block" (`Para one.\n\n{{#if a}}\nInside.\n{{/if}}\n\nPara two.` → exact) — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "keeps blank lines around a chosen else branch" (bug-report case 2 → exact) — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "keeps blank lines around a chosen else-if branch" (bug-report case 3 → exact) — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "keeps blank lines inside an outer branch around a nested block" (nested case → `Intro:\n\nT\n\nAfter.\n`) — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "removed block between paragraphs leaves one paragraph break", for both no-else-falsy and all-else-if-falsy — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "tight source stays tight" (truthy and falsy exact outputs), including a Markdown table row and a list inside the block — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — existing "preserves whitespace symmetry: nested else output equals flat else output", kept unchanged and passing — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "blank lines inside a kept branch next to the tag merge with blank lines outside it" (`A\n\n{{#if a}}\n\nX\n\n{{/if}}\n\nB` → `A\n\nX\n\nB`) — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "inline conditional stays on its line" (bug-report inline case → `Use the Task tool.`; falsy → `Use the task tool.`) — AC-03
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "mixed inline/multi-line frontmatter shape renders tight" (Approach §1 frontmatter row, truthy and falsy) — AC-01, AC-03
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "standalone tag with surrounding spaces or tabs is removed with its line" — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "tag on the last line without a trailing newline" (the preceding newline is kept) — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "malformed tags pass through literally": stray `{{/if}}`, unclosed `{{#if a}}` with a balanced inner block that still resolves, `{{else}}` outside a block, a second `{{else}}` kept as literal text in the final branch, and `{{#if a-b}}` left as is — AC-04
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "module has no imports" (reads the source file and asserts no `import` statement), or the same assertion placed in an existing engine-invariant test if one exists — AC-05
- `ai-persona-builder/tests/engine/conditionals.test.ts` — existing suites (basic, unknown flags, multiline, multiple blocks, nested, else-if chains, edge cases) still pass — AC-01, AC-07
- `ai-persona-builder/tests/engine/conditionals.test.ts` → `describe('stripComments()')`:
  - "removes a standalone long comment spanning lines and containing `}}`, merging the surrounding blank runs" (`A\n\n{{!-- note\nspanning }} lines --}}\n\nB` → `A\n\nB`);
  - "removes an inline short comment without touching the line" (`Use {{! short }}this.` → `Use this.`);
  - "standalone comment between tight lines leaves them tight";
  - "tags inside a comment are inert" (`{{!-- {{> p}} {{#if a}} {{v}} --}}` → empty);
  - "leaves conditional tags untouched";
  - "`{{else}}{{!-- fallback --}}` becomes a standalone `{{else}}` line", combined with `resolveConditionals` for all branches;
  - "unterminated `{{!--` and `{{!` pass through literally";
  - "text without comments is returned unchanged"
  — AC-18, AC-04
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "resolveConditionals drops comment tokens it meets" — AC-18
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — "stripComments is exported from the package root" (imports it from `src/index.ts` and asserts it is a function) — AC-18
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` (**new**) — `buildPersona()` / `buildSuite()` on a `createMinimalSuite()` persona:
  - content with blank lines around standalone blocks renders paragraph breaks after `collapseBlankLines`/`ensureBlankLineBeforeHeadings`/`trimEnd`;
  - a frontmatter template with standalone and mixed conditionals, plus a comment, renders with no blank lines and no comment inside the frontmatter
  — AC-02, AC-06, AC-19
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — "commented-out partial reference neither expands nor warns" (spy on `console.warn`; the referenced partial is missing from the map) — AC-19
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — "commented-out partial does not trigger a `ToolRequirement` `partial` trigger". Synthetic failing fixture: the same partial uncommented does trigger the requirement — AC-19
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — "comments inside a shared-directory partial and a `BuildConfig.partials` / plugin-injected partial are removed" — AC-19
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — "commented-out `{{unknown_var}}` emits no unresolved-variable warning" — AC-19
- `ai-persona-builder` full `npm test`, `npm run typecheck`, `npm run build` (step 13) — AC-07
- Consumer diff (steps 8 and 13): `diff -rB` empty; `diff -r` only added empty lines; frontmatter unchanged; no `{{!` in output; three named joins separated — AC-06
- Documentation review (step 5–7 deliverables checked against AC text by the Documentation stage) — AC-08, AC-09, AC-10, AC-11, AC-20
- `ai-insights/scripts/tests/build-checks.test.js` (**new**):
  - all descriptors run even when an earlier error check reports;
  - an async `run` is awaited;
  - warnings alone yield `errorCount === 0`;
  - the counts are correct;
  - `resolveExitCode` returns the library status when non-zero, `1` for check errors only, `0` when clean;
  - output uses the `[ERROR]`/`[WARN]` prefixes
  — AC-12
- `ai-insights/scripts/tests/agent-slug-validation.test.js` (**new**), using a temp-dir fixture:
  - a declared slug passes;
  - an undeclared `{{agent_slug_x_y}}` fails with the exact legacy message;
  - quoted list items and trailing `#` comments are parsed;
  - a content file without a YAML counterpart is skipped;
  - an undeclared slug inside `{{!-- … --}}` is ignored when a `stripComments` implementation is injected, and reported with the identity default
  — AC-13
- `ai-insights/scripts/tests/build-personas-model-resolution.test.js` — existing, still passes (post-build name-mapping untouched) — AC-12
- Source assertion, in `build-checks.test.js` or a new case there: `scripts/build-personas.js` contains exactly one `process.exit(` — AC-12
- `ai-insights` `npm test`, three consecutive runs (step 13) — AC-14
- `ai-insights` `node scripts/build-personas.js --check` and a real build (step 13) — AC-17, AC-12
- Review of `1-planner.yaml` comments, the persona `constraints.md` and `api-surface.md`, `scripts/tests/README.md`, `personas/changelog.md` and the `.context/` regeneration (Documentation stage) — AC-15, AC-16, AC-17

## Documentation Updates

- `ai-persona-builder/docs/template-syntax.md` — new "Comments" section and "Whitespace and line handling" subsection; else-if and nesting paragraphs rewritten (no pre-processor, no multi-pass).
- `ai-persona-builder/docs/agents/project-manifest/api-surface.md` — `resolveConditionals` entry rewritten; new `stripComments` entry (Manifest Maintenance Rules: engine function added/modified).
- `ai-persona-builder/docs/agents/project-manifest/constraints.md` — Template Syntax table rows, note and processing order; new Known Limitation (no literal `{{!` escape); zero-dependency invariant re-verified for `conditionals.ts` (Maintenance Rules: engine function modified, new limitation).
- `ai-persona-builder/docs/agents/project-manifest/data-flows.md` — comment-strip step in the render pipeline (Maintenance Rules: build pipeline flow changed).
- `ai-persona-builder/docs/agents/project-manifest/file-tree.md` — new test file and corrected test counts (Maintenance Rules: new file).
- `ai-persona-builder/docs/agents/project-manifest/tech-stack.md` — two Key Patterns entries.
- `ai-persona-builder/docs/api.md` — new "Template engine" section.
- `ai-persona-builder/README.md` — templating feature bullet and Template Syntax doc description mention comments.
- `ai-persona-builder/tests/README.md` — corrected file inventory.
- `ai-persona-builder/AGENTS.md` — test totals in Project Stats and Test Command; processing-order row in the Failure Protocol.
- `ai-persona-builder/CHANGELOG.md` — two bullets in `v3.0.0 (proposed)`.
- `ai-persona-builder/src/engine/postProcessor.ts` — `ensureBlankLineBeforeHeadings()` JSDoc.
- `ai-persona-builder/src/builders/frontmatter.ts` — `renderFrontmatter()` JSDoc pipeline list.
- `ai-insights/personas/docs/agents/project-manifest/api-surface.md` — wrapper CLI Interface section (Personas Maintenance Rules: build script function changed); template syntax section gains comments (Maintenance Rules: change template syntax).
- `ai-insights/personas/docs/agents/project-manifest/constraints.md` — planner exception cross-reference; changelog-as-audit-trail and parity-exception-comment conventions.
- `ai-insights/scripts/tests/README.md` — subprocess timeout helper.
- `ai-insights/personas/changelog.md` — two summary bullets in `v3.39.0 - WIP, UNRELEASED`.
- `ai-insights/.context/` — regenerated via `node scripts/cli.js ctx-generate`. This follows the synthesis' WP-013 recommendation for this plan's own documentation pass.

## Deferred Items

| # | Deferred Item | Origin | Reason Deferred | Notes |
|---|---------------|--------|-----------------|-------|
| 1 | Formalise a periodic CTX regeneration step in the standard Documentation pipeline stage | Synthesis → Deferred & Follow-Up Items (WP-013 Documentation) and Next Steps #4 | Formalising it means changing the Documentation persona's workflow in `ai-insights/personas`, which lies outside this plan's blast radius. This plan applies the regeneration to its own documentation pass (step 12). | Reconsider in the next plan that edits the Documentation persona or the shared documentation-stage partials. |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **The rewrite changes output in ways beyond blank lines, for example in frontmatter or an inline case the scan missed** | Step 8's `diff -rB` must be empty, and every `diff -r` change must be an added empty line. Frontmatter is checked explicitly, and the mixed-shape template has a dedicated unit test. |
| **Comment syntax swallows text a consumer meant literally** | Research found no literal `{{!` in any `ai-insights` source. The consumer diff and the "no `{{!` in output" check confirm it. The missing escape form is documented as a Known Limitation. |
| **A comment slips past the strip because it arrives through a path not covered** (plugin partial, config partial, frontmatter) | Stripping sits at the three points every template passes through: the final per-persona partials map after both plugin hooks, the loaded body, and `renderFrontmatter()`. `resolveConditionals` also drops comments as a backstop. Builder tests cover each partial source. |
| **Stripping partials per persona × target costs build time** | `stripComments` is a single linear pass. The map holds dozens of small files, which is negligible next to file I/O. Caching is not worth the complexity at this scale. |
| **Third-party consumers relied on the old padding** | The change ships inside the already-proposed major version and is called out in `CHANGELOG.md`. The old padding contradicted the source the author wrote, so the new behaviour is the documented contract. |
| **Malformed-input behaviour drifts from the regex version** | AC-04 tests enumerate every malformed shape, with literal expected outputs. |
| **Blank-run merge rule misapplied at nested boundaries** | The nested bug-report case and the inside/outside merge case are exact-string tests. The consumer diff covers the 94 real standalone-next-to-blank sites. |
| **The wrapper reshape changes check messages or ordering that users grep for** | The runner preserves each check's existing messages and `[ERROR]`/`[WARN]` prefixes. The order is unchanged. The agent-slug test asserts the exact legacy message. |
| **Running post-build steps after a failed library build writes `name-mapping.json` for a broken build** | Both steps derive from source YAML and the changelog, not from rendered output, so their result is correct regardless of the render outcome. The final exit code still reports the failure. |
| **A 30 s subprocess timeout masks a real hang in those suites** | The constant applies only to subprocess suites. A hang still fails, just later. Pure unit suites keep the 5 s default. |
| **A stale `dist/` makes the consumer diff test old code** | Steps 8 and 13 rebuild the library first, per the `dev-linking.md` Rebuild rule. |
| **`ctx` CLI missing on the workstation** | Step 12 reports it as a blocker note in the pipeline rather than skipping silently. The source docs are still updated. |

## Recommended Workflow
- **Workflow:** ledger
- **Rationale:** The plan spans two repositories, reshapes a core engine module with a breaking output change and a new syntax feature, restructures the consumer's build wrapper, and includes 13 steps across distinct concerns, so it benefits from formal QA, review and documentation stages.
