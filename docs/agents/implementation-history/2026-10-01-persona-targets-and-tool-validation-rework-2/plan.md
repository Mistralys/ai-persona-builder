# Plan

## Plan Audit Cycles
- Audits: 2 (Sonnet 5.5 ×2) — Plan Auditor v1.11.0
- Architectural Reviews: 1 (Sonnet 5.5 ×1) — Plan Architect Reviewer v2.3.4

## Prior Project Context

- **Origin.** This is the second rework of `2026-09-30-persona-targets-and-tool-validation`. It addresses the actionable items in `ai-persona-builder/docs/agents/implementation-history/2026-09-30-persona-targets-and-tool-validation-rework-1/synthesis.md`. At the user's request (2026-10-01), it also promotes every deferred and out-of-scope item from that cycle's `plan.md` that fits.
- **Strategic vision.** `ledger_get_repository_context` declares no vision for `ai-persona-builder`. The plan follows the synthesis' own recommendations:
  - extend shared parsers through the one shared merge routine, rather than duplicating whitespace logic;
  - turn a missing step into a test failure;
  - put check aggregation in a descriptor runner;
  - give baseline-and-diff oracles an explicit early capture step.
- **Triage of the synthesis' Deferred & Follow-Up Items.**

  | Synthesis item | Disposition |
  |---|---|
  | WP-001 QA: adjacent emits-nothing blocks leave two blank lines | Promoted (steps 3–5). Probing showed the same defect for adjacent standalone **comments**, which the WP-005 QA note had recorded as correct. |
  | WP-005 QA: comment coverage gaps | Promoted (step 4) |
  | WP-003: `ledger-dirs.js` untested `spawnSync` | Promoted (steps 8–10), together with the five duplicated copies of the same freshness logic |
  | WP-003: the `claude-cli` / `npm-link` / `health-checks` timeouts | Already resolved in the prior cycle's QA rework. No action. |
  | WP-006: v3.0.0 migration guide | Promoted (step 7) as release preparation |
  | WP-006: `package.json` version bump | Kept as Human Action 1. `CHANGELOG.md`'s own policy reserves the number for the maintainer at publish time. |
  | WP-010: duplicate acceptance criterion | Verified resolved on 2026-10-01: WP-010 shows 4 criteria, all met. No action. |
  | Process note: baseline capture for diff oracles | Applied to this plan (step 2) and codified in the workflow personas (step 13) |
  | Traceability: omitted `files_modified` | Promoted (step 13) |

- **The prior plan's own Out of Scope and Deferred items.**
  - `philosophy-tone.js` comment awareness: promoted (step 12).
  - Name-mapping extraction from `build-personas.js`: promoted (step 11).
  - A literal `{{!` escape form: deferred (no consumer).
  - Deferred Item 1, "formalise CTX regeneration in the Documentation stage": already satisfied by Workflow step 5 of `ai-insights/personas/ledger/src/content/8-documentation.md`, which delegates CTX regeneration to the CTX Architect whenever `context.yaml` exists. Closed without action.
- **Reused insights.**
  - `e41ef85e`: zero-import engine (AC-04).
  - `b3ea12b4`: the `constraints.md` Template Syntax notes are the contract (AC-08).
  - `7d13934f`: validation has a hard ceiling, so a literal NUL in a template is documented rather than engineered around.
  - `2cd87f16`: library code returns structured results and the caller owns the exit (step 8).
  - `e832d2f4`: build-time logic lives in `scripts/lib/` with fixture tests (steps 11–12).
  - `5ceb852c` and `cdaf1471`: a WP that produces an artefact needs an authoring stage, decided at creation time (step 13).
  - `5aac16d9`: exact-text updates silently duplicate. This explains the WP-010 artefact (Deferred Item 2).

## Summary

This rework closes the actionable items of the `2026-09-30-persona-targets-and-tool-validation-rework-1` synthesis across `ai-persona-builder` and `ai-insights`. It also takes in every deferred and out-of-scope item from that cycle that fits within the blast radius of the work.

In the library:
- the shared blank-run merge in `src/engine/conditionals.ts` learns to treat a cluster of adjacent removals as one removal, which fixes both adjacent emits-nothing conditional blocks and adjacent standalone comments;
- the QA coverage gaps get permanent regression tests;
- a v3.0.0 migration guide is written as release preparation.

In `ai-insights`:
- the MCP-dist freshness guard is extracted into a single tested `scripts/lib` module, so `ledger-dirs.js` becomes testable and five drifting copies disappear;
- the build wrapper's name-mapping pass is extracted into a tested module;
- the philosophy-tone check becomes comment-aware;
- the workflow personas learn two process lessons from the synthesis: capture a baseline for a diff oracle before anything mutates the tree, and always declare `files_modified`, empty when nothing was modified.

This plan applies the first lesson to itself. Step 2 captures the baseline that steps 5 and 11 diff against.

## Architectural Context

- **Engine (`ai-persona-builder/src/engine/conditionals.ts`).**
  - A single `TAG_PATTERN` tokenizer feeds two entry points.
  - `resolveConditionals()` renders blocks through `renderRange()`. A block that selects no branch emits `EMPTY_BLOCK_MARKER` (`'\0'`, L196).
  - `stripComments()` emits the same marker for each removed comment.
  - Both call `mergeMarkers()` (L308–L316). It replaces each marker, together with the blank-line runs directly before and after it, with the longer of the two runs.
  - The module has zero imports.
- **Library docs.**
  - `docs/template-syntax.md` holds the user-facing whitespace rules.
  - `docs/agents/project-manifest/{api-surface,constraints,file-tree}.md` hold the agent contract. `AGENTS.md` Manifest Maintenance Rules define which manifest changes go with which code changes.
  - `CHANGELOG.md` carries `v3.0.0 (proposed)`, with one breaking change and no migration notes.
- **`ai-insights` scripts.**
  - Root-level `scripts/*.js` and shared `scripts/lib/*.js` (ESM) are tested by Vitest suites in `scripts/tests/`, with `SUBPROCESS_TEST_TIMEOUT_MS` for suites that spawn subprocesses.
  - The MCP-dist freshness logic is copied into `scripts/lib/ledger-dirs.js`, `scripts/import-standalone.js`, `scripts/run-orchestrator.js`, `scripts/cli.js`, `scripts/lib/health-checks.js` and `scripts/preflight-bootstrap.js`.
  - `scripts/build-personas.js` runs the library CLI, then post-build steps (the version sync, a 280-line inline name-mapping generator), then a descriptor list run by `scripts/lib/build-checks.js`.
- **`ai-insights` personas.**
  - Shared planner partials (`personas/shared/partials/planner-*.md`) feed the ledger and standalone Planners.
  - The ledger-support chain (WP Decomposer → Dependency Sequencer → Pipeline Configurator) turns a plan into WPs. The standalone Plan Auditor checks plans.
  - Ledger stage personas (`personas/ledger/src/content/*.md`) complete pipelines with `artifacts.files_modified`.
  - Every persona YAML carries its own `changelog`. `personas/changelog.md` summarises outcomes, and its newest entry is size-checked (≤ 25 bullets, ≤ 60 lines).
- **Cross-repo link.** `ai-insights/personas/node_modules/@mistralys/persona-builder` is a symlink to `ai-persona-builder`. The wrapper executes the library's built `dist/cli.js`. Rendered personas are gitignored, and `personas/name-mapping.json` is tracked.

## Approach / Architecture

### 1. Cluster-aware blank-run merge (library)

`mergeMarkers()` resolves a **cluster** in one replacement. A cluster is one or more markers, where consecutive markers are separated only by whitespace-only lines, together with the blank-line runs before the first marker and after the last. The cluster becomes `'\n'.repeat(max(newline count of every run in the cluster))`.

Tight adjacency produces `\0\0` with nothing between the markers, so the cluster pattern must allow zero-length gaps. To compute the result, split the matched cluster on `\0` and take the maximum newline count of the pieces. Every piece is an unambiguous `(?:[ \t]*\n)*` run, so the pattern stays free of backtracking blow-up.

