# Research Brief

Rework of `docs/agents/plans/2026-09-30-persona-targets-and-tool-validation/synthesis.md`, extended with the
bug report `docs/agents/bug-reports/command-whitespace-handling.md` (both in `ai-persona-builder/`).

## Scope Sketch

- Conditional engine — `ai-persona-builder/src/engine/conditionals.ts` — modification (bug report: blank lines swallowed, inline conditionals break the line)
- Template comment syntax — `ai-persona-builder/src/engine/conditionals.ts`, `ai-persona-builder/src/builders/persona-builder.ts`, `ai-persona-builder/src/builders/frontmatter.ts` — new code + modification (added to scope by the user)
- Engine tests and builder-level render tests — `ai-persona-builder/tests/engine/`, `ai-persona-builder/tests/builders/` — modification + new code
- Library documentation and manifest — `ai-persona-builder/docs/`, `ai-persona-builder/docs/agents/project-manifest/`, `ai-persona-builder/tests/README.md`, `ai-persona-builder/AGENTS.md`, `ai-persona-builder/CHANGELOG.md` — modification (bug fix docs + deferred doc-debt sweep + strategic recommendations)
- AI Insights build wrapper — `ai-insights/scripts/build-personas.js`, `ai-insights/scripts/lib/` — modification (deferred WP-014 debt: fail-fast exit skips post-build steps)
- AI Insights script test suite — `ai-insights/scripts/tests/` — modification (deferred WP-001 flaky timeouts) + new tests
- AI Insights persona sources and persona docs — `ai-insights/personas/ledger/src/meta/1-planner.yaml`, `ai-insights/personas/docs/agents/project-manifest/` — modification (deferred WP-015 security observation + convention docs)
- Cross-repo verification — `ai-insights/personas/node_modules/@mistralys/persona-builder` symlink, rendered persona output directories — integration

## Area: Conditional Engine

### Verified References
- `ai-persona-builder/src/engine/conditionals.ts` (L1–L155): zero-import module. `NO_NESTED_IF` (L17) negative-lookahead fragment; `ELSE_IF_PATTERN` (L27–L30) module-level `g` regex; internal `resolveElseIf()` (L53–L70) rewrites `{{else if b}}…{{/if}}` into `{{else}}{{#if b}}…{{/if}}{{/if}}` iteratively; exported `resolveConditionals(text: string, context: Record<string, unknown>): string` (L111–L155) builds pattern `\n*\{\{#if (\w+)\}\}(NO_NESTED_IF)(?:\{\{else\}\}(NO_NESTED_IF))?\{\{\/if\}\}\n*` and loops innermost-first until stable. Replacement returns `'\n' + trimmed + '\n'` for a kept branch and `'\n'` for a removed block (L136–L145).
- JSDoc (L87–L99) documents the "surrounded by single `\n` delimiters" behaviour as intended.
- Flag grammar is `\w+`; unknown flags are falsy; truthiness is JS truthiness of `context[flag]`.
- Malformed input (unclosed `{{#if`, stray `{{/if}}`) is left literally in the output because the regex does not match it.
- Callers: `ai-persona-builder/src/builders/persona-builder.ts` L472 (body: `resolvePartials` → `resolveConditionals` → `resolveVariables` → `collapseBlankLines` → `ensureBlankLineBeforeHeadings` → `trimEnd`, L471–L476); `ai-persona-builder/src/builders/frontmatter.ts` L98–L106 `renderFrontmatter()` (conditionals → variables on the frontmatter template). Exported from the package root via `ai-persona-builder/src/engine/index.ts` L9 and `ai-persona-builder/src/index.ts` L9 (`export * from './engine/index.js'`).
- `ai-persona-builder/src/engine/postProcessor.ts`: `collapseBlankLines()` (L18–L20) turns `\n{4,}` into `\n\n\n` — it caps runs at **two** blank lines, not one. `ensureBlankLineBeforeHeadings()` (L33–L41) re-inserts blank lines before headings and around `---`; its JSDoc (L25–L28) cites "conditionals add only a single `\n` delimiter" as a reason it exists.
- `ai-persona-builder/src/engine/partials.ts` L18, L46–L47: every resolved partial is `trimEnd()`-ed — the second reason `ensureBlankLineBeforeHeadings()` exists; unaffected by the conditional fix.

### Established Patterns
- Zero-import engine modules, no cross-module references — `ai-persona-builder/docs/agents/project-manifest/constraints.md` §"1. Zero-Dependency Engine Layer" (L21–L23).
- Processing order partials → conditionals → variables is mandatory — `ai-persona-builder/AGENTS.md` Failure Protocol; `constraints.md` L103.
- Module-level hoisted regex constants with `lastIndex` notes — `conditionals.ts` L19–L30.

