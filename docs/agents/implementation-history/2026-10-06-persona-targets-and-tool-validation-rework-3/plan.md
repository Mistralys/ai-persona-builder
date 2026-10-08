# Plan

## Plan Audit Cycles
- Audits: 1 (Sonnet 5.5 ×1) — Plan Auditor v1.11.0
- Architectural Reviews: 1 (Sonnet 5.5 ×1) — Plan Architect Reviewer v2.3.4

## Prior Project Context

- **Origin.** This is the third rework of `2026-09-30-persona-targets-and-tool-validation`. It addresses the actionable items in `ai-persona-builder/docs/agents/plans/2026-10-01-persona-targets-and-tool-validation-rework-2/synthesis.md`. Following the user's standing preference, it also triages that cycle's `plan.md` Out of Scope, Deferred Items and rejected Structural Improvements rows. Every item was re-verified on 2026-10-01 before being carried.
- **Strategic vision.** `ledger_get_repository_context` declares no vision for `ai-persona-builder`. The plan follows the synthesis' own recommendations:
  - fix the shared routine, not its callers;
  - capture a baseline before mutation, as its own step;
  - prefer persona rules where the server cannot tell the difference, but fix the server where it *can* tell;
  - verify extractions with a byte-identical oracle;
  - document hard ceilings rather than engineer around them.
- **Triage of the synthesis' Deferred & Follow-Up Items.**

  | Synthesis item | Disposition |
  |---|---|
  | CRLF line endings in the conditionals engine | Promoted (steps 3–6). Re-verification found the defect wider than reported: under CRLF, `computeLinePlacement()` classifies every tag as inline, so every standalone tag line leaves an empty line. In the build, CRLF partials and frontmatter templates are affected; the body is already normalised. |
  | Changelog line-length enforcement gap | Promoted (step 7) |
  | `personas/changelog.md` v3.39.0 size trend | Promoted (step 12) as release prep: one consolidation pass, now also held to the new line-length check |
  | Uncommitted working-tree state predating the plan | Human Action 1 (`Before the run`). Step 2 records the tree state either way, so the run does not depend on it. |
  | `files_modified` traceability | Promoted (steps 8–11). Re-verification found that the rework-2 persona fix cannot work on its own: the server's step 3b warns on `files_modified: []` exactly as on an absent field (`ai-insights/mcp-server/src/tools/pipeline.ts` L503–L504). The server now tells the two apart. |
  | Monitor adoption of the WP-008/WP-009 persona rules | Human Action 6 (`After the run`). This run is driven by the stable workspace's personas, so adoption can only be observed after the DEV personas are deployed. |
  | `package.json` bump at v3.0.0 publish time | Human Action 3 (`After the run`) |

- **The prior plan's own Out of Scope, Deferred and rejected rows.**
  - Deferred Item 2, `acceptance_criteria_updates` silently appending unmatched text: **promoted** (steps 8–11). Steps 8–11 already edit `completePipeline()`, so step 4 of that function is now inside the blast radius. Insight `ccc4b889` rules out relaxing the exact match, so the fix keeps the append and makes it visible.
  - Out of Scope, `files_modified` guidance for the QA / Security Auditor personas: **closed without action**. The server exempts `qa` and `security-audit` from the declaration check, and `5-security-auditor.md` L207 already declares audited files.
  - Deferred Item 1, a literal `{{!` escape form: **kept deferred**. There is still no consumer: no persona source needs to emit `{{!`, and the only comment uses in `ai-insights` are real comments.
  - Deferred Item 3 / Human Action 1 (version bump, publish): carried as Human Actions 3–4.
  - Rejected rows that are still valid and untouched by this plan: `preflight-bootstrap.js` staying self-contained, the `import-standalone.js` double guard, `collapseBlankLines()`, and the `onPreRender` hook. They are not re-listed.
- **Reused insights.**
  - `e41ef85e`: the zero-import engine (AC-03).
  - `7d13934f`: a validation ceiling. CRLF is *not* malformed content, unlike a literal NUL: every Windows checkout with `core.autocrlf=true` produces it, and `ai-insights/menu.cmd` shows the workspace supports Windows. It is therefore fixed, not documented.
  - `5aac16d9` and `ccc4b889`: keep exact matching, surface the miss.
  - `2cd87f16`: pure predicates are extracted and tested on synthetic input (step 9).
  - `b2797900`: criteria are relative to this plan's own changes.
  - `5ceb852c` and `cdaf1471`: the baseline WP keeps an authoring stage.

## Knowledge Base Reconciliation

| Insight ID | Title | What the plan overtakes | Executed by |
|------------|-------|-------------------------|-------------|
| 5aac16d9-c600-4e78-848e-4e0f694c8f23 | Exact-text-match update calls silently duplicate entries on typographic mismatches (em dash vs hyphen) | "The call reports success, giving no signal that the match failed": after step 9, `ledger_complete_pipeline` returns `appended_criteria`, a response note and a project-comment warning for every unmatched criterion. The verbatim-copy advice still holds. | Ledger Knowledge Curator v1.4.1 (Targeted Reconciliation) |
| ccc4b889-597a-4b0a-b912-d04c12bcf635 | Fix agent behavior with verbatim-copy guidance rather than relaxing intentional tool strictness | "the strict exact-match silently appended unmatched items as phantom duplicate criteria": the match stays strict, but the append is no longer silent (step 9). The principle itself is unchanged and was applied here. | Ledger Knowledge Curator v1.4.1 (Targeted Reconciliation) |

## Summary

This rework closes the actionable items of the `2026-10-01-persona-targets-and-tool-validation-rework-2` synthesis across `ai-persona-builder` and `ai-insights`. It also takes in the prior cycle's deferred items that now fall inside the blast radius.

In the library:
- `resolveConditionals()` and `stripComments()` normalise line endings to LF on entry, so CRLF templates (partials, frontmatter templates and direct API input) render exactly like their LF twins;
- the behaviour is documented, release-prepared in `CHANGELOG.md` and added to the v3.0.0 migration guide.

In `ai-insights`:
- the personas changelog check gains the ≤ 100-character line rule from house style;
- the ledger MCP server learns two things:
  - an explicit `files_modified: []` is a valid declaration for review and documentation passes, which makes rework-2's persona rule effective;
  - an `acceptance_criteria_updates` entry that matches no criterion is still appended, but now produces a visible signal;
- the personas changelog gets its release-prep consolidation pass.

As the planning chain now requires, a baseline captured before any change proves the rendered personas stay byte-identical.

## Architectural Context

- **Engine (`ai-persona-builder/src/engine/conditionals.ts`).**
  - A single `TAG_PATTERN` tokenizer feeds `resolveConditionals()` (L386–L398) and `stripComments()` (L443–L457).
  - `computeLinePlacement()` (L97–L119) decides "standalone" from `\n`-delimited lines.
  - `mergeMarkers()` (L320–L331) merges `\n` runs around `'\0'` markers.
  - Both entry points return the input untouched when no tag is found.
  - The module has zero imports. `normalizeNewlines()` lives in the sibling `src/engine/postProcessor.ts` (L54–L56), and the invariant forbids importing it.