A single marker behaves exactly as before, since a cluster of one has two runs. Inline markers with no runs still vanish. The fix lives in the one routine both entry points share, so no whitespace logic is duplicated.

Required outputs (`ra` = `resolveConditionals(input, {})`, `sc` = `stripComments`):

| Input | Fn | Output |
|---|---|---|
| `A\n\n{{#if a}}\nx\n{{/if}}\n{{#if b}}\ny\n{{/if}}\n\nB` | ra | `A\n\nB` |
| `A\n\n{{#if a}}\nx\n{{/if}}\n\n{{#if b}}\ny\n{{/if}}\n\nB` | ra | `A\n\nB` |
| three adjacent empty blocks between paragraphs, blank-separated | ra | `A\n\nB` |
| `A\n{{#if a}}\nx\n{{/if}}\n{{#if b}}\ny\n{{/if}}\nB` | ra | `A\nB` (unchanged) |
| `A\n\n{{#if a}}\nx\n{{/if}}\n\n{{#if k}}\nK\n{{/if}}\n\n{{#if b}}\ny\n{{/if}}\n\nB` with `k: true` | ra | `A\n\nK\n\nB` |
| `x {{#if a}}y{{/if}}{{#if b}}z{{/if}} w` | ra | `x  w` (unchanged) |
| `A\n\n{{!-- a --}}\n{{!-- b --}}\n\nB` | sc | `A\n\nB` |
| `A\n\n{{!-- a --}}\n\n{{!-- b --}}\n\nB` | sc | `A\n\nB` |
| `A\n{{!----}}\nB`, `A\n{{!}}\nB` | sc | `A\nB` |
| `A\n{{!-- c --}}` | sc | `A\n` |
| `A\n\n{{!-- c --}}\n\nB` | sc | `A\n\nB` (unchanged) |

The kept-block row is the guard against over-merging. A kept block breaks the cluster, because its content is not a whitespace-only run.

### 2. Baseline-first consumer verification

Step 2 captures the nine rendered output directories and `personas/name-mapping.json` into `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/`. `DEV/` is not a git repository, so the snapshot sits outside both repositories and needs no `.gitignore` edit. This location is specific to this multi-repo workspace. The persona rule in §5 deliberately does not prescribe it. The capture happens before any source change, from a library `dist/` rebuilt at current HEAD. Two oracles diff against it:
- Step 5 checks the engine fix. Every difference must be a **removed blank line**: no `>` lines, no `<` line with content, and no added or removed files.
- Step 11 checks the name-mapping extraction: `personas/name-mapping.json` is byte-identical.

Both oracles run before step 13 edits persona sources, so persona edits cannot contaminate them.

Step 15's final diff is a **classified** check, not a strict one. Step 13 bumps seven persona versions. The VS Code `agent_name` is `"{n} - {role} v{version}"` (`ai-insights/scripts/build-personas.js` L266), and other personas embed those names through `{{agent_*}}` variables. Rendered files of personas that step 13 does not edit therefore change too: for example `plan-refiner.md` embeds `1 - Planner v2.12.0` and `Plan Auditor v1.11.0`. Every changed file must fall into one of three classes:
- **(a)** in step 5's recorded list;
- **(b)** a rendered output of a persona edited in step 13;
- **(c)** a version-stamp-only change: once every `v<digits>.<digits>.<digits>` token on both sides is normalised to one placeholder (`sed -E 's/v[0-9]+\.[0-9]+\.[0-9]+/vX.Y.Z/g'`), the file is identical to its baseline.

`>` lines are expected in classes (b) and (c). No file may be added or removed, and a file outside all three classes fails the check.

### 3. Shared MCP-dist freshness module (`ai-insights`)

New `ai-insights/scripts/lib/mcp-dist-freshness.js` exports:

- `latestMtime(dir)`: the recursive maximum file mtime. An unreadable or missing directory yields `-Infinity`, the tolerant variant `health-checks.js` already uses.
- `isMcpDistStale({ srcDir, sentinelFile })`: `true` when the sentinel is missing or older than the newest source file.
- `ensureMcpDistFresh({ mcpServerDir, requiredFile, spawn = spawnSync, platform = process.platform, onBuildStart = () => {} })` returns a structured result:
  - `{ ok: true, rebuilt }`;
  - `{ ok: false, reason: 'build-failed', status }`;
  - `{ ok: false, reason: 'missing-module', file }`.

  `requiredFile` is optional. When it is omitted, no missing-module check runs. `onBuildStart()` is called once, immediately before the build is spawned, so a caller can print its own "stale — building" line.

  The function **never prints** and never calls `process.exit`. The callers' message texts differ (brief, "Added References"), so presentation stays with each caller.

Each caller maps the result to its existing messages and exit codes, verbatim:
- `ledger-dirs.js`: `requiredFile` = `dist/storage/ledger-store.js`. It prints its `[ledger-dirs] …` lines and exits as today.
- `import-standalone.js`: `requiredFile` = `dist/tools/standalone-import.js`. It prints its unprefixed `Error: compiled tool not found at …` line and exits as today.
- `run-orchestrator.js`: no `requiredFile`. On `build-failed` it exits with `status ?? 1` and prints nothing, as today. When `rebuilt` is false it prints its "up to date — skipping build" line.
- `cli.js`: uses `isMcpDistStale` and keeps its own `sh()` runner and `log()` styling.
- `health-checks.js`: uses only the shared `latestMtime` and keeps its directory-to-directory comparison.

Injecting `spawn` and `platform` makes the spawn path, including the Windows `npm.cmd` + `shell: true` branch, unit-testable without a real subprocess.

One behaviour change is intended. The four callers whose private `latestMtime` throws now use the tolerant variant, so a missing or unreadable `mcp-server/src/` reads as "not newer" instead of crashing. A missing sentinel still triggers a build.

### 4. Build wrapper extractions (`ai-insights`)

- **New `ai-insights/scripts/lib/name-mapping.js`.**
  - `generateNameMapping({ personasDir, warn = console.warn, info = console.info })` returns `{ entries, ledgerCount, nonLedgerCount }`.
  - `writeNameMapping(outPath, entries)` writes `JSON.stringify(entries, null, 2) + '\n'`.
  - The helpers `resolveVersionFromChangelog`, `validateChangelogField` and `deriveRole` are exported for unit tests.
  - `build-personas.js` keeps the `if (!CHECK)` guard and the summary log line, and calls these two functions in place of L102–L384. The logic moves verbatim; message texts and output bytes are unchanged.
- **Comment-aware philosophy tone.**
  - `checkPhilosophyTone(markdown, filename, { stripComments = (t) => t } = {})` applies `stripComments` to each extracted principle's `title` and `body`, after `extractPhilosophyPrinciples()`. Line numbers therefore still refer to the raw file.
  - A principle whose title is empty after stripping is skipped.
  - Known edge: a principle bullet that sits *inside* a multi-line comment is still extracted, because extraction runs on raw lines and the comment's tags are on other lines. No persona source has a multi-line comment today (brief, Build Wrapper). The edge is pinned by a characterization test and stated in the `checkPhilosophyTone` JSDoc. It is not engineered around, since fixing it would mean a line-preserving comment stripper that duplicates the library tokenizer.
  - `checkPhilosophyToneInDirs(dirs, { stripComments })` forwards the option.
  - The `philosophy-tone` descriptor passes `{ stripComments: stripCommentsFn }`, the same seam `agent-slug-validation.js` uses.

### 5. Workflow guidance (`ai-insights` personas)

The baseline lesson travels the same chain the symlink rule took in `ai-insights@c00901ce`:

- **Planner rule and checklist item** (`personas/shared/partials/planner-core-rules.md`, `planner-quality-checklist.md`). The rule states the principle, not a path:
  - a before/after diff oracle gets its own early capture step;
  - the step runs before any step mutates what it snapshots;
  - the snapshot goes to a location the run will not clean or overwrite, and the plan records that location.

  The rule also states the reason: generated output is often gitignored and cannot be recovered afterwards. These partials feed project-agnostic Planners, including single-repo projects with no workspace root, so the plan chooses the path itself. A gitignored directory inside the repository and a directory outside it are both valid.