### Structural Observations
- `conditionals.ts`: whitespace behaviour is a by-product of a regex that greedily eats `\n*` on both sides and re-emits one `\n`; there is no notion of a tag standing alone on its line versus sitting inside a line. Both reported defects (lost paragraph breaks, inline line breaks) stem from this single shape.
- `conditionals.ts`: `{{else if}}` support is a string-rewriting pre-pass (`resolveElseIf`) that places two tags on one line (`{{else}}{{#if b}}`, `{{/if}}{{/if}}`). Any line-aware whitespace rule would have to see through these synthetic multi-tag lines — the pre-pass fights a line-based fix.
- `conditionals.ts`: innermost-first repeated regex passes are O(depth × n) and re-scan the whole string each pass.
- `postProcessor.ts` L25–L28: JSDoc rationale becomes partly stale once conditionals keep authored blank lines.
- The bug report's "Behaviour to keep" assumes `collapseBlankLines()` caps surplus blank lines; it caps at two blank lines, so a removed block that leaves `\n\n\n\n` → `\n\n\n` (two blank lines) would still be wrong. The fix must produce a single paragraph break itself.

### Constraints
- No imports in `conditionals.ts` (engine invariant) — the parser must live inside that file.
- Public signature `resolveConditionals(text, context): string` must stay unchanged (exported from package root).
- Existing test `preserves whitespace symmetry: nested else output equals flat else output` (`tests/engine/conditionals.test.ts` L144–L154) must keep passing.
- Frontmatter templates depend on tight (no blank line) conditional output — see Area "AI Insights consumer templates".

## Area: Engine Tests

### Verified References
- `ai-persona-builder/tests/engine/conditionals.test.ts` (318 lines): suites `resolveConditionals()` (basic, unknown flags, multiline, multiple blocks, nested, edge cases) and `resolveConditionals() — {{else if}} chains`. Most assertions use `toContain` or `.trim()`, so they are agnostic to the old `\n` padding; the symmetry test compares nested vs flat output directly.
- `ai-persona-builder/tests/engine/postProcessor.test.ts`, `partials.test.ts`, `variables.test.ts`, `serializer.test.ts` exist.
- `ai-persona-builder/tests/helpers/suite-fixture.ts` — `createMinimalSuite()` factory used by builder tests (per `tests/README.md`).
- `ai-persona-builder/fixtures/sample-suite/content/example-persona.md` contains `{{#if` blocks; `tests/integration/build.test.ts` builds against fixtures. No snapshot tests exist (`toMatchSnapshot` not used anywhere under `tests/`).

### Established Patterns
- Test files mirror `src/` — `ai-persona-builder/AGENTS.md` Repo Layout.

### Structural Observations
- No test asserts exact whitespace around blocks with authored blank lines — the defect survived because every assertion is `toContain`/`trim()`.

### Constraints
- Suite currently 620 tests / 35 files (`AGENTS.md` Project Stats).

## Area: Library Documentation & Manifest

### Verified References
- `ai-persona-builder/docs/template-syntax.md` §Conditionals (L52–L109): no statement about whitespace/newline handling; L86–L87 and L107–L108 describe the else-if normalisation and innermost-first passes.
- `ai-persona-builder/docs/agents/project-manifest/api-surface.md` L274–L287: `resolveConditionals` entry describes the internal `resolveElseIf()` pre-processor.
- `ai-persona-builder/docs/agents/project-manifest/constraints.md` §Template Syntax (L90–L103): authoritative syntax table (row for else-if says "via pre-processor"); §Known Limitations 1–14 (L~200–L300); §Test Suite (L315–L326).
- `ai-persona-builder/docs/agents/project-manifest/data-flows.md` L61–L70: body render order; no whitespace claims.
- `ai-persona-builder/docs/agents/project-manifest/tech-stack.md`: sections `Architectural Patterns` → `Layered Architecture` (L43), `Key Patterns` (L57).
- `ai-persona-builder/docs/api.md`: sections Build functions, Types, Target registry, Utilities (L51–L56), Persona index…; **no engine function documented** although all engine functions are exported from the root.
- `ai-persona-builder/tests/README.md`: lists `serializers.test.ts` — actual file is `tests/engine/serializer.test.ts`.
- `ai-persona-builder/docs/agents/project-manifest/file-tree.md` L66–L103: per-directory test-count annotations (e.g. `engine/ (90 tests)`), header claims 35 source / 35 test files.
- `ai-persona-builder/CHANGELOG.md`: top entry `## v3.0.0 - Persona Targets & Tool Validation (proposed)`; below it `v2.6.1 - Bundle Documentation`, `v2.6.0`, `v2.5.1`.
- `ai-persona-builder/package.json` `"version": "2.5.1"`; `git describe` → `v2.5.1-15-g4a76cb5`; tag `v2.6.0` (`52f1e63`) is not on any branch (commit "2.6.0" is the npm version bump).