- **Builder (`ai-persona-builder/src/builders/`).**
  - `persona-builder.ts` normalises the body template before `stripComments()` (L495) and the assembled output (L506).
  - Partials (L478–L481) and the frontmatter template (`frontmatter.ts` L106–L115) reach `stripComments()` un-normalised.
- **Library docs.**
  - `docs/template-syntax.md` holds the user rules; `docs/api.md` is the API overview.
  - `docs/agents/project-manifest/{api-surface,constraints}.md` hold the agent contract.
  - `CHANGELOG.md` carries `v3.0.0 (proposed)`, and `docs/migrating-to-v3.md` is its migration guide.
- **`ai-insights` build lint.** `scripts/lib/changelog-size-check.js` inspects only the newest `personas/changelog.md` entry and returns warning strings. `scripts/build-personas.js` runs it as the `changelog-size` descriptor with `severity: 'warn'`.
- **Ledger MCP server (`ai-insights/mcp-server/`).**
  - `completePipeline()` in `src/tools/pipeline.ts` runs a soft artifacts check (step 3b, L497–L518), gated by `ARTIFACT_EXPECTED_PIPELINE_TYPES` (`src/utils/pipeline-maps.ts` L317–L328).
  - It then applies criteria updates by exact match with a silent append (step 4, L537–L550), and builds the response by concatenating `guidance + artifactsWarning` (L644).
  - `PipelineType` comes from `shared/workflow-manifest.json`. Exhaustive `Record<PipelineType, …>` maps are the house pattern.
  - Workflow changes follow the order: workflow spec, then code, then tests, then `constraints-workflow.md` (`ai-insights/AGENTS.md` Root-Level / Cross-Project rules).
- **Cross-repo link.** `ai-insights/personas/node_modules/@mistralys/persona-builder` is a symlink to `ai-persona-builder`. The wrapper runs the library's built `dist/cli.js`. The run itself is coordinated by the separate stable workspace's ledger, so DEV server changes cannot disturb it.

## Approach / Architecture

### 1. Line-ending normalisation at the engine entry points (library)

A new module-private helper in `conditionals.ts`:

```ts
/** CRLF and lone CR → LF. Mirrors postProcessor.ts normalizeNewlines(), which the zero-import invariant forbids importing. */
function toLf(text: string): string { return text.replace(/\r\n?/g, '\n'); }
```

It is the **first statement** of both `resolveConditionals()` and `stripComments()`, *before* the no-tag fast path. The contract is therefore unconditional: both functions always return LF line endings. Every later stage (tokenizer, `computeLinePlacement()`, `mergeMarkers()`) keeps its LF-only logic unchanged.

Because the builder already calls `stripComments()` at all three template-ingestion points, the fix covers CRLF partials and frontmatter templates with no builder change. Wrapper code in `ai-insights` that calls the library's `stripComments` directly is covered too (`agent-slug-validation.js`, `philosophy-tone.js`).

Required outputs (`ra` = `resolveConditionals`, `sc` = `stripComments`; verified against current `dist/` after normalisation, see brief):

| Input | Fn | Output |
|---|---|---|
| `A\r\n{{!-- c --}}\r\nB` | sc | `A\nB` |
| `A\r\n\r\n{{!-- c --}}\r\n\r\nB` | sc | `A\n\nB` |
| `A\r{{!-- c --}}\rB` (lone CR) | sc | `A\nB` |
| `A\r\n{{#if x}}\r\ny\r\n{{/if}}\r\nB`, `{}` | ra | `A\nB` |
| same, `{ x: true }` | ra | `A\ny\nB` |
| `A\r\n\r\n{{#if x}}\r\ny\r\n{{/if}}\r\n\r\nB`, `{}` | ra | `A\n\nB` |
| two adjacent empty blocks, CRLF, blank-separated from `A`/`B` | ra | `A\n\nB` |
| `x {{#if a}}y{{/if}} w\r\nz`, `{}` | ra | `x  w\nz` |
| `A\r\nB` (no tags) | ra, sc | `A\nB` |

### 2. Baseline-first consumer verification

Step 2 captures the nine rendered output directories and `personas/name-mapping.json` into `DEV/.baselines/2026-10-06-persona-targets-and-tool-validation-rework-3/`, before any source change. `DEV/` is not a git repository, so the snapshot sits outside both repositories.

No persona source contains `\r` and this plan edits no persona source or YAML, so the oracle is **strict**: after the engine fix, and again at the end, `diff -r` against the baseline is empty and `name-mapping.json` is byte-identical (`cmp`). There is no classification step, because there are no version-stamp bumps this time.

### 3. Changelog line-length check (`ai-insights`)

`changelog-size-check.js` gains `MAX_LINE_LENGTH = 100` and a fourth `options` override, `maxLineLength`. `checkChangelogEntrySize()` measures every line of the newest entry, heading included, after replacing each Markdown link `[label](target)` with `label`. That follows `changelog-curator.md` L83: "Markdown links are excluded from this count". Length is counted in code points (`[...line].length`), so `—` and `·` count as one. Each over-length line produces one warning naming its own line number:

`personas/changelog.md:{line}: changelog line is {n} characters, exceeding the 100-character house style. Wrap it.`

The check stays a warning, and only the newest entry is ever inspected.

### 4. Artifact declaration policy (ledger MCP server)

`pipeline-maps.ts` replaces the `ARTIFACT_EXPECTED_PIPELINE_TYPES` set with an exhaustive policy map, plus a pure evaluator:

```ts
export type ArtifactDeclarationPolicy = 'exempt' | 'declare' | 'non-empty';
export const ARTIFACT_DECLARATION_POLICY: Readonly<Record<PipelineType, ArtifactDeclarationPolicy>> = {
  implementation: 'non-empty',     // a PASS that modified nothing is almost certainly a missed declaration
  qa: 'exempt',
  'security-audit': 'exempt',
  'code-review': 'declare',        // [] = "reviewed, changed nothing" (Reviewer persona L196)
  'release-engineering': 'declare',// [] = "nothing release-relevant"
  documentation: 'declare',        // [] = "gap analysis found nothing" (Documentation persona L54)
};
export type ArtifactDeclarationOutcome = 'ok' | 'undeclared' | 'empty';
export function evaluateArtifactDeclaration(policy: ArtifactDeclarationPolicy, filesModified: string[] | undefined): ArtifactDeclarationOutcome;
```

Evaluation:
- `exempt` → always `ok`;
- `declare` → `undeclared` if absent, otherwise `ok` (including `[]`);
- `non-empty` → `undeclared` if absent, `empty` if `[]`, otherwise `ok`.

In `completePipeline()` step 3b, any outcome other than `ok`, on a PASS by a non-PM agent, still produces the existing project comment and response note. The note keeps the existing substring `artifacts.files_modified is empty or absent`. For `declare` types it adds: "Pass an explicit empty array when this pass modified nothing."

### 5. Visible unmatched criteria (ledger MCP server)

In step 4, exact matching and the append are unchanged. Every unmatched `criterion` text is collected. When at least one exists:
- the response payload gains `appended_criteria: string[]`, for every caller including the PM;
- a response note says the entries matched no existing criterion and were appended, and that criterion text should be copied verbatim from `ledger_get_work_package` to update an existing one;
- for non-PM callers, a single `{ type: 'warning', priority: 'low' }` project comment names the WP and quotes each appended text.