- **WP Decomposer constraint.** The capture stays its own WP, named in the `**Notes:**` of every WP that mutates the snapshotted files, so the Dependency Sequencer orders it first. This mirrors the symlink constraint at L156.
- **No Dependency Sequencer edit.** The Sequencer already reads the Decomposer's notes (L53) and already has the criterion "the plan document explicitly orders A before B". The `c00901ce` symlink rule reached it the same way, with no Sequencer change. A separate edge criterion would restate the Decomposer constraint, and it would be one more copy of the rule that can drift.
- **Pipeline Configurator rule.** A baseline-capture WP runs `["implementation", "qa"]` and is never verification-only, because its snapshot is a deliverable later WPs consume. The verification-only prerequisite cross-references this.
- **Plan Auditor consistency check.** A diff-oracle criterion without an early baseline step is a **Major** finding. It is Major rather than Critical because the run can still complete; the oracle just loses its reference.

The `files_modified` lesson:
- the ledger Documentation persona declares `artifacts.files_modified: []` explicitly when a pass modified nothing;
- the Reviewer's existing "declare reviewed files" rule gains "never omit the field".

## Rationale

- **Fix the merge, not the callers.** Both defects come from the one shared routine. Fixing it there keeps the "one whitespace contract, one implementation" property that the code review called this module's strongest trait.
- **Baseline before mutation, made explicit.** The previous cycle recovered its baseline only by luck. This plan makes the capture its own dependency-free step and makes every oracle depend on it. That is the synthesis' own recommendation, applied before it is codified.
- **One freshness module.** Six copies of `latestMtime` have already drifted: they handle errors differently and use different sentinels for the missing case. Extracting the shared shape gives `ledger-dirs.js` the test seam the synthesis asked for. It also removes copies a later fix would otherwise have to patch six times.
- **Logic shared, presentation not.** The module covers only what the callers do identically: staleness, spawn, the required-module check and the result. Message texts differ per caller, so a printing helper would need per-caller text options or would change `run-orchestrator.js`'s silent failure. `onBuildStart` exists because three of the four callers print a pre-build line at that moment and nowhere else.
- **Extraction over leaving inline.** The name-mapping block is the largest untestable region of the wrapper this plan already edits. A byte-identical `name-mapping.json` is a strong oracle for a pure move.
- **The migration guide as a document.** v3.0.0 changes build semantics, the CLI exit code, required `BuildSummary` fields, rendered whitespace and the meaning of `{{!`. That is too much for a changelog subsection. A `docs/` page ships in the npm package, and the changelog links to it.
- **Persona rules over server enforcement.** The ledger cannot tell whether a WP is a baseline capture. The decision belongs where WPs are shaped.

## Considered Alternatives

| Decision | Chosen Shape | Alternatives Considered | Trade-Off Summary |
|----------|--------------|-------------------------|-------------------|
| Adjacent-removal fix | Cluster-aware `mergeMarkers()` regex | Track blank-run state across siblings in `renderRange()`; lower `collapseBlankLines()` to one blank line in the builder | `renderRange()` state would also need a twin in `stripComments()`. The builder change would alter authored double blank lines. The cluster regex fixes both entry points in one pure routine. |
| Literal NUL in source | Document as Known Limitation 16, with a characterization test | Choose a per-call sentinel code point absent from the input | A NUL byte in a Markdown template is malformed content (insight `7d13934f`). A dynamic sentinel adds regex construction and branching to protect nothing anyone writes. |
| Baseline storage (this plan) | `DEV/.baselines/<plan-slug>/` | `mktemp -d`; the plan folder; a gitignored `.baselines/` inside `ai-insights`; re-deriving the baseline from a `git worktree` at the recorded HEAD | `mktemp` paths vanish and are hard for later WPs to find. The plan folder is committed and archived. An in-repo `.baselines/` would need a `.gitignore` edit in `ai-insights`. A worktree needs a clean-HEAD build, and the rendered output is gitignored anyway. The workspace root is outside both repositories, persistent, and needs no repo change. |
| Baseline rule in shared personas | State the principle: an early capture step, a location the run will not clean, recorded in the plan | Prescribe "outside every repository" | The shared Planner partials serve single-repo projects too, where no workspace root exists. The principle holds everywhere; the path is a per-plan decision. |
| Freshness module failure contract | Structured result; callers own `process.exit` | Keep `process.exit` inside the helper; throw a typed error | Exiting inside the helper keeps it untestable. Throwing changes the crash behaviour of three CLI consumers. A result object matches `build-checks.js`. |
| Freshness module presentation | The module never prints; an `onBuildStart` hook; each caller formats its own lines | The module prints through injected `log`/`error` sinks with a `label`; share only `isMcpDistStale` and `latestMtime` | The callers' texts differ (prefixes, "tool" vs "module", a silent failure in `run-orchestrator.js`), so a printing helper would grow per-caller text options or change behaviour. Sharing only the stale check would leave four `spawnSync` copies and the untested spawn path in `ledger-dirs.js`. |
| Scope of freshness migration | `ledger-dirs.js`, `import-standalone.js`, `run-orchestrator.js`, `cli.js`, and `health-checks.js` (`latestMtime` only) | All six copies, including `preflight-bootstrap.js`; only `ledger-dirs.js` | `preflight-bootstrap.js` is the workspace bootstrapper run by `menu.sh` and stays self-contained. Migrating only `ledger-dirs.js` would leave the copy labelled "same pattern" to drift. |
| Name-mapping extraction | `scripts/lib/name-mapping.js` with injected `warn`/`info` | Leave inline; move into a persona-builder plugin; switch `resolveVersionFromChangelog` to the library's `resolveChangelogMeta()` | Leaving it inline keeps 280 lines untestable. A plugin would couple an `ai-insights`-specific file to the library. Using the library function would break name-mapping generation whenever `dist/` fails to load, which the wrapper deliberately tolerates. |
| Philosophy-tone comment stripping | Strip each extracted principle's title and body | Strip the whole file before extraction | Whole-file stripping shifts every line number after a multi-line comment, so warnings would cite wrong lines. |
| Migration guide placement | New `docs/migrating-to-v3.md`, linked from `CHANGELOG.md` and `README.md` | A `### Breaking Changes` subsection only, as in v2.0.0 | Five distinct consumer-facing changes need per-change "who is affected / what to do" guidance. A bundled doc page reaches npm users. The changelog keeps a one-line pointer. |
| Baseline rule enforcement | Planner, Decomposer, Configurator and Auditor guidance | An MCP server check at WP creation; adding a Dependency Sequencer edge criterion as well | The server cannot recognise a baseline WP from its fields. Guidance at the shaping stages follows the proven `c00901ce` propagation chain. The Sequencer already orders WPs from the Decomposer's `**Notes:**` and the plan's explicit ordering, so a Sequencer line would only restate the rule. |

## Pattern Alignment

- Follows the zero-import engine invariant: the fix stays inside `ai-persona-builder/src/engine/conditionals.ts`.
- Follows the shared-tokenizer, shared-merge design that the code review held up as the template (`stripComments()` reuses `mergeMarkers()`).
- Follows exact-string engine tests: `ai-persona-builder/tests/engine/conditionals.test.ts`.
- Follows the user-guide location and README linkage: `ai-persona-builder/docs/*.md` ↔ `ai-persona-builder/README.md` "Learn More".
- Follows the extract-to-`scripts/lib` pattern with fixture tests: `ai-insights/scripts/lib/claude-cli.js`, `ai-insights/scripts/lib/frontmatter.js`, `ai-insights/scripts/lib/agent-slug-validation.js`.
- Follows "results, not exits, in library code", with presentation owned by the caller: `ai-insights/scripts/lib/build-checks.js` (`resolveExitCode`). `ensureMcpDistFresh()` neither prints nor exits.
- Follows the `stripComments` injection seam with an identity default: `ai-insights/scripts/lib/agent-slug-validation.js`.
- Follows the rule-propagation chain Planner → Checklist → Decomposer → Auditor: `ai-insights@c00901ce`. The plan adds the Pipeline Configurator, where WP-010 went wrong. Like the precedent, it leaves the Dependency Sequencer to the Decomposer's `**Notes:**`.
- Follows the persona changelog convention: YAML changelog per persona, summary-only `ai-insights/personas/changelog.md` (`ai-insights/AGENTS.md` Changelog Convention).