### Established Patterns
- Manifest Maintenance Rules table — `ai-persona-builder/AGENTS.md` (engine function change → `api-surface.md` + zero-dependency check in `constraints.md`; new file → `file-tree.md`; new limitation → `constraints.md` Known Limitations).
- Template Syntax table is the authoritative syntax contract (repository insight `b3ea12b4-1fb3-4aa3-8e72-6dcc501d426d`).
- Proposed-version changelog heading with a "proposal only" blockquote — `CHANGELOG.md` L5–L7.

### Structural Observations
- `tests/README.md` and `file-tree.md` test counts are hand-maintained and have drifted repeatedly (synthesis WP-002/WP-008).
- `docs/api.md` omits the entire engine layer (synthesis WP-004).
- The synthesis' two reusable design templates (pure validator / impure orchestrator split; single capability-map vocabulary) exist only in the synthesis, not in `tech-stack.md` Key Patterns.

### Constraints
- Release itself (version bump, tag, publish) is the user's; changelog entries are in scope.

## Area: AI Insights Build Wrapper

### Verified References
- `ai-insights/scripts/build-personas.js` (559 lines, ESM): pre-build clean (L31–L52, real builds only); library CLI via `execFileSync` (L58–L63) — `catch (err) { process.exit(err.status ?? 1); }` exits before everything below; post-build version sync from `personas/changelog.md` (L65–L86, real builds only); post-build `personas/name-mapping.json` generation (L88–L369, real builds only, derives from source YAML, not from rendered output); `{{agent_slug_*}}` cross-reference check inline with a local `extractSubagentsList()` helper (L371–L458, `process.exit(1)` on error); insight field validation via `scripts/lib/insight-validation.js` (L459–L476, exits); rendered sub-agent reference validation via library `build({check:true})` + `scripts/lib/subagent-reference-validation.js` (L478–L507, exits); philosophy-tone warnings (L509–L535); changelog-size warnings (L537–L560).
- `ai-insights/scripts/lib/`: `changelog-size-check.js`, `insight-validation.js`, `philosophy-tone.js`, `subagent-reference-validation.js`, `yaml-utils.js`, `persona-model-resolution.js` (and others) — each check is a pure function returning an array of errors/warnings, called from the wrapper.
- `ai-insights/scripts/tests/build-personas-model-resolution.test.js` covers the name-mapping model resolution chain.

### Established Patterns
- Checks live in `scripts/lib/*.js` as pure functions returning string arrays; wrapper prints and decides — `scripts/lib/insight-validation.js`, `scripts/lib/philosophy-tone.js`.
- Guard-registry pattern (declarative checks returning structured results, one runner owning the exit decision) — global insight `2cd87f16-2556-4523-af27-0b88a6adbf0b`.

### Structural Observations
- Five independent `process.exit()` points: a failure in the library build or any error-severity check hides every later check and post-build step. The exit decision is scattered instead of owned by one runner.
- `{{agent_slug_*}}` check (L371–L458) is the only check still inline, with its own YAML list parser — untestable without running the whole script.
- Name-mapping generation (L88–L369) is a large inline block, but it is independent of the failure-propagation problem.

### Constraints
- Cross-platform policy: Node-only, no shell utilities (`ai-insights/AGENTS.md` Cross-Platform Policy).
- `personas/api-surface.md` §`scripts/build-personas.js` — CLI Interface (L14ff) documents the wrapper; must be updated on behaviour change.

## Area: AI Insights Script Tests

### Verified References
- `ai-insights/vitest.config.ts`: `include: ['scripts/tests/**/*.test.{js,ts}']`, no `testTimeout` (Vitest default 5000 ms).
- `ai-insights/scripts/tests/backfill-duration.test.js`: runs `scripts/backfill-duration.js` as a subprocess via `spawnSync('node', …)` (L20, L126), temp dirs via `mkdtempSync`.
- `ai-insights/scripts/tests/store-commands.test.js`: exercises `scripts/lib/store-commands.js`, which calls `spawnSync('git', …)` (lib L407, L416); temp dirs via `mkdtempSync` (test L40).
- `ai-insights/scripts/tests/README.md`: documents the CJS/ESM bridge and running tests.