The response's free-text notes move into one `notes: string[]` accumulator that is joined after `guidance`. This replaces `artifactsWarning`. Notes are pushed in a fixed order (artifacts note first, then the criteria note), so tests can assert exact response text.

## Rationale

- **Normalise at the entry, not inside every regex.** The defect sits in two LF-only primitives (`computeLinePlacement()` and `mergeMarkers()`). Teaching both about `\r\n` would branch every regex and raise the question of which ending to emit for mixed input. Normalising once at the two public entry points keeps "one whitespace contract, one implementation" and leaves the proven LF logic untouched. That applies the synthesis' "fix the shared routine" lesson.
- **The engine, not the builder.** Normalising only at the builder's three ingestion points would leave direct API callers broken, including `ai-insights`' own wrapper checks. The engine is the one place every caller passes through.
- **CRLF is fixed, while NUL is documented.** A NUL byte is malformed content nobody writes (insight `7d13934f`). CRLF is what Windows git checkouts produce by default, so it is a real input.
- **A policy map, not a second set.** The question "is `[]` acceptable?" differs by stage. A `Record<PipelineType, …>` forces a decision for every pipeline type, now and whenever the manifest adds one, and the pure evaluator makes each cell testable without a ledger fixture.
- **Signal, not relaxation, for criteria.** Insight `ccc4b889` keeps exact matching. Insight `5aac16d9` names the actual harm: no signal. A structured `appended_criteria` field gives agents something machine-readable, and the project comment gives the PM and synthesis an audit trail.
- **A notes accumulator.** With two response warnings, a third ad-hoc string variable would repeat the pattern that the existing `artifactsWarning` started.
- **The line-length rule where the other house-style checks already live.** The module already isolates the newest entry's lines. Adding a fourth threshold there reuses that extraction and the descriptor wiring.

## Considered Alternatives

| Decision | Chosen Shape | Alternatives Considered | Trade-Off Summary |
|----------|--------------|-------------------------|-------------------|
| Where CRLF is handled | Normalise to LF as the first statement of `resolveConditionals()` and `stripComments()` | Make `computeLinePlacement()` and `mergeMarkers()` `\r\n`-aware and preserve the input's line endings; normalise only at the builder's three ingestion points; document CRLF as a Known Limitation | CRLF-aware regexes double the branching and need an output-ending decision for mixed input. Builder-only normalisation leaves direct callers (including the `ai-insights` wrapper checks) broken. Documenting it would leave a real Windows input broken. |
| Sharing the CRLF rule | A module-private `toLf()` in `conditionals.ts` that mirrors `normalizeNewlines()` | Import `normalizeNewlines` from `./postProcessor.js`; move both into a new shared engine helper module | Any import breaks the zero-import invariant (`constraints.md` §1, enforced by a test). The duplicated line is one regex, and its JSDoc names its twin. |
| Normalising on the no-tag path | Always normalise, before the fast path | Normalise only when tags are present | Conditional normalisation would make the output's line endings depend on whether a tag happened to exist. An unconditional contract is simpler to state and test. |
| Artifact policy shape | An exhaustive `Record<PipelineType, ArtifactDeclarationPolicy>` plus a pure evaluator in `pipeline-maps.ts` | A second `Set` of "empty-allowed" types next to the existing one; move the policy into `shared/workflow-manifest.json` `pipelines` | Two sets must be kept consistent by hand and are not exhaustive. The manifest is shared with the orchestrator and its schema, but only the server consumes this policy, so moving it would widen the blast radius for no consumer. |
| `release-engineering` policy | `declare` (`[]` accepted) | `non-empty` like `implementation` | A Release Engineer can legitimately find nothing release-relevant. `implementation` is the only stage whose PASS without file changes is a red flag. |
| Unmatched criterion handling | Keep the exact match and the append; add `appended_criteria`, a note and a project comment | Reject unmatched text; normalise whitespace or dashes before matching; append silently (status quo) | Rejecting breaks callers that rely on the documented append. Normalising relaxes intentional strictness (insight `ccc4b889`). The status quo is the reported harm. |
| Line-length rule location | A fourth threshold in `changelog-size-check.js` | A separate lint module and descriptor; a check across all four workspace changelogs | A separate module would re-implement newest-entry extraction. The build wrapper is persona-scoped: the root, `mcp-server` and `orchestrator` changelogs have no build hook. |
| Link handling in the length check | Count the link label, drop the `(target)` | Count raw lines; drop links entirely | Raw counting contradicts the curator's "links are excluded" rule. Dropping the label would undercount the visible prose. |
| Heading for the unreleased `mcp-server/changelog.md` entry | `## Unreleased`, renamed to `## v2.12.0 - {title}` at release (Human Action 5) | `## v2.12.0 - **WIP, UNRELEASED**` (the personas convention); accept the resulting auto-bump; defer the entry to the release step | `sync-version` copies the first `## vX.Y.Z` heading into `package.json` on every `npm run dev` (`predev`) and `build-maintain`. Verified on a scratch copy, the WIP heading bumps `package.json` to `2.12.0`. A bumped `package.json` makes a running server report `stale: true` and refuse `ledger_initialize_project` (`project-lifecycle.ts` L632–L645), so the bump is not harmless the way it is for `personas/package.json`. `## Unreleased` leaves `sync-version` a no-op and is skipped by `check-version-sync.js` exactly like the WIP heading. Deferring the entry would drop release prep that belongs in the plan. |

## Pattern Alignment