## Structural Improvements

| Structure | Observation | Decision | Reason |
|-----------|-------------|----------|--------|
| `ai-persona-builder/src/engine/conditionals.ts` `mergeMarkers()` | Resolves one marker at a time, so adjacent removals add their runs together | Promoted to step 3 | The root cause of both synthesis-flagged whitespace defects |
| `ai-persona-builder/src/engine/conditionals.ts` `EMPTY_BLOCK_MARKER` | A literal `\0` in source is silently dropped | Rejected (documented in step 6 as Known Limitation 16) | Malformed content; see Considered Alternatives |
| `ai-persona-builder/docs/agents/project-manifest/file-tree.md` `docs/` listing | Missing `building-skills.md`, `dynamic-partials.md`, `target-differences.md` | Promoted to step 7 | Step 7 edits this listing to add the migration guide anyway |
| `ai-persona-builder/package.json` version `2.5.1` vs `CHANGELOG.md` | Diverged | Rejected (Human Action 1) | The CHANGELOG policy reserves the number for the maintainer; the orphaned `v2.6.0` tag needs a git-history decision |
| `ai-insights/scripts/lib/ledger-dirs.js` freshness guard | Hard-coded paths and `process.exit` in a library; untestable `spawnSync` | Promoted to steps 8–9 | Synthesis deferred item (WP-003) |
| `ai-insights/scripts/import-standalone.js`, `scripts/run-orchestrator.js`, `scripts/cli.js` copies | Duplicated guard / `latestMtime` | Promoted to step 9 | Same logic, same blast radius. They are the copies `ledger-dirs.js` was written to mirror. |
| `ai-insights/scripts/lib/health-checks.js` `latestMtime` | Private tolerant copy | Promoted to step 9 (function only; the check's comparison is unchanged) | Identical semantics to the shared variant |
| `ai-insights/scripts/preflight-bootstrap.js` `latestMtime`/`isStale` | Another copy, with `0` semantics and `execSync` | Rejected | It is the workspace bootstrapper launched by `menu.sh`/`menu.cmd`. Keeping it free of `scripts/lib` imports keeps first-run bootstrapping robust. |
| `ai-insights/scripts/import-standalone.js` double guard (own + via `ledger-dirs.js`) | The guard runs twice per invocation | Rejected | After the first run the second is a cheap stat walk. Memoizing would add hidden module state for no measurable gain. |
| `ai-insights/scripts/tests/README.md` "Current subprocess-spawning suites" list | Hand-maintained list that drifts on every retrofit | Promoted to step 10 | This plan edits the section; replace the list with a `grep -l SUBPROCESS_TEST_TIMEOUT_MS scripts/tests` pointer |
| `ai-insights/scripts/build-personas.js` L102–L384 name-mapping block | 280 inline lines, testable only via a full build | Promoted to step 11 | Prior plan's out-of-scope item; the user asked for it, and step 12 edits this file |
| `ai-insights/scripts/lib/philosophy-tone.js` raw-content scan | Not comment-aware | Promoted to step 12 | Prior plan's out-of-scope item; aligns every content-scanning check on one comment contract |
| `ai-insights/personas/ledger-support/src/content/ledger-pipeline-configurator.md` verification-only prerequisite | Allows a baseline capture without an authoring stage or ordering | Promoted to step 13 | Synthesis process note |
| `ai-insights/personas/ledger/src/content/8-documentation.md` artifacts rule | No instruction for a pass that modified nothing | Promoted to step 13 | Synthesis traceability note |
| `ai-insights/personas/changelog.md` `v3.39.0` WIP entry | Already at the 25-bullet cap | Promoted to step 14 (thematic regrouping) | New bullets would otherwise trip the size check and break the 0-warning build criterion |

## Detailed Steps

1. **Confirm the local library link.** Verify that `ai-insights/personas/node_modules/@mistralys/persona-builder` is a symlink to `ai-persona-builder`. If it is missing, re-create it by hand (`cd ai-insights/personas/node_modules/@mistralys && ln -s ../../../../ai-persona-builder persona-builder`).
2. **Capture the baseline** (no dependencies; every source-mutating step depends on this one).
   1. In `ai-persona-builder`, run `npm run build` at the current HEAD, so `dist/` matches source.
   2. In `ai-insights`, run `node scripts/build-personas.js` (a real build). It must exit 0.
   3. Copy the nine directories `ai-insights/personas/{ledger,standalone,ledger-support}/{vs-code,claude-code,deep-agents}/` into `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/rendered/`, preserving the relative layout, and copy `ai-insights/personas/name-mapping.json` alongside it.
   4. Write `MANIFEST.txt` in that folder, recording the `ai-persona-builder` and `ai-insights` HEAD commits, the capture time and the rendered file count.
3. **Fix the adjacent-removal merge.** In `ai-persona-builder/src/engine/conditionals.ts`:
   - rewrite `mergeMarkers()` to resolve marker clusters as specified in Approach §1;
   - update its JSDoc, and the whitespace contracts in the `resolveConditionals()` and `stripComments()` JSDoc, to state that adjacent removals (blocks or comments separated only by blank lines) merge as one removal;
   - keep zero imports and the exported signatures unchanged.
4. **Add the engine regression tests** to `ai-persona-builder/tests/engine/conditionals.test.ts`:
   - every Approach §1 row;
   - the empty-comment-body cases, the end-of-string comment, and adjacent comments both tight and blank-separated;
   - a characterization test for the literal-NUL limitation (`A\0B` → `AB`), named after Known Limitation 16.
5. **Verify the engine fix against the baseline.** Run `npm run build` in `ai-persona-builder`, then a real `node scripts/build-personas.js` in `ai-insights`. Then run `diff -r` of the baseline `rendered/` tree against the nine live directories. The acceptance check is:
   - no `Only in` lines;
   - no `>` lines;
   - every `<` line empty;
   - frontmatter blocks identical.

   Record in the pipeline notes the files changed, the blank lines removed, and the list of changed files. Zero differences is a valid outcome; record it as "no persona contains adjacent removals".
6. **Document the merge fix in the library.**
   - `ai-persona-builder/docs/template-syntax.md`: one adjacency example each in "Whitespace Rules" and "Whitespace and Line Handling".
   - `ai-persona-builder/docs/agents/project-manifest/api-surface.md`: the `resolveConditionals` and `stripComments` entries.
   - `ai-persona-builder/docs/agents/project-manifest/constraints.md`: the Comment whitespace note (L105), plus a new `### 16. A Literal NUL Character in Template Source Is Dropped`.
   - `ai-persona-builder/CHANGELOG.md`: a `v3.0.0 (proposed)` fix bullet.
7. **Write the v3.0.0 migration guide.** Create the new `ai-persona-builder/docs/migrating-to-v3.md`. Give each change a "What changed", "Who is affected" and "What to do" subsection:
   1. Error-severity results fail every build: `BuildSummary.success`, CLI exit 1 without `--strict`, `--strict` now meaning "also fail on warnings".
   2. Checks that newly emit errors:
      - an unknown sub-agent slug, now failing outside strict mode;
      - a sub-agent not built for the current target;
      - a missing dispatch grant;
      - a capability-parity mismatch, remedied with `tool_parity_exceptions`;
      - invalid `targets` index issues;
      - and the foreign-notation tool-name warning under `--strict`.
   3. `BuildSummary` gains the required `skipped`, `issues`, `errors` and `warnings`. This affects code that constructs `BuildSummary` values, for example test doubles. `strictFailures` is retained.
   4. Rendered whitespace changes:
      - blank lines around conditional blocks are preserved;
      - inline tags no longer insert line breaks;
      - adjacent removals merge.

      Advise a one-time diff of the rendered output.
   5. `{{!…}}` is now comment syntax. Audit templates for literal `{{!`, with the Known Limitation 15 workaround.
   6. A short "No action needed" list: native `{{else if}}` resolution (output-identical), and the additive exports.

   Then link the guide:
   - from a `Migration:` line at the top of the `CHANGELOG.md` `v3.0.0 (proposed)` entry;
   - from the `ai-persona-builder/README.md` Guides table;
   - from the `ai-persona-builder/docs/agents/project-manifest/file-tree.md` `docs/` listing, which is completed at the same time with `building-skills.md`, `dynamic-partials.md` and `target-differences.md`.

   Execute every code example in the guide against the built library before committing it, as WP-008 did.
8. **Create the shared freshness module.** Create the new `ai-insights/scripts/lib/mcp-dist-freshness.js` with `latestMtime`, `isMcpDistStale` and `ensureMcpDistFresh`, as specified in Approach §3. Create the new `ai-insights/scripts/tests/mcp-dist-freshness.test.js`, using temp directories with controlled mtimes and an injected `spawn` stub, so no real subprocess runs. In this step the suite covers the module's own behaviour only (the `latestMtime`, `isMcpDistStale` and `ensureMcpDistFresh` cases in the Test Plan). The caller-level source and message-preservation assertions cannot pass until the callers are migrated, so they land with step 9.
9. **Migrate the call sites.**
   - `ai-insights/scripts/lib/ledger-dirs.js`: replace the private `latestMtime`/`ensureMcpDistFresh` with the shared module (`requiredFile` = `dist/storage/ledger-store.js`). Print the existing `[ledger-dirs] …` stale line from `onBuildStart`, and map `build-failed` and `missing-module` to the existing lines and exits.
   - `ai-insights/scripts/import-standalone.js`: the same, with `requiredFile` = `dist/tools/standalone-import.js`. Keep its own texts, including the unprefixed `Error: compiled tool not found at …` line.
   - `ai-insights/scripts/run-orchestrator.js`: use `ensureMcpDistFresh` with no `requiredFile`. Keep the stale line (from `onBuildStart`), the "up to date — skipping build" line, and the silent `process.exit(status ?? 1)` on `build-failed`.
   - `ai-insights/scripts/cli.js` `cmdOrchestratorTests`: use `isMcpDistStale` and delete the private `latestMtime`.
   - `ai-insights/scripts/lib/health-checks.js`: import the shared `latestMtime` and delete the private copy (`latestMtimeFlat` stays).
   - Extend `ai-insights/scripts/tests/mcp-dist-freshness.test.js` with the caller-level assertions from the Test Plan: the word-boundary source assertion (`/function latestMtime\s*\(/`, so `health-checks.js`'s retained `latestMtimeFlat` does not match), the import assertion, and the message-preservation assertions.
10. **Update the scripts documentation.**
    - `ai-insights/AGENTS.md` Root-Level Tooling:
      - a new `scripts/lib/mcp-dist-freshness.js` row (exports, consumers, the "returns results, never prints or exits" contract, and why `preflight-bootstrap.js` is excluded);
      - in the `scripts/lib/ledger-dirs.js` and `scripts/run-orchestrator.js` rows, replace "same freshness guard as…" with a reference to the module.
    - `ai-insights/scripts/tests/README.md`: replace the "Current subprocess-spawning suites" list with the `grep -l SUBPROCESS_TEST_TIMEOUT_MS scripts/tests` pointer, and note that suites injecting a `spawn` stub do not qualify for the constant.
11. **Extract the name-mapping generator.** Create the new `ai-insights/scripts/lib/name-mapping.js` (Approach §4) and call it from `ai-insights/scripts/build-personas.js` in place of L102–L384. Create the new `ai-insights/scripts/tests/name-mapping.test.js`, with a temp-dir fixture:
    - a ledger meta directory with `_shared.yaml` and two numbered personas;
    - a standalone meta directory with a suite `_shared.yaml`;
    - and a minimal `model-registry`.

    Then run a real build and assert that `ai-insights/personas/name-mapping.json` is byte-identical to the step-2 baseline copy. Add a `ai-insights/AGENTS.md` Root-Level Tooling row for the module, and update the `scripts/build-personas.js` row.
12. **Make the philosophy-tone check comment-aware.** Implement Approach §4 in `ai-insights/scripts/lib/philosophy-tone.js`, including the JSDoc note on the bullet-inside-a-multi-line-comment edge, and pass `{ stripComments: stripCommentsFn }` from the `philosophy-tone` descriptor in `ai-insights/scripts/build-personas.js`. Extend `ai-insights/scripts/tests/philosophy-tone.test.js`, and update the `scripts/lib/philosophy-tone.js` row in `ai-insights/AGENTS.md`.
13. **Codify the workflow lessons in the personas** (Approach §5):
    - `ai-insights/personas/shared/partials/planner-core-rules.md`: a new `### Acceptance Oracles` subsection. It states the principle (early capture step, a location the run will not clean or overwrite, recorded in the plan) and the gitignore reason. It does not prescribe a storage path.
    - `ai-insights/personas/shared/partials/planner-quality-checklist.md`: one item.
    - `ai-insights/personas/ledger-support/src/content/ledger-wp-decomposer.md`: one constraint, next to L155–L156, naming the capture WP in the `**Notes:**` of every mutating WP so the Dependency Sequencer orders it first. The Sequencer persona itself is not edited (Approach §5).
    - `ai-insights/personas/ledger-support/src/content/ledger-pipeline-configurator.md`: a baseline-capture rule, cross-referenced from the verification-only prerequisite at L93.
    - `ai-insights/personas/standalone/src/content/plan-auditor.md`: a "Baseline oracles" consistency bullet after "Local dependencies", rated Major.
    - `ai-insights/personas/ledger/src/content/8-documentation.md`: an explicit `files_modified: []` in the artifacts rule (L54) and Workflow step 6.
    - `ai-insights/personas/ledger/src/content/6-reviewer.md`: "never omit the field" in L196.

    Add a dated `changelog` entry with a minor version bump to each affected YAML:
    - `ai-insights/personas/ledger/src/meta/{1-planner,6-reviewer,8-documentation}.yaml`;
    - `ai-insights/personas/standalone/src/meta/{planner,plan-auditor}.yaml`;
    - `ai-insights/personas/ledger-support/src/meta/{ledger-wp-decomposer,ledger-pipeline-configurator}.yaml`.

    New prose stays in the indicative mood inside any Operating Philosophy section.
14. **Update the personas changelog.** Regroup the `ai-insights/personas/changelog.md` `v3.39.0 - WIP, UNRELEASED` entry thematically, following Changelog Convention rule 8. Merge the related existing bullets (for example the four Planner / WP Decomposer / Plan Auditor / Developer release-and-symlink bullets, and the sub-agent-dispatch bullets) without losing any outcome. Then add at most three summary bullets:
    - baseline-capture guidance across the planning chain;
    - always-declared `files_modified`;
    - a build bullet for the comment-aware tone check and the extracted name mapping.

    The entry must end at ≤ 25 bullets and ≤ 60 lines.
15. **Run the final verification and regenerate the context.**
    - `ai-persona-builder`: `npm run typecheck`, `npm test`, `npm run build`.
    - `ai-insights`:
      - `npm test`, three consecutive runs;
      - `node scripts/build-personas.js --check`, which must report 0 errors and 0 warnings;
      - a real `node scripts/build-personas.js`;
      - a final `diff -r` of the nine rendered directories against the baseline, classified as in Approach §2. No file may be added or removed. Every changed file must be (a) in step 5's recorded list, (b) a rendered output of a persona edited in step 13, or (c) identical to its baseline once `vX.Y.Z` tokens are normalised on both sides. Record the files in each class in the pipeline notes. `personas/name-mapping.json` is not part of this check: it is expected to differ after step 13's bumps, and its oracle already ran in step 11.
      - `node scripts/cli.js ctx-generate`, to regenerate `ai-insights/.context/` (and with it `ai-insights/CLAUDE.md`).

## Dependencies

- Step 2 depends on step 1. Steps 3, 8, 11, 12 and 13 depend on step 2, so the baseline precedes every source mutation.
- Step 4 depends on step 3. Step 5 depends on steps 2–4. Step 6 depends on step 3.
- Step 7 depends on step 3, because the guide states the merged-adjacency behaviour.
- Step 9 depends on step 8. Step 10 depends on step 9.
- Step 12 depends on step 11 (both edit `ai-insights/scripts/build-personas.js`).
- Step 13 depends on steps 5 and 11, so both baseline oracles run against unchanged persona sources.
- Step 14 depends on steps 12 and 13.
- Step 15 depends on all earlier steps.

## Required Components

- `ai-persona-builder/src/engine/conditionals.ts` (modified)
- `ai-persona-builder/tests/engine/conditionals.test.ts` (modified)
- `ai-persona-builder/docs/migrating-to-v3.md` (**new**)
- `ai-persona-builder/docs/template-syntax.md`, `ai-persona-builder/README.md`, `ai-persona-builder/CHANGELOG.md` (modified)
- `ai-persona-builder/docs/agents/project-manifest/{api-surface,constraints,file-tree}.md` (modified)
- `ai-insights/scripts/lib/mcp-dist-freshness.js` (**new**), `ai-insights/scripts/tests/mcp-dist-freshness.test.js` (**new**)
- `ai-insights/scripts/lib/name-mapping.js` (**new**), `ai-insights/scripts/tests/name-mapping.test.js` (**new**)
- `ai-insights/scripts/lib/ledger-dirs.js`, `ai-insights/scripts/import-standalone.js`, `ai-insights/scripts/run-orchestrator.js`, `ai-insights/scripts/cli.js`, `ai-insights/scripts/lib/health-checks.js` (modified)
- `ai-insights/scripts/build-personas.js`, `ai-insights/scripts/lib/philosophy-tone.js`, `ai-insights/scripts/tests/philosophy-tone.test.js` (modified)
- `ai-insights/AGENTS.md`, `ai-insights/scripts/tests/README.md`, `ai-insights/.context/` (modified/regenerated)
- `ai-insights/personas/shared/partials/{planner-core-rules,planner-quality-checklist}.md` (modified)
- `ai-insights/personas/ledger-support/src/content/{ledger-wp-decomposer,ledger-pipeline-configurator}.md` and their `meta/*.yaml` (modified)
- `ai-insights/personas/standalone/src/content/plan-auditor.md`, `ai-insights/personas/standalone/src/meta/{planner,plan-auditor}.yaml` (modified)
- `ai-insights/personas/ledger/src/content/{6-reviewer,8-documentation}.md`, `ai-insights/personas/ledger/src/meta/{1-planner,6-reviewer,8-documentation}.yaml` (modified)
- `ai-insights/personas/changelog.md` (modified); `ai-insights/personas/name-mapping.json` and `ai-insights/personas/package.json` (regenerated by the build)
- `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/` (**new**, outside both repositories)

## Assumptions

- The `ai-insights` → `ai-persona-builder` symlink exists (verified 2026-10-01). Step 1 only confirms it.
- `ai-insights/mcp-server/dist/` builds with `npm run build`. No step depends on its contents beyond the existing `store-commands.test.js` path.
- The unrelated uncommitted `.context/` changes in `ai-insights` remain. No criterion depends on a clean working tree; each is relative to this plan's own changes (insight `b2797900`).
- The ledger's WP-010 duplicate criterion was already cleaned up (4 criteria observed on 2026-10-01).

## Constraints

- `ai-persona-builder/src/engine/conditionals.ts` keeps zero imports and its exported signatures.
- `ai-insights/scripts/build-personas.js` keeps exactly one `process.exit(` call.
- `ensureMcpDistFresh()` never calls `process.exit` and never writes to the console.
- No library release, tag, `package.json` version change, or symlink revert happens inside the run.
- `personas/changelog.md` stays summary-only, at ≤ 25 bullets and ≤ 60 lines in its newest entry.

## Out of Scope

- Changing `collapseBlankLines()` or `ensureBlankLineBeforeHeadings()`.
- The planned `onPreRender` hook (`constraints.md` §5). It is a feature unrelated to the synthesis items.
- Migrating `ai-insights/scripts/preflight-bootstrap.js` (see Structural Improvements).
- Behaviour changes to `acceptance_criteria_updates` matching in `ai-insights/mcp-server/` (Deferred Item 2).
- Adding the `files_modified` empty-array instruction to QA or Security Auditor personas. Neither was reported, and the Security Auditor already declares audited files.

## Human Actions

| # | Action | When | Why an agent cannot do it |
|---|--------|------|---------------------------|
| 1 | Settle the final v3.0.0 version number. Reconcile the orphaned `v2.6.0` tag (`52f1e63`) with `main`. Bump `ai-persona-builder/package.json`, replace `(proposed)` in `CHANGELOG.md`, tag, and `npm publish` `@mistralys/persona-builder` | After the run | Needs git history decisions, npm credentials and the release decision, all reserved for the user |
| 2 | In `ai-insights`: bump the `@mistralys/persona-builder` range in `personas/package.json` (currently `^2.6.0`) to the released range, remove the dev symlink, reinstall (`cd ai-insights/personas && rm node_modules/@mistralys/persona-builder && npm install`), and rebuild personas (`node scripts/build-personas.js`) | After the run | Depends on action 1; the user reserved the dependency update and the symlink revert |
| 3 | Delete `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/` once the results are reviewed | After the run | Retained deliberately for human inspection of the oracle evidence |

## Acceptance Criteria

- AC-01: `resolveConditionals()` returns exactly the Approach §1 outputs for every conditional row, including the kept-block-between-empty-blocks row and the unchanged tight and inline rows.
- AC-02: `stripComments()` returns exactly the Approach §1 outputs for every comment row: adjacent comments tight and blank-separated, empty bodies, end-of-string, and the unchanged single-comment case.
- AC-03: Every pre-existing test in `ai-persona-builder/tests/engine/conditionals.test.ts` and `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` passes unchanged.
- AC-04: `ai-persona-builder/src/engine/conditionals.ts` has zero `import` statements, and the signatures of `resolveConditionals` and `stripComments` are unchanged.
- AC-05: The baseline folder `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/` contains the nine rendered directories, `name-mapping.json` and `MANIFEST.txt`. `MANIFEST.txt` records both HEAD commits, captured before any source change of this plan, and the rendered file count matches the live tree at capture time.
- AC-06: After the engine fix, `diff -r` between the baseline and the rebuilt nine directories shows:
  - no `Only in` lines;
  - no `>` lines;
  - only empty `<` lines;
  - identical frontmatter blocks.

  The statistics and the changed-file list are recorded.
- AC-07: `ai-persona-builder/docs/template-syntax.md`, the `api-surface.md` `resolveConditionals`/`stripComments` entries, and the `constraints.md` Comment whitespace note all describe adjacent-removal merging. `constraints.md` contains Known Limitation 16 (literal NUL), and `CHANGELOG.md` `v3.0.0 (proposed)` lists the fix.
- AC-08: `ai-persona-builder/docs/migrating-to-v3.md` exists and covers the five changes and the "No action needed" list in step 7, each with "What changed / Who is affected / What to do". Every code example in it was executed against the built library.
- AC-09: The migration guide is linked from the `CHANGELOG.md` `v3.0.0 (proposed)` entry and from the `README.md` Guides table. The `file-tree.md` `docs/` listing names every file in `ai-persona-builder/docs/` (excluding `agents/`).
- AC-10: In `ai-persona-builder`, `npm run typecheck`, `npm test` and `npm run build` pass.
- AC-11: `ai-insights/scripts/lib/mcp-dist-freshness.js` exports `latestMtime`, `isMcpDistStale` and `ensureMcpDistFresh` with the Approach §3 contract (optional `requiredFile`, `onBuildStart` hook, no `label`/`log`/`error` options). It contains no `process.exit` and no `console.` call.
- AC-12: None of `ai-insights/scripts/lib/ledger-dirs.js`, `scripts/import-standalone.js`, `scripts/run-orchestrator.js`, `scripts/cli.js` or `scripts/lib/health-checks.js` defines its own `latestMtime`. Each consumes the shared module. Each caller's user-visible messages and exit codes on the stale, fresh, build-failed and missing-module paths are unchanged, including `run-orchestrator.js`'s silent build failure and `import-standalone.js`'s unprefixed missing-module line. The one permitted change: a missing or unreadable `mcp-server/src/` reads as "not newer" instead of throwing (Approach §3).
- AC-13: The `ai-insights/AGENTS.md` Root-Level Tooling table has rows for `scripts/lib/mcp-dist-freshness.js` and `scripts/lib/name-mapping.js`, and the `ledger-dirs.js`, `run-orchestrator.js`, `build-personas.js` and `philosophy-tone.js` rows are current. `ai-insights/scripts/tests/README.md` carries the grep pointer in place of the suite list.
- AC-14: `ai-insights/scripts/lib/name-mapping.js` exists with the Approach §4 exports, and `build-personas.js` no longer contains the inline generator. After a real build on unchanged persona sources, `ai-insights/personas/name-mapping.json` is byte-identical to the baseline copy.
- AC-15: `checkPhilosophyTone()` ignores imperative prose inside a template comment within a principle's title or body when it is given `stripComments`, and still reports raw-file line numbers. A bullet inside a multi-line comment is pinned by a characterization test and documented in the JSDoc. `checkPhilosophyToneInDirs()` forwards the option, and the build descriptor passes the library's `stripComments`.
- AC-16: The baseline-capture rule is present in:
  - `planner-core-rules.md` (`### Acceptance Oracles`) and `planner-quality-checklist.md`, stated as a principle with no prescribed storage path (no "outside every repository" wording);
  - `ledger-wp-decomposer.md` (capture WP named in `**Notes:**`) and `ledger-pipeline-configurator.md` (a `["implementation", "qa"]` chain, cross-referenced from the verification-only prerequisite);
  - `plan-auditor.md` (Major finding).

  It is rendered into every target of the ledger Planner, standalone Planner, WP Decomposer, Pipeline Configurator and Plan Auditor. `ledger-dependency-sequencer.md` is unchanged.
- AC-17: `8-documentation.md` instructs an explicit `files_modified: []` when nothing was modified, and `6-reviewer.md` states the field is never omitted.
- AC-18: Each of the seven affected persona YAML files carries a new dated changelog entry with a version bump. The `personas/changelog.md` `v3.39.0` entry has ≤ 25 bullets and ≤ 60 lines and summarises this plan's persona and build changes.
- AC-19: In `ai-insights`:
  - `npm test` passes three consecutive runs;
  - `node scripts/build-personas.js --check` exits 0 with 0 errors and 0 warnings;
  - a real build exits 0;
  - the final baseline diff of the nine rendered directories shows no added or removed files, and every changed file is (a) in the step-5 list, (b) a rendered output of a persona edited in step 13, or (c) a version-stamp-only change: identical to its baseline once every `vX.Y.Z` token is normalised on both sides (Approach §2). `>` lines are permitted in classes (b) and (c);
  - `ai-insights/.context/` is regenerated.

## Testing Strategy

- **Engine unit tests.** They pin the cluster contract with exact strings, including the over-merge guard (a kept block between empty blocks), so a future "simplification" cannot silently merge across content.
- **The consumer diff against a pre-captured baseline.** It is the end-to-end oracle for the engine change. Here it checks for *removed* blank lines only, the mirror image of the previous cycle's added-only check.
- **Freshness module tests.** They use injected `spawn` and `platform` and temp directories with set mtimes (`fs.utimesSync`). Every branch, including Windows, is exercised without a subprocess, so the suite stays a fast unit suite and does not take `SUBPROCESS_TEST_TIMEOUT_MS`.
- **Name-mapping.** A fixture test covers the extracted module, and the byte-identical baseline comparison serves as the refactor oracle.
- **Persona guidance.** It is verified by the build (render and lint checks), by rendered-output inspection in QA, and by the final classified diff, which admits the edited personas' outputs and version-stamp-only changes elsewhere.

## Test Plan

- `ai-persona-builder/tests/engine/conditionals.test.ts` → `describe('adjacent removals')`:
  - "two adjacent empty blocks between paragraphs leave one paragraph break" (tight and blank-separated);
  - "three adjacent empty blocks";
  - "adjacent empty blocks in tight source stay tight";
  - "a kept block between two empty blocks is not merged across" (`A\n\nK\n\nB`);
  - "adjacent inline removals leave the line as before" (`x  w`)

  — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` → `describe('stripComments()')`:
  - "adjacent standalone comments with no blank line between them merge";
  - "adjacent standalone comments separated by a blank line merge";
  - "empty long-form and short-form comment bodies";
  - "standalone comment at end of string without trailing newline";
  - "a single standalone comment between paragraphs is unchanged"

  — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — "Known Limitation 16: a literal NUL in source is dropped" (characterization) — AC-07
- `ai-persona-builder/tests/engine/conditionals.test.ts` and `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — the existing suites, unchanged and passing — AC-03
- `ai-persona-builder/tests/engine/conditionals.test.ts` — the existing "has no import statements in the module source" test (L492) still passes — AC-04
- `ai-persona-builder` `npm run typecheck`, `npm test`, `npm run build` (step 15) — AC-10
- Baseline folder inspection: contents, `MANIFEST.txt` commits recorded before step 3's first commit or edit, matching file count (QA, step 2) — AC-05
- Strict `diff -r` baseline vs post-fix (step 5): no `Only in`, no `>`, only empty `<`, frontmatter extracted and diffed per changed file — AC-06
- Documentation review of `template-syntax.md`, `api-surface.md`, `constraints.md` (Comment whitespace note and §16) and `CHANGELOG.md` — AC-07
- Migration guide review: section coverage against step 7; each code example executed against `ai-persona-builder/dist/` via `node`/`tsx`; link checks from `CHANGELOG.md`, `README.md` and `file-tree.md`; the `file-tree.md` `docs/` listing compared with `ls ai-persona-builder/docs` — AC-08, AC-09
- `ai-insights/scripts/tests/mcp-dist-freshness.test.js` (**new**):
  - `latestMtime` returns the newest nested file mtime, and `-Infinity` for a missing or unreadable directory;
  - `isMcpDistStale` is true for a missing sentinel and for a newer source file, and false when the sentinel is newest;
  - `ensureMcpDistFresh`:
    - fresh → no `spawn` call, `onBuildStart` not called, `{ ok: true, rebuilt: false }`;
    - stale → `onBuildStart` called exactly once before `spawn('npm', ['run','build'], { cwd, stdio: 'inherit', shell: false })`, and `{ ok: true, rebuilt: true }`;
    - `platform: 'win32'` → `npm.cmd` with `shell: true`;
    - spawn status 2 → `{ ok: false, reason: 'build-failed', status: 2 }`;
    - `requiredFile` given but absent → `{ ok: false, reason: 'missing-module', file }` with the absolute path;
    - `requiredFile` omitted → no missing-module check, `{ ok: true, … }`;
    - no path writes to the console (spied `console.log`/`console.error` not called);
  - a source assertion that the module contains no `process.exit` and no `console.`

  — AC-11
- `ai-insights/scripts/tests/store-commands.test.js` — existing; still passes, exercising `ledger-dirs.js` through the shared module — AC-12
- Source assertions, in `ai-insights/scripts/tests/mcp-dist-freshness.test.js` (added in step 9): none of the five migrated files matches `/function latestMtime\s*\(/` (a word-boundary match, so `health-checks.js`'s retained `latestMtimeFlat` does not false-fail), and each imports `./lib/mcp-dist-freshness.js` or `./mcp-dist-freshness.js` — AC-12
- Message-preservation source assertions, in the same file (added in step 9). Each caller still contains its exact pre-migration message strings (brief, "Added References"):
  - `ledger-dirs.js`: `[ledger-dirs] MCP server build failed.` and `[ledger-dirs] Error: compiled module not found at`;
  - `import-standalone.js`: `[import-standalone.js] MCP server build failed.` and `Error: compiled tool not found at`;
  - `run-orchestrator.js`: the stale and "up to date — skipping build" lines, and no "build failed" line;
  - `cli.js`: `MCP server dist is stale — rebuilding…` and `✗ MCP server build failed`

  — AC-12
- `ai-insights/scripts/tests/health-checks.test.js` — existing; `mcp-dist-fresh` behaviour unchanged — AC-12
- Manual smoke test (QA): `node scripts/import-standalone.js --dry-run --batch` and `node scripts/backfill-duration.js --dry-run` both run against a fresh dist without triggering a rebuild, and their output is recorded in the pipeline notes. `run-orchestrator.js` is covered by source review and the source assertion only, since running it launches the orchestrator — AC-12
- Documentation review of the `ai-insights/AGENTS.md` rows and `scripts/tests/README.md` — AC-13
- `ai-insights/scripts/tests/name-mapping.test.js` (**new**):
  - ledger entries are ordered by number, with `agent_name` `"{n} - {role} v{version}"`;
  - the version is taken from the changelog first line (with and without date), falling back to `default_version`;
  - non-ledger entries are sorted by suite then role, with `deriveRole` stripping `(Standalone)` / `(Ledger Support)`;
  - files without `id` or `cc_file_name` are skipped;
  - `validateChangelogField` sends the "no parseable version", "first entry has no date" and "two different dates" messages to the injected `warn`, and the coexisting `version` message to `info`;
  - `writeNameMapping` output ends with `\n` and is two-space indented

  — AC-14
- `ai-insights/scripts/tests/build-checks.test.js` — existing "exactly one `process.exit(`" assertion still passes — AC-14
- Byte comparison: `cmp ai-insights/personas/name-mapping.json DEV/.baselines/…/name-mapping.json` after step 11's real build — AC-14
- `ai-insights/scripts/tests/philosophy-tone.test.js`:
  - "imperative sentence inside a `{{!-- … --}}` comment in a principle body is not flagged when `stripComments` is injected";
  - "the same text is flagged with the identity default";
  - "a principle whose title is only a comment is skipped";
  - "reported line numbers are raw-file lines when a multi-line comment precedes the principle";
  - "Known edge: a principle bullet inside a multi-line comment is still checked" (characterization, matching the JSDoc note);
  - "`checkPhilosophyToneInDirs` forwards `stripComments`"

  — AC-15
- Source assertion in `ai-insights/scripts/tests/philosophy-tone.test.js`: the `philosophy-tone` descriptor in `ai-insights/scripts/build-personas.js` passes `stripComments: stripCommentsFn` — AC-15
- Rendered-output inspection (QA): `grep` for the new rule text in every target of the five affected personas' outputs (ledger Planner, standalone Planner, WP Decomposer, Pipeline Configurator, Plan Auditor); `grep` confirms the rendered Planners do not contain "outside every repository"; `git diff --stat` shows `ledger-dependency-sequencer.md` unchanged — AC-16
- Rendered-output inspection (QA): `grep` for `files_modified: []` in the rendered Documentation persona targets, and for the never-omit wording in the rendered Reviewer targets — AC-17
- Review of the seven YAML changelog entries. `node scripts/build-personas.js --check` reports no oversized-changelog warning — AC-18
- `ai-insights` `npm test` ×3, `--check`, real build, and `ctx-generate` (step 15) — AC-19
- Final classified baseline diff (step 15): no `Only in` lines; each changed file assigned to class (a) step-5 list, (b) step-13 persona output, or (c) version-stamp-only, where (c) is confirmed by diffing both sides after `sed -E 's/v[0-9]+\.[0-9]+\.[0-9]+/vX.Y.Z/g'` and getting no difference; any unclassified file fails the check — AC-19

## Documentation Updates

- `ai-persona-builder/docs/template-syntax.md` — adjacency examples in "Whitespace Rules" and "Whitespace and Line Handling".
- `ai-persona-builder/docs/migrating-to-v3.md` — **new** migration guide.
- `ai-persona-builder/docs/agents/project-manifest/api-surface.md` — `resolveConditionals` and `stripComments` entries (Maintenance Rules: modify engine function).
- `ai-persona-builder/docs/agents/project-manifest/constraints.md` — Comment whitespace note; new Known Limitation 16; zero-dependency invariant re-verified (Maintenance Rules: modify engine function, discover new limitation).
- `ai-persona-builder/docs/agents/project-manifest/file-tree.md` — `docs/` listing completed, with the migration guide added (Maintenance Rules: add new file).
- `ai-persona-builder/README.md` — Guides table row for the migration guide.
- `ai-persona-builder/CHANGELOG.md` — `Migration:` pointer line and a fix bullet in `v3.0.0 (proposed)`.
- `ai-persona-builder/src/engine/conditionals.ts` — `mergeMarkers`, `resolveConditionals` and `stripComments` JSDoc.
- `ai-insights/AGENTS.md` — Root-Level Tooling rows for the two new modules, and updated rows for `ledger-dirs.js`, `run-orchestrator.js`, `build-personas.js` and `philosophy-tone.js`.
- `ai-insights/scripts/tests/README.md` — grep pointer in place of the suite list; note on injected-spawn suites.
- `ai-insights/personas/changelog.md` — `v3.39.0` WIP entry regrouped, with up to three new summary bullets.
- The seven persona YAML `changelog` fields listed in step 13.
- `ai-insights/.context/` and `ai-insights/CLAUDE.md` — regenerated via `node scripts/cli.js ctx-generate`.

## Deferred Items

| # | Deferred Item | Origin | Reason Deferred | Notes |
|---|---------------|--------|-----------------|-------|
| 1 | An escape form for emitting a literal `{{!` | Prior plan → Out of Scope; `constraints.md` Known Limitation 15 | No consumer needs it, and the migration guide documents the existing workaround | Reconsider when a template needs to show comment syntax literally |
| 2 | Make `acceptance_criteria_updates` reject or warn on a criterion text that matches no existing entry, instead of appending a duplicate | Synthesis → Deferred (WP-010 PM action); insight `5aac16d9` | Lives in `ai-insights/mcp-server/`, outside this plan's blast radius; the reported artefact is already cleaned up | Candidate for the next plan that touches `ledger_complete_pipeline` |
| 3 | `package.json` version bump for v3.0.0 | Synthesis → Deferred (WP-006 Release Engineer) | Reserved for the maintainer by `CHANGELOG.md` policy | Carried as Human Action 1 |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **The cluster merge over-merges across kept content** | The kept-block-between-empty-blocks test (`A\n\nK\n\nB`) and the strict consumer diff (only removed blank lines, no content lines) |
| **The baseline gets captured after a mutation** | Step 2 has no dependencies, every mutating step depends on it, and `MANIFEST.txt` records both HEAD commits for QA to check against the first change |
| **Persona edits contaminate the oracles** | Steps 5 and 11 both precede step 13, so the two strict oracles run on unchanged persona sources. Step 13's version bumps also propagate, through `{{agent_*}}` name variables, into personas it does not edit (for example `plan-refiner.md`). The final diff therefore admits those files only as version-stamp-only changes, checked by `vX.Y.Z` normalisation, so any other change in an unedited persona still fails. |
| **The freshness refactor changes CLI behaviour** (messages, exit codes, Windows spawn) | The module neither prints nor exits, so each caller keeps its own texts and exits. Source assertions pin every caller's message strings, unit tests pin the `win32` branch, and QA smoke-runs `import-standalone.js` and `backfill-duration.js` in dry-run mode. The only intended change, the tolerant `latestMtime`, is named in AC-12. |
| **The name-mapping move alters output bytes** | Verbatim move, plus a byte-identical `cmp` against the baseline before any YAML changes |
| **The changelog size check warns after the new bullets** | Step 14 regroups first, and AC-18/AC-19 require 0 warnings |
| **The migration guide misstates behaviour** | Every example is executed against `dist/` before commit (the WP-008 practice), and the guide is reviewed against the `git diff v2.6.0 HEAD -- src` facts in the brief |
| **A stale library `dist/` makes the wrapper test old code** | Steps 2, 5 and 15 run `npm run build` in `ai-persona-builder` before every consumer build |

## Recommended Workflow
- **Workflow:** ledger
- **Rationale:** The plan spans two repositories and four distinct concerns (engine fix, release documentation, script refactors, persona workflow guidance) with ordered baseline oracles. That benefits from separate WPs, formal QA and code review.