### Structural Observations
- Both flaky suites spawn child processes per test and run in parallel with the rest of the suite; the default 5 s timeout is exceeded under load (synthesis WP-001). No shared helper exists for subprocess-suite timeouts.

### Constraints
- Raising the global `testTimeout` would also mask genuine hangs in pure unit suites.

## Area: AI Insights Persona Sources & Docs

### Verified References
- `ai-insights/personas/ledger/src/meta/1-planner.yaml`: `tools:` includes `agent` (VS Code dispatch) (L65–L74); `cc_tools:` includes `Task` (L80–L92) with a preceding comment about why `cc_tools` is explicit (L76–L79); no `subagents` list; changelog 2.12.0 (2026-09-29) explains `Task` was added for ad-hoc sub-agents.
- `ai-insights/personas/standalone/src/meta/web-gui-specialist.yaml` L36–L44: inline YAML comment + `tool_parity_exceptions: [web]` — precedent for documenting an intentional capability difference; changelog 1.7.5 states the grant change and why.
- `ai-insights/personas/docs/agents/project-manifest/constraints.md` L199–L206: dispatch-grant rules; L204 says a dispatch written inline with neither trigger (`subagents` / handoff partial) is not checked; L206 documents `tool_parity_exceptions`. No statement of the changelog-as-audit-trail convention anywhere in the personas manifest or `AGENTS.md`.
- `ai-insights/personas/changelog.md`: top entry `## v3.39.0 - **WIP, UNRELEASED**` (summary-only, rule 8 of the Changelog Convention in `ai-insights/AGENTS.md`).
- `ai-insights/scripts/cli.js` L556–L567: `ctx-generate` command (removes `.context/`, runs `ctx generate`).

### Structural Observations
- The planner's dispatch grant without a `subagents` list is a deliberate exception that is visible only in a changelog line, not at the grant itself.
- Two content files use a pseudo-comment `{{else}}{{!-- fallback for future or unknown targets --}}` (`ai-insights/personas/standalone/src/content/developer.md` L177, `ai-insights/personas/standalone/src/content/web-gui-specialist.md` L270). The engine has no comment syntax (`{{!` appears nowhere in `ai-persona-builder/src/`); the text would render literally if that branch were ever chosen. The branch is unreachable for the three registered targets.

### Constraints
- Changelog Convention (`ai-insights/AGENTS.md`): `personas/changelog.md` is summary-only, one line per theme.

## Area: AI Insights Consumer Templates (verification input)

### Verified References
- Tag placement scan across `ai-insights/personas/{shared,ledger/src,ledger-support/src,standalone/src,plugins}` and `persona-build.config.js`: 23 files carry conditional tags; 94 standalone tag lines sit directly next to a blank line; 0 indented standalone tags; 0 lines with more than one tag; inline (non-standalone) tags only in the two pseudo-comment lines above and in `ai-insights/personas/plugins/ledger/frontmatter-templates.js` L50–L51:
  ```
  {{#if model}}model: '{{model}}'
  {{/if}}role: {{role}}
  ```
  Under "remove inline tags only" semantics this renders `model: 'x'\nrole: …` (truthy) and `role: …` (falsy) — identical to today.
- Other frontmatter templates (`frontmatter-templates.js` L54–L56, L75–L84; `persona-build.config.js` L40–L62) use standalone tag lines with no blank lines — must stay tight.
- `ai-insights/personas/shared/partials/documentation-ownership.md` L14–L47: the three joined-paragraph cases from the bug report (blank lines at L14, L29, L37 next to tags).
- Rendered output directories (gitignored, e.g. `/personas/ledger/claude-code/*.md` in `ai-insights/.gitignore` L26): `personas/{ledger,standalone,ledger-support}/{vs-code,claude-code,deep-agents}` per `ai-insights/personas/persona-build.config.js` L105–L130.
- Dev link in place: `ai-insights/personas/node_modules/@mistralys/persona-builder -> ../../../../ai-persona-builder` (created 2026-09-30 per `…/2026-09-30-persona-targets-and-tool-validation/dev-linking.md`). The wrapper runs the built `dist/cli.js`, so the library must be rebuilt after each source change (dev-linking.md "Rebuild rule").

### Constraints
- Only the conditional-engine change may alter rendered output; expected diff = blank lines added, nothing else.

## Area: Template Comment Syntax (added to scope by the user, 2026-09-30)