- Follows the zero-import engine invariant: `ai-persona-builder/src/engine/conditionals.ts` gains no import (`constraints.md` §1).
- Follows "one shared whitespace routine for both entry points" (rework-2's `mergeMarkers()`). Normalisation sits in front of it, not beside it.
- Follows exact-string engine tests (`ai-persona-builder/tests/engine/conditionals.test.ts`) and per-strip-point builder tests (`ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts`).
- Follows the executed-example rule for the migration guide (`ai-persona-builder/docs/migrating-to-v3.md`).
- Follows lint modules that return strings, with overridable exported thresholds (`ai-insights/scripts/lib/changelog-size-check.js`), and the descriptor runner owning severity (`ai-insights/scripts/lib/build-checks.js`).
- Follows exhaustive `Record<PipelineType, …>` maps (`ai-insights/mcp-server/src/utils/pipeline-maps.ts`, `PIPELINE_AGENT_MAP`) and low-priority `warning` project comments for soft checks (`pipeline.ts` L506, L526).
- Follows structured response flags (`auto_finalize_blocked`, `unmet_criteria`; `pipeline.ts` L631–L637) for the new `appended_criteria`.
- Follows the workflow-change order: spec, then code, then tests, then `constraints-workflow.md` (`ai-insights/AGENTS.md`).
- Follows the baseline-before-mutation rule codified in `ai-insights/personas/shared/partials/planner-core-rules.md` ("Acceptance Oracles").
- **Departure:** `mcp-server/changelog.md` gets an `## Unreleased` entry heading, which neither that changelog nor the workspace's `**WIP, UNRELEASED**` convention (`ai-insights/personas/changelog.md`) uses. This is justified: the plan prepares the changelog but must not set the released version. Unlike the personas manifest, `mcp-server/package.json` is read at runtime for stale-server detection, and `mcp-server/scripts/sync-version.js` (run by `predev`) would copy a versioned WIP heading into it. `## Unreleased` carries no `## vX.Y.Z` for the script to match, and `ai-insights/scripts/check-version-sync.js` already treats it as an unreleased entry.

## Structural Improvements

| Structure | Observation | Decision | Reason |
|-----------|-------------|----------|--------|
| `ai-persona-builder/src/engine/conditionals.ts` entry points | Assume LF input; CRLF breaks standalone detection | Promoted to step 3 | The synthesis' deferred CRLF item, re-verified as wider than reported |
| `ai-persona-builder/src/engine/conditionals.ts` vs `postProcessor.ts` | The CRLF rule would exist twice | Accepted as a documented one-line mirror (step 3) | The zero-import invariant forbids sharing it; the JSDoc names the twin so a change to one prompts the other |
| `ai-persona-builder/src/builders/persona-builder.ts` L495 `normalizeNewlines()` around the body read | Redundant once `stripComments()` normalises | Rejected | Harmless, and it states the builder's LF intent at the one place a file is read; removing it buys nothing |
| `ai-persona-builder/docs/agents/project-manifest/constraints.md` Known Limitation 16 | Says no-tag input is "returned unchanged" | Promoted to step 6 (wording) | It would otherwise be false for CRLF input |
| `ai-persona-builder/CHANGELOG.md` leading UTF-8 BOM | Present since `51ef079`, unique among the library docs | Promoted to step 6 | The file is edited anyway; a BOM breaks naive `^#`/`^## v` parsing at line 1 |
| `ai-insights/scripts/lib/changelog-size-check.js` | No mechanical check for house-style rule 5 | Promoted to step 7 | The synthesis' deferred item |
| `ai-insights/.gitattributes` | Forces `eol=lf` only for `.context/**` | Rejected | The library fix covers every consumer and non-git copies too; a repo-wide `eol` policy is a separate workspace decision |
| `ai-insights/mcp-server/src/utils/pipeline-maps.ts` `ARTIFACT_EXPECTED_PIPELINE_TYPES` | A yes/no set, not exhaustive, cannot express "`[]` is fine here" | Promoted to step 9 (replaced by `ARTIFACT_DECLARATION_POLICY`) | Root cause of the `files_modified: []` warning |
| `ai-insights/mcp-server/src/tools/pipeline.ts` step 4 silent append | Unmatched criteria give no signal | Promoted to step 9 | Prior Deferred Item 2; same function as step 3b |
| `ai-insights/mcp-server/src/tools/pipeline.ts` L644 ad-hoc note concatenation | A second warning would add a third variable | Promoted to step 9 (`notes: string[]`) | Adjacent to both changes |
| `ai-insights/shared/workflow-manifest.json` `spec_version` (`2.4.1`) vs the workflow-spec README `Version: 2.5.1` | The two differ | Rejected | `spec_version` is stamped into every ledger as `ledger_version` and drives forward-compatibility warnings (`project-lifecycle.ts` L381–L395). It is a data-format version, not the document version, and this plan changes no ledger data shape. |

## Detailed Steps

1. **Confirm the local library link.** Verify that `ai-insights/personas/node_modules/@mistralys/persona-builder` is a symlink to `ai-persona-builder`. If it is missing, re-create it by hand (`cd ai-insights/personas/node_modules/@mistralys && ln -s ../../../../ai-persona-builder persona-builder`).
2. **Capture the baseline** (every source-mutating step depends on this one).
   1. In `ai-persona-builder`, run `npm run build`, so `dist/` matches the current source.
   2. In `ai-insights`, run `node scripts/build-personas.js` (a real build). It must exit 0.
   3. Copy the nine directories `ai-insights/personas/{ledger,standalone,ledger-support}/{vs-code,claude-code,deep-agents}/` into `DEV/.baselines/2026-10-06-persona-targets-and-tool-validation-rework-3/rendered/`, preserving the relative layout, and copy `ai-insights/personas/name-mapping.json` alongside it.
   4. Write `MANIFEST.txt` in that folder, recording:
      - both repositories' HEAD commits;
      - the `git status --porcelain | wc -l` count for each repository;
      - the capture time;
      - the rendered file count.
3. **Normalise line endings in the engine.** In `ai-persona-builder/src/engine/conditionals.ts`:
   - add the module-private `toLf()` (Approach §1), with JSDoc naming `postProcessor.ts` `normalizeNewlines()` as its twin and the zero-import invariant as the reason;
   - make `text = toLf(text)` the first statement of `resolveConditionals()` and `stripComments()`, before the no-tag fast path;
   - add a **Line endings** bullet to both whitespace contracts in the JSDoc, and a sentence to the module header;
   - keep zero imports and the exported signatures unchanged.
4. **Add the regression tests.**
   - `ai-persona-builder/tests/engine/conditionals.test.ts`: a `describe('line endings')` block covering every Approach §1 row.
   - `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts`: a `describe('CRLF templates')` block. A CRLF body, a CRLF shared partial with a standalone comment and a standalone conditional, and a CRLF plugin frontmatter template each build to output byte-identical to the same fixture written with LF, and the output contains no `\r`.
5. **Verify the engine fix against the baseline.** Run `npm run build` in `ai-persona-builder`, then a real `node scripts/build-personas.js` in `ai-insights`. Run `diff -r` of the baseline `rendered/` against the nine live directories, and `cmp` on `name-mapping.json`. Both must report no difference. Record the commands and their empty output in the pipeline notes.
6. **Document the change in the library.**
   - `ai-persona-builder/docs/template-syntax.md`: a "Line endings" note in "Whitespace Rules" and in "Whitespace and Line Handling" (CRLF and lone CR are normalised to LF before tags are matched).
   - `ai-persona-builder/docs/agents/project-manifest/api-surface.md`: the `resolveConditionals` and `stripComments` entries state the always-LF return contract.
   - `ai-persona-builder/docs/api.md`: the same, in the L30 and L33 rows.
   - `ai-persona-builder/docs/agents/project-manifest/constraints.md`:
     - re-word Known Limitation 16's "return the input unchanged" to "return the input unchanged apart from line-ending normalisation";
     - add a note under §1 that `conditionals.ts` mirrors the `normalizeNewlines()` rule locally to keep the invariant.
   - `ai-persona-builder/CHANGELOG.md`:
     - a `v3.0.0 (proposed)` **Fix:** bullet: CRLF/CR templates (partials, frontmatter, direct API input) now render like LF ones, and both functions return LF;
     - remove the leading UTF-8 BOM.
   - `ai-persona-builder/docs/migrating-to-v3.md` §4:
     - a "Line endings" bullet under "What changed" (direct callers passing CRLF now receive LF);
     - a "Who is affected" line;
     - one verified example, executed against the built `dist/` before committing.
7. **Add the changelog line-length check.**
   - `ai-insights/scripts/lib/changelog-size-check.js`: implement Approach §3. Update the module header ("four mechanical thresholds") and the `checkChangelogEntrySize` JSDoc options.
   - `ai-insights/scripts/tests/changelog-size-check.test.js`: extend it as listed in the Test Plan.
   - `ai-insights/AGENTS.md`:
     - Changelog Convention rule 8's last bullet becomes "line/bullet/sentence-per-bullet/line-length thresholds";
     - the Root-Level Tooling row for `scripts/lib/changelog-size-check.js` names `MAX_LINE_LENGTH` and the link exclusion.
   - `ai-insights/personas/docs/agents/project-manifest/api-surface.md` L41: the warning list names line length.
8. **Update the workflow specification first** (`ai-insights/mcp-server/docs/agents/workflow-specification/`).
   - `operations.md`:
     - L173–L177: the artifact rule describes the per-type policy (`exempt` / `declare` / `non-empty`);
     - L683–L690: the criteria pseudo-code collects `appended` and emits `appended_criteria`, the note and the comment;
     - L717–L723: the artifacts pseudo-code uses `evaluateArtifactDeclaration(ARTIFACT_DECLARATION_POLICY[type], files_modified)`.
   - `edge-cases.md`: §21.64 (L559–L561) is rewritten for the policy. A new edge case, "Unmatched Acceptance-Criterion Update", is added after the last numbered case.
   - `README.md`: a new `v2.6.0` changelog entry listing both changes, with `**Version:**` and `**Date:**` updated. `shared/workflow-manifest.json` `spec_version` is left untouched (see Structural Improvements).
9. **Implement the server changes.**
   - `ai-insights/mcp-server/src/utils/pipeline-maps.ts`: replace `ARTIFACT_EXPECTED_PIPELINE_TYPES` with `ArtifactDeclarationPolicy`, `ARTIFACT_DECLARATION_POLICY`, `ArtifactDeclarationOutcome` and `evaluateArtifactDeclaration()` (Approach §4), with JSDoc stating each cell's reason.
   - `ai-insights/mcp-server/src/tools/pipeline.ts`:
     - step 3b uses the evaluator;
     - step 4 collects unmatched texts and emits `appended_criteria`, the note and the non-PM project comment (Approach §5);
     - `artifactsWarning` is replaced by `notes: string[]`, joined after `guidance` in the response;
     - the `.describe()` texts of `files_modified` (L310) and `acceptance_criteria_updates` (L345) state the new semantics.
   - `ai-insights/mcp-server/src/tools/help-content.ts` L443–L444: describe the warning on unmatched criteria and the `[]` semantics per pipeline type.
10. **Add the server tests.**
    - `ai-insights/mcp-server/tests/utils/pipeline-maps.test.ts`: replace the `ARTIFACT_EXPECTED_PIPELINE_TYPES` block (L372–L385) with policy and evaluator tests.
    - `ai-insights/mcp-server/tests/tools/pipeline.test.ts`: extend the artifacts-warning block (L1860–L1945) and add an "unmatched acceptance criteria" block (Test Plan).
    - Run `npm run build` and `npm test` in `ai-insights/mcp-server`.
11. **Update the server manifest and changelog.**
    - `ai-insights/mcp-server/docs/agents/project-manifest/constraints-workflow.md`:
      - rewrite "Artifact Declaration Expectation — Soft Warning on Empty `files_modified`" (L453–L463) for the policy, and retitle it "Artifact Declaration Policy — Soft Warning per Pipeline Type";
      - extend "⚠️ Unknown Criteria Text in `acceptance_criteria_updates` Is Appended" (L664–L668) with the signal.
    - `ai-insights/mcp-server/docs/agents/project-manifest/api-surface.md`: in the `pipeline-maps.ts` export listing (from L3288), replace `ARTIFACT_EXPECTED_PIPELINE_TYPES` with the new exports. In the `ledger_complete_pipeline` section, document the `appended_criteria` response field.
    - `ai-insights/mcp-server/changelog.md`: a new top entry headed `## Unreleased` (no version number; Pattern Alignment and Considered Alternatives explain why), with house-style bullets (≤ 100 characters per line) for both changes. `mcp-server/package.json` is not edited.
    - Prove the heading is inert to version sync:
      - in `ai-insights/mcp-server`, run `npm run sync-version`. It must report `v2.11.0` and "no change needed";
      - from the `ai-insights` root, run `git diff -- mcp-server/package.json`. It must be empty (run from `mcp-server` the pathspec does not resolve and the check is vacuous);
      - from `ai-insights`, run `node scripts/check-version-sync.js`. It must exit 0 and print "Skipping mcp-server: changelog has an UNRELEASED entry."
      - from the `ai-insights` root, run `grep -rln -i changelog mcp-server/src mcp-server/gui/src scripts`. Beyond `scripts/check-version-sync.js` and `mcp-server/scripts/sync-version.js`, no hit may read `mcp-server/changelog.md`'s first heading as a version. At planning time `mcp-server/src` and `mcp-server/gui/src` had no hits, and `scripts/cli.js` (L68, L106, L145) and `scripts/extract-changelog-entry.js` read only the root and `orchestrator` changelogs.
      - Record both outputs in the pipeline notes.
12. **Prepare the personas changelog.** In the `ai-insights/personas/changelog.md` `v3.39.0 - **WIP, UNRELEASED**` entry:
    - add the line-length check to the existing Build bullets, merging related Build bullets rather than adding a standalone one where possible;
    - do one consolidation pass over the whole entry, keeping every outcome.

    The entry must end at ≤ 25 bullets and ≤ 60 lines, with no line over 100 characters as measured by step 7's check.
13. **Run the final verification and regenerate the context.**
    - `ai-persona-builder`: `npm run typecheck`, `npm test`, `npm run build`.
    - `ai-insights/mcp-server`: `npm run build`, `npm test`.
    - `ai-insights`:
      - `npm test`, three consecutive runs;
      - `node scripts/build-personas.js --check`, which must report 0 errors and 0 warnings;
      - a real `node scripts/build-personas.js`;
      - `diff -r` of the nine rendered directories against the step-2 baseline, and `cmp` on `name-mapping.json`, both empty;
      - `node scripts/cli.js ctx-generate`, to regenerate `ai-insights/.context/` (and with it `ai-insights/CLAUDE.md`).

## Dependencies

- Step 2 depends on step 1. Steps 3, 7, 8 and 12 depend on step 2, so the baseline precedes every source mutation. Steps 9–11 reach it through step 8.
- Step 4 depends on step 3. Step 5 depends on steps 2–4. Step 6 depends on step 3.
- Step 9 depends on step 8 (spec first). Step 10 depends on step 9. Step 11 depends on steps 9–10.
- Step 12 depends on step 7, because the new check measures the entry.
- Step 13 depends on all earlier steps.

## Required Components

- `ai-persona-builder/src/engine/conditionals.ts` (modified)
- `ai-persona-builder/tests/engine/conditionals.test.ts`, `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` (modified)
- `ai-persona-builder/docs/template-syntax.md`, `ai-persona-builder/docs/api.md`, `ai-persona-builder/docs/migrating-to-v3.md`, `ai-persona-builder/CHANGELOG.md` (modified)
- `ai-persona-builder/docs/agents/project-manifest/{api-surface,constraints}.md` (modified)
- `ai-insights/scripts/lib/changelog-size-check.js`, `ai-insights/scripts/tests/changelog-size-check.test.js` (modified)
- `ai-insights/AGENTS.md`, `ai-insights/personas/docs/agents/project-manifest/api-surface.md` (modified)
- `ai-insights/mcp-server/src/utils/pipeline-maps.ts`, `ai-insights/mcp-server/src/tools/pipeline.ts`, `ai-insights/mcp-server/src/tools/help-content.ts` (modified)
- `ai-insights/mcp-server/tests/utils/pipeline-maps.test.ts`, `ai-insights/mcp-server/tests/tools/pipeline.test.ts` (modified)
- `ai-insights/mcp-server/docs/agents/workflow-specification/{README,operations,edge-cases}.md` (modified)
- `ai-insights/mcp-server/docs/agents/project-manifest/{constraints-workflow,api-surface}.md`, `ai-insights/mcp-server/changelog.md` (modified)
- `ai-insights/personas/changelog.md` (modified); `ai-insights/.context/`, `ai-insights/CLAUDE.md` (regenerated)
- `DEV/.baselines/2026-10-06-persona-targets-and-tool-validation-rework-3/` (**new**, outside both repositories)

## Assumptions

- The `ai-insights` → `ai-persona-builder` symlink exists (verified 2026-10-01). Step 1 only confirms it.
- No persona source in `ai-insights` contains `\r` (verified 2026-10-01). This is why the step-5 and step-13 oracles can be strict.
- The run is coordinated by the stable workspace's ledger server, not the DEV `mcp-server`, so steps 9–11 cannot affect the run's own ledger.
- Human Action 1 may or may not have been done. No criterion requires a clean tree: each one is relative to this plan's own changes (insight `b2797900`), and `MANIFEST.txt` records the tree state.

## Constraints

- `ai-persona-builder/src/engine/conditionals.ts` keeps zero imports and its exported signatures.
- `completePipeline()` never blocks or fails on either soft check.
- `acceptance_criteria_updates` matching stays exact `===`.
- `shared/workflow-manifest.json` is not edited.
- No library or server release, tag, `package.json` version change, or symlink revert happens inside the run.
- The newest `mcp-server/changelog.md` heading carries no `## vX.Y.Z` version until release, so `sync-version` stays a no-op however it is triggered (`npm run sync-version`, `npm run dev` via `predev`, or `node scripts/cli.js build-maintain`). Step 11 runs it once to prove that. No step runs `build-maintain`.
- `personas/changelog.md` stays summary-only, at ≤ 25 bullets and ≤ 60 lines in its newest entry, with no line over 100 characters.

## Out of Scope

- An escape form for a literal `{{!` (Deferred Item 1).
- Changing `collapseBlankLines()`, `ensureBlankLineBeforeHeadings()`, or the builder's existing `normalizeNewlines()` calls.
- Line-length enforcement for the root, `mcp-server` and `orchestrator` changelogs (no build hook; see Considered Alternatives).
- Persona content edits. The Documentation and Reviewer personas already instruct `files_modified: []`; this plan makes the server honour it.
- Reconciling `spec_version` with the workflow-spec README version (see Structural Improvements).

## Human Actions

| # | Action | When | Why an agent cannot do it |
|---|--------|------|---------------------------|
| 1 | Commit (or stash) the uncommitted rework-1/rework-2 changes in `ai-insights` (79 entries) and `ai-persona-builder` (10 entries), so this plan's baseline and diffs start from a clean HEAD | Before the run | Agents never run Git write commands; commit grouping and messages are the user's call |
| 2 | Delete `DEV/.baselines/2026-10-01-persona-targets-and-tool-validation-rework-2/` (rework-2 Human Action 3) and, once reviewed, `DEV/.baselines/2026-10-06-persona-targets-and-tool-validation-rework-3/` | After the run | Retained deliberately for human inspection of the oracle evidence |
| 3 | Settle the final v3.0.0 version number. Reconcile the orphaned `v2.6.0` tag (`52f1e63`) with `main`. Bump `ai-persona-builder/package.json`, replace `(proposed)` in `CHANGELOG.md`, tag, and `npm publish` `@mistralys/persona-builder` | After the run | Needs git history decisions, npm credentials and the release decision |
| 4 | In `ai-insights`: bump the `@mistralys/persona-builder` range in `personas/package.json` to the released range, remove the dev symlink, reinstall, and rebuild personas | After the run | Depends on action 3; the user reserved the dependency update and the symlink revert |
| 5 | Release `ai-insights`: rename the `mcp-server/changelog.md` `## Unreleased` heading to `## v2.12.0 - {title}` and run `sync-version`; drop the WIP marker from `personas/changelog.md` v3.39.0; write the root `changelog.md` entry, and tag | After the run | Releases and tags are reserved for the user |
| 6 | After deploying the DEV personas and server to the workspace that runs the workflow, check the next project's comments: Documentation and Reviewer passes that modified nothing should carry `files_modified: []` and no longer raise the artifacts warning | After the run | The run uses the stable workspace's personas and server, so adoption can only be observed after deployment |

## Acceptance Criteria

- AC-01: `resolveConditionals()` and `stripComments()` return exactly the Approach §1 outputs for every row, including the lone-CR, inline and no-tag rows, and their output never contains `\r`.
- AC-02: Every pre-existing test in `ai-persona-builder/tests/engine/conditionals.test.ts` and `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` passes unchanged, including the Known Limitation 16 characterization test.
- AC-03: `ai-persona-builder/src/engine/conditionals.ts` has zero `import` statements, and the signatures of `resolveConditionals` and `stripComments` are unchanged.
- AC-04: A persona build whose body, shared partial (with a standalone comment and a standalone conditional) and plugin frontmatter template are written with CRLF produces output byte-identical to the same fixture written with LF.
- AC-05: The baseline folder `DEV/.baselines/2026-10-06-persona-targets-and-tool-validation-rework-3/` contains the nine rendered directories, `name-mapping.json` and `MANIFEST.txt`. `MANIFEST.txt` records both HEAD commits and working-tree entry counts captured before this plan's first source change, and the rendered file count matches the live tree at capture time.
- AC-06: After the engine fix (step 5), `diff -r` between the baseline and the rebuilt nine directories reports no difference, and `cmp` reports `name-mapping.json` identical.
- AC-07: `ai-persona-builder/docs/template-syntax.md`, `docs/api.md` and the `api-surface.md` `resolveConditionals`/`stripComments` entries describe the always-LF contract. `constraints.md` Known Limitation 16 reflects the normalisation, and §1 notes the local mirror.
- AC-08: `ai-persona-builder/CHANGELOG.md` `v3.0.0 (proposed)` lists the line-ending fix, and the file no longer starts with a BOM. `docs/migrating-to-v3.md` §4 covers line endings with "What changed / Who is affected / What to do", and its example was executed against the built library.
- AC-09: In `ai-persona-builder`, `npm run typecheck`, `npm test` and `npm run build` pass.
- AC-10: `checkChangelogEntrySize()` warns once per newest-entry line longer than `MAX_LINE_LENGTH` (100) code points. It counts a Markdown link as its label only, honours a `maxLineLength` override, names the offending line number, and never inspects historical entries.
- AC-11: `ai-insights/AGENTS.md` (Changelog Convention rule 8 and the `changelog-size-check.js` Root-Level Tooling row) and `ai-insights/personas/docs/agents/project-manifest/api-surface.md` describe the line-length check.
- AC-12: `ai-insights/mcp-server/src/utils/pipeline-maps.ts` exports `ARTIFACT_DECLARATION_POLICY` (typed `Record<PipelineType, ArtifactDeclarationPolicy>`, with the Approach §4 values) and `evaluateArtifactDeclaration()`. `ARTIFACT_EXPECTED_PIPELINE_TYPES` no longer exists anywhere in `mcp-server/src` or `mcp-server/tests`.
- AC-13: On a non-PM PASS, `ledger_complete_pipeline`:
  - accepts `files_modified: []` without a warning for `code-review`, `release-engineering` and `documentation`;
  - still warns for an absent field on those types;
  - warns for both absent and `[]` on `implementation`;
  - never warns for `qa` or `security-audit`.

  Warnings keep the existing project-comment shape and the response substring `artifacts.files_modified is empty or absent`.
- AC-14: When `acceptance_criteria_updates` contains text that matches no existing criterion, it is still appended. The response carries `appended_criteria` with exactly the unmatched texts, plus a note. For a non-PM caller, one low-priority `warning` project comment names the WP and each text. Matched updates produce none of these. Matching stays exact.
- AC-15: The workflow spec (`operations.md`, `edge-cases.md` §21.64 and the new edge case, and a `README.md` v2.6.0 entry), `constraints-workflow.md` (both sections), the `api-surface.md` `pipeline-maps.ts` listing, `help-content.ts` and the schema `.describe()` texts all describe the new behaviour. `shared/workflow-manifest.json` is unchanged.
- AC-16: `ai-insights/mcp-server/changelog.md` has an `## Unreleased` top entry covering both server changes, with no line over 100 characters, and no `## vX.Y.Z` heading above `## v2.11.0`. `npm run sync-version` in `ai-insights/mcp-server` reports `v2.11.0` with no change, `node scripts/check-version-sync.js` exits 0 and skips `mcp-server` as unreleased, and `git diff -- mcp-server/package.json` from the `ai-insights` root is empty. In `ai-insights/mcp-server`, `npm run build` and `npm test` pass.
- AC-17: The `ai-insights/personas/changelog.md` `v3.39.0` entry mentions the line-length check, has ≤ 25 bullets and ≤ 60 lines, and produces no `changelog-size` warning.
- AC-18: In `ai-insights`:
  - `npm test` passes three consecutive runs;
  - `node scripts/build-personas.js --check` exits 0 with 0 errors and 0 warnings;
  - a real build exits 0;
  - the final `diff -r` of the nine rendered directories against the baseline is empty, and `name-mapping.json` is identical;
  - `ai-insights/.context/` is regenerated.

## Testing Strategy

- **Engine unit tests** pin the CRLF contract with exact strings for both entry points. They include the lone-CR, inline and no-tag paths, so that a future edit moving the normalisation below the fast path fails a test.
- **Builder integration tests** prove the three ingestion points (body, partials map, frontmatter) are CRLF-safe end to end. Each compares the CRLF build against an LF twin byte for byte.
- **The strict consumer diff** against a pre-captured baseline is the end-to-end proof that the engine change alters no real persona output. It runs twice: right after the fix (step 5) and at the end (step 13).
- **Lint unit tests** cover the new threshold at its boundary, with links, with multi-byte characters, with the override, and with historical entries excluded.
- **Server tests:** a pure-evaluator test grid (3 policies × absent / empty / non-empty) plus `completePipeline()` integration tests per pipeline type, and the criteria-append signal for matched, unmatched, mixed and PM-caller cases.

## Test Plan

- `ai-persona-builder/tests/engine/conditionals.test.ts` → `describe('line endings')`:
  - "a standalone comment under CRLF removes its whole line";
  - "blank-line runs around a CRLF comment merge";
  - "a lone CR is treated as a line break";
  - "an emits-nothing CRLF block removes its lines";
  - "a kept CRLF branch renders with LF";
  - "a blank-separated emits-nothing CRLF block leaves one paragraph break";
  - "adjacent emits-nothing CRLF blocks merge as one";
  - "an inline CRLF tag removes only the tag";
  - "CRLF input with no tags is returned with LF endings" (both functions);
  - "output never contains a carriage return"

  — AC-01
- `ai-persona-builder/tests/engine/conditionals.test.ts` and `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` — the existing suites, unchanged and passing (including "Known Limitation 16") — AC-02
- `ai-persona-builder/tests/engine/conditionals.test.ts` — the existing "has no import statements in the module source" test — AC-03
- `ai-persona-builder/tests/builders/template-whitespace-and-comments.test.ts` → `describe('CRLF templates')`:
  - "a CRLF body template builds byte-identical to its LF twin";
  - "a CRLF shared partial with a standalone comment and conditional builds byte-identical to its LF twin";
  - "a CRLF plugin frontmatter template builds byte-identical to its LF twin";
  - each also asserts no `\r` in `content`

  — AC-04
- Baseline folder inspection (QA, step 2): contents, `MANIFEST.txt` commits and counts recorded before step 3's first change, matching file count — AC-05
- `diff -r` + `cmp` after step 5, with the empty output recorded — AC-06
- Documentation review of `template-syntax.md`, `docs/api.md`, `api-surface.md`, `constraints.md` (§1 and Known Limitation 16) — AC-07
- `head -c 3 ai-persona-builder/CHANGELOG.md | xxd` shows no `efbbbf`. The migration-guide line-ending example is run with `node` against `ai-persona-builder/dist/`, and its output is recorded — AC-08
- `ai-persona-builder` `npm run typecheck`, `npm test`, `npm run build` (step 13) — AC-09
- `ai-insights/scripts/tests/changelog-size-check.test.js` → `describe('checkChangelogEntrySize')`:
  - "no line-length warning at exactly MAX_LINE_LENGTH";
  - "exactly one warning, naming the line, one character over";
  - "a Markdown link counts as its label only";
  - "multi-byte characters count as one" (`—`, `·`);
  - "maxLineLength override is honoured";
  - "a long line in a historical entry is ignored";
  - the existing "realistic clean entry shaped like v3.32.0" test still produces no warnings

  — AC-10
- Documentation review of `ai-insights/AGENTS.md` (rule 8 and the tooling row) and `ai-insights/personas/docs/agents/project-manifest/api-surface.md` — AC-11
- `ai-insights/mcp-server/tests/utils/pipeline-maps.test.ts` → `describe('ARTIFACT_DECLARATION_POLICY')`: has an entry for every `PIPELINE_TYPES` value, with the Approach §4 values. → `describe('evaluateArtifactDeclaration')`: the full 3 × 3 grid (exempt / declare / non-empty × undefined / `[]` / `['a']`). Plus `grep -rn ARTIFACT_EXPECTED_PIPELINE_TYPES mcp-server/src mcp-server/tests` returns nothing — AC-12
- `ai-insights/mcp-server/tests/tools/pipeline.test.ts`, artifacts-warning block:
  - the existing three tests still pass;
  - "documentation PASS with `files_modified: []` emits no warning";
  - "code-review PASS with `[]` emits no warning";
  - "release-engineering PASS with `[]` emits no warning";
  - "documentation PASS with the field absent warns, and the note suggests an explicit empty array";
  - "implementation PASS with `[]` warns";
  - "PM override emits no warning"

  — AC-13
- `ai-insights/mcp-server/tests/tools/pipeline.test.ts` → `describe('unmatched acceptance criteria')`:
  - "an exact match updates `met` and emits no `appended_criteria`";
  - "an unmatched text is appended, listed in `appended_criteria`, noted in the response, and recorded as one warning project comment";
  - "a mixed batch lists only the unmatched texts";
  - "a PM caller gets `appended_criteria` and the note but no project comment";
  - "matching is still exact: a hyphen-for-em-dash variant is appended"

  — AC-14
- Documentation review of the workflow spec files, `constraints-workflow.md`, `api-surface.md`, `help-content.ts` and the `.describe()` texts. `git diff --stat -- shared/workflow-manifest.json`, run from the `ai-insights` root, is empty — AC-15
- Review of `ai-insights/mcp-server/changelog.md`'s top entry (heading is exactly `## Unreleased`), plus a line-length check; `npm run sync-version` in `ai-insights/mcp-server` prints "Found version in changelog: v2.11.0" and "no change needed"; `node scripts/check-version-sync.js` exits 0 with the `mcp-server` skip line; `git diff -- mcp-server/package.json`, run from the `ai-insights` root, shows no change from this plan; the step 11 changelog-reader grep finds no other consumer of the `mcp-server` changelog's first heading; `npm run build` and `npm test` in `ai-insights/mcp-server` — AC-16
- `node scripts/build-personas.js --check` reports no `changelog-size` warning; review of the `v3.39.0` entry — AC-17
- `ai-insights` `npm test` ×3, `--check`, real build, final `diff -r` + `cmp`, and `ctx-generate` (step 13) — AC-18

## Documentation Updates

- `ai-persona-builder/src/engine/conditionals.ts` — module header, `toLf()` JSDoc, and both whitespace contracts (Line endings bullet).
- `ai-persona-builder/docs/template-syntax.md` — "Line endings" notes in "Whitespace Rules" and "Whitespace and Line Handling".
- `ai-persona-builder/docs/api.md` — the `stripComments` and `resolveConditionals` rows.
- `ai-persona-builder/docs/agents/project-manifest/api-surface.md` — the `resolveConditionals` and `stripComments` entries (Maintenance Rules: modify engine function).
- `ai-persona-builder/docs/agents/project-manifest/constraints.md` — the §1 mirror note, the Known Limitation 16 wording, and the zero-dependency invariant re-verified (Maintenance Rules: modify engine function).
- `ai-persona-builder/CHANGELOG.md` — the `v3.0.0 (proposed)` fix bullet; BOM removed.
- `ai-persona-builder/docs/migrating-to-v3.md` — §4 line-ending subsection with a verified example.
- `ai-insights/AGENTS.md` — Changelog Convention rule 8 and the Root-Level Tooling row for `scripts/lib/changelog-size-check.js`.
- `ai-insights/personas/docs/agents/project-manifest/api-surface.md` — the build warning list (Maintenance Rules: change build script function).
- `ai-insights/mcp-server/docs/agents/workflow-specification/{operations,edge-cases,README}.md` — spec first, per the cross-project workflow rule.
- `ai-insights/mcp-server/docs/agents/project-manifest/constraints-workflow.md` — both affected sections (Maintenance Rules: add or modify a constraint).
- `ai-insights/mcp-server/docs/agents/project-manifest/api-surface.md` — the `pipeline-maps.ts` exports and the `appended_criteria` response field (Maintenance Rules: modify public signature).
- `ai-insights/mcp-server/src/tools/help-content.ts` — `ledger_complete_pipeline` help.
- `ai-insights/mcp-server/changelog.md` — the new `## Unreleased` entry.
- `ai-insights/personas/changelog.md` — the `v3.39.0` consolidation and the line-length mention.
- `ai-insights/.context/` and `ai-insights/CLAUDE.md` — regenerated via `node scripts/cli.js ctx-generate`.

## Deferred Items

| # | Deferred Item | Origin | Reason Deferred | Notes |
|---|---------------|--------|-----------------|-------|
| 1 | An escape form for emitting a literal `{{!` | Rework-2 plan → Deferred Item 1; `constraints.md` Known Limitation 15 | Still no consumer: no `ai-insights` persona needs to emit `{{!`, and the migration guide documents the workaround. New syntax with no consumer fails the Justified Structure rule. | Reconcile when a template must show comment syntax literally |
| 2 | Reconcile `shared/workflow-manifest.json` `spec_version` (`2.4.1`) with the workflow-spec README version (`2.5.1`, `2.6.0` after step 8) | Observed during this plan's research | `spec_version` is a ledger data-format version stamped as `ledger_version`, with forward-compatibility semantics; whether the two are meant to match needs an owner decision | Consider in the next plan that changes the ledger data shape |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Normalisation changes real persona output** | No persona source contains `\r`. The strict `diff -r` / `cmp` oracle runs right after the fix and again at the end. |
| **A direct API caller relied on CRLF being preserved** | CRLF output was already broken (blank lines added at every standalone tag). The change ships in the unreleased v3.0.0, with a migration-guide entry. |
| **A future edit moves normalisation below the no-tag fast path** | The "CRLF input with no tags is returned with LF endings" tests fail. |
| **The policy map hides a needed warning** | Only `[]` on review and documentation stages is newly accepted. An absent field still warns everywhere it did, and `implementation` still warns on `[]`, all pinned by tests. |
| **New response field confuses existing callers** | `appended_criteria` is additive and present only when something was appended. The existing response text and keys are unchanged. |
| **The line-length check warns on today's entry and breaks the 0-warning criterion** | The current entry has 0 lines over 100 characters (verified). Step 12 runs the check after consolidating. |
| **The workflow spec drifts from the code** | Step 8 (spec) precedes step 9 (code), per `ai-insights/AGENTS.md`, and AC-15 reviews both. |
| **The unreleased server changelog entry leaks into `mcp-server/package.json`** (any `npm run dev` would bump it through `predev`, and a bumped version marks running servers stale and blocks `ledger_initialize_project`) | The entry is headed `## Unreleased`, which `sync-version` cannot match. Step 11 runs `sync-version` and `check-version-sync.js` to prove both are no-ops, and AC-16 pins it. |
| **A stale library `dist/` makes the wrapper test old code** | Steps 2, 5 and 13 run `npm run build` in `ai-persona-builder` before every consumer build. |

## Recommended Workflow
- **Workflow:** ledger
- **Rationale:** The plan spans two repositories and three distinct concerns (engine line endings, build lint, ledger server workflow logic). It includes a workflow-spec-first change to the MCP server and ordered baseline oracles, so separate WPs, formal QA and code review are worth having.