### Verified References
- No comment syntax exists in the engine: `{{!` appears nowhere in `ai-persona-builder/src/`, `fixtures/`, `tests/` or `docs/` (other than a rejected-alternative row in `docs/agents/implementation-history/2026-05-31-variable-escape-syntax/plan.md` L71, which considered `{{!varName}}` as an escape prefix and rejected it).
- The only consumer usage today is the two `{{else}}{{!-- fallback for future or unknown targets --}}` lines in `ai-insights/personas/standalone/src/content/developer.md` L177 and `web-gui-specialist.md` L270. No other `{{!` exists in `ai-insights/personas` sources, so there are no literal `{{!` strings that a new syntax would start swallowing.
- `ai-persona-builder/src/engine/partials.ts`:
  - `resolvePartials()` (L34–L48) expands `{{> name}}` wherever it occurs, including inside any would-be comment, and warns on unknown names (`console.warn('[WARN] Partial not found: …')`).
  - `collectPartialReferences()` (L50ff) scans raw template text.
- `ai-persona-builder/src/builders/persona-builder.ts`:
  - `isToolRequirementTriggered()` (L318–L333) calls `collectPartialReferences(bodyTemplate, personaPartialsMap)` on the **raw** body template (L331, L497). So a commented-out `{{> handoff-block-claude-code}}` would still trigger a dispatch-grant requirement unless comments are stripped before this point.
  - Persona partials map: built per suite (L614–L632: `BuildConfig.partials` → shared dir → suite dir → `runPartials` plugins), then copied and passed through `runPersonaPartials` per persona × target (L446–L456, step 4). After that point it is final for rendering.
  - Body template loaded at L468 (`normalizeNewlines(await readFile(contentPath, 'utf8'))`).
- `ai-persona-builder/src/builders/frontmatter.ts` L98–L106: `renderFrontmatter()` is the single entry point for frontmatter rendering.
- `ai-persona-builder/src/loaders/partials-loader.ts` `loadPartials(dir)` returns raw file contents keyed by stem. Plugins and `BuildConfig.partials` can also inject partial content, so stripping at load time would miss those sources.
- `ai-persona-builder/docs/agents/project-manifest/data-flows.md` L61–L70 (render tree) and L182 (context-merge / render numbered list) describe the body pipeline.
- `ai-persona-builder/README.md` L15: feature bullet listing `{{variables}}`, `{{> partials}}`, `{{#if}}` conditionals; L77 describes `docs/template-syntax.md` as covering "Variables, partials, conditionals, and built-in context variables".
- `ai-insights/scripts/build-personas.js` `{{agent_slug_*}}` check (L371–L458) scans **raw** content files. A `{{agent_slug_x}}` inside a comment would be a false positive once comments exist. The wrapper already loads the library's `dist/index.cjs` (L494).

### Established Patterns
- Handlebars comment forms are the de facto convention for `{{…}}` languages: `{{!-- … --}}` (may contain `}}`, may span lines) and `{{! … }}` (short, cannot contain `}}`).
- Engine modules have zero imports and no cross-module references (`constraints.md` §1), so shared line-handling logic cannot be factored into a helper module imported by two engine files.

### Structural Observations
- The standalone-line and blank-run-merge whitespace rules planned for conditional tags apply equally to comments. Implementing them in two engine modules would duplicate the whitespace contract in two places that could drift apart.
- Raw-template consumers (`collectPartialReferences` via `isToolRequirementTriggered`, and the `ai-insights` agent-slug scanner) must see comment-free text, or they report references the output never contains.

### Constraints
- Comments must be removed before partial expansion and before any raw-template scan. Removing them only inside `resolveConditionals` (which runs after partials) is too late.

## Strategic Context

- `ledger_get_repository_context` (ai-persona-builder): no strategic vision declared. Latest project `2026-09-30-persona-targets-and-tool-validation` COMPLETE (17/17 WPs); publishing and the dependency bump are pending user actions.
- Insight `b3ea12b4-1fb3-4aa3-8e72-6dcc501d426d` (repo): Template Syntax table in `constraints.md` is the authoritative contract — a syntax/semantics change must update it as a first-class criterion.
- Insight `e41ef85e-495a-48e5-a3be-138759930fb0` (repo): engine files carry a zero-import invariant — keep new logic self-contained.
- Insight `2cd87f16-2556-4523-af27-0b88a6adbf0b` (global): guard-registry pattern — checks return structured results, one runner owns the exit code; testable with synthetic descriptors.
- Insight `48607cdb-51a9-4483-a9ec-28b4ead77b23` (global): test guards with a synthetic failing fixture, not only clean real data.
- Insight `660d8039-d438-4402-b7e4-dd9578a6d576` (ai-insights): partial tags at column 0 — unaffected (partials engine unchanged).
- No stored insight describes `resolveElseIf()` or the conditional whitespace behaviour (repository search returned none), so no insight is overtaken by the engine rewrite.
