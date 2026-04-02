# Plan

## Summary

Bring the persona-builder documentation up to standalone-library quality so that an external consumer (human or agent) can adopt the package in a new project without referencing the ai-insights codebase. The work focuses on removing stale ledger-plugin references, adding a complete YAML metadata reference, providing a worked end-to-end example with rendered output, and tightening a handful of smaller gaps.

## Architectural Context

The library ships as `@mistralys/persona-builder` with dual CJS/ESM output via tsup. User-facing docs live in `docs/` (6 guides) alongside the agent-facing manifest in `docs/agents/project-manifest/` (6 documents). The README serves as the landing page and primary getting-started resource. The library has a single runtime dependency (`js-yaml`) and a `persona-build` CLI entry point.

Key files:

| File | Role |
|------|------|
| `README.md` | Landing page, quick-start, feature summary |
| `docs/api.md` | Public exports reference |
| `docs/plugins.md` | Plugin interface and examples |
| `docs/configuration.md` | `BuildConfig` / `SuiteConfig` / `BuildSummary` |
| `docs/template-syntax.md` | Variables, partials, conditionals, built-ins |
| `docs/directory-convention.md` | Expected source layout |
| `docs/cli.md` | CLI flags and config file format |
| `docs/agents/project-manifest/api-surface.md` | Agent manifest — complete type signatures |
| `docs/agents/project-manifest/constraints.md` | Agent manifest — invariants and known limitations |
| `fixtures/sample-suite/` | Working test fixture (meta, content, partials) |

The ledger plugin was fully removed in v2.0.0 (source, tsup entry, package.json export). However, three documents still contain stale ledger-plugin content as if it were a first-party export.

## Approach / Architecture

Seven discrete documentation tasks, ordered so that each produces a self-contained improvement. No source code changes required — all work targets Markdown files, the sample fixture, and `docs/agents/project-manifest/`.

## Rationale

The most impactful issue is the ledger plugin ghost: the README devotes ~45 lines to a sub-path export that no longer exists, and `docs/api.md` lists its exported symbols. An external consumer following the README would hit an import error on their first build. After that, the biggest friction point is the absence of a YAML metadata reference — consumers must reverse-engineer which fields exist by cross-referencing `template-syntax.md`, `configuration.md`, `data-flows.md`, and the sample fixture.

## Detailed Steps

### Step 1 — Remove stale ledger-plugin content from README.md

**File:** `README.md`  
**Action:** Remove the entire "Ledger Plugin" section (lines ~73–117) that documents installation, usage, and `LedgerPluginOptions`. Replace it with a short "Plugins" mention that links to `docs/plugins.md` and notes that the ledger plugin was migrated out.

**Acceptance:** The README contains no `@mistralys/persona-builder/plugins/ledger` import paths. The ledger plugin is mentioned only as a historical note or external reference.

### Step 2 — Remove stale ledger-plugin exports from docs/api.md

**File:** `docs/api.md`  
**Action:** Remove the entire "Ledger Plugin" section at the bottom (lines ~21–33) that documents `ledgerPlugin`, `LedgerPluginOptions`, `RosterEntry`, `McpToolEntry`, and associated functions as sub-path exports. These no longer exist in the package.

**Acceptance:** `docs/api.md` lists only symbols that are actually exported from the package.

### Step 3 — Add YAML Metadata Reference to docs/

**File:** `docs/metadata-reference.md` (new)  
**Action:** Create a single-page reference documenting every recognized YAML field for persona metadata. Organize into three tiers:

1. **Required fields** — Fields the library expects in every persona YAML for correct output:
   - `name` (string) — the only truly hard-required field; `loadMetadata()` throws without it
   - `slug` (string) — used for output path fallback and `agent_*` map keys
   - `description` (string) — used by the default VS Code frontmatter template
   - `tools` (string[]) — used by both default frontmatter templates

2. **Output-path fields** — Control the filenames of generated output:
   - `vs_file_name` (string) — VS Code output basename (fallback: content filename)
   - `cc_file_name` (string) — Claude Code output basename (fallback: content filename)

3. **Target-specific fields** — Required by the default Claude Code frontmatter, optional if you override frontmatter via plugin:
   - `cc_permission_mode` (string) — Claude Code permission mode
   - `cc_model` (string) — Claude Code model identifier
   - `cc_memory` (string | boolean) — Claude Code memory setting
   - `cc_tools` (string[]) — Separate tool list for Claude Code (falls back to `tools`)

4. **Optional / convention fields** — Commonly used but not required by the engine:
   - `version` (string) — persona version; falls back to `_shared.yaml` `default_version`, then `'0.0.0'`
   - `author` (string)
   - `last_updated` (string)
   - `id` (string) — machine identifier
   - `role` (string) — used by some plugins for role validation

5. **Shared defaults** — Explain that `meta/_shared.yaml` provides suite-wide fallbacks merged under every persona, and note the `default_version` convention.

6. **Auto-derived context variables** — Reference (or cross-link to) `template-syntax.md`'s built-in context variables table so readers know which variables are computed at build time vs. supplied by YAML.

Also add a row to the README's "Documentation" table pointing to this new file.

**Acceptance:** A consumer can look at one page to know every YAML field, whether it's required, and what happens when it's missing.

### Step 4 — Add end-to-end worked example with rendered output

**File:** `docs/getting-started.md` (new)  
**Action:** Write a step-by-step tutorial that walks through creating a persona from scratch:

1. Install the package
2. Create the directory structure (`meta/`, `content/`, `partials/`)
3. Write `_shared.yaml` with all default fields (including `cc_*` fields)
4. Write a per-persona YAML file
5. Write a content template using variables, a partial, and a conditional
6. Write a shared partial
7. Create a `persona-build.config.js`
8. Run `npx persona-build`
9. Show the **exact rendered output** for both VS Code and Claude Code targets (fenced code blocks)

Use the existing `fixtures/sample-suite/` as the basis but expand it slightly to demonstrate conditionals and the shared/suite-local partial merge.

Also add this as the first row in the README's "Documentation" table ("Getting Started — Build your first persona").

**Acceptance:** The tutorial is self-contained. A reader can copy-paste the YAML, Markdown, and config, run the build, and get the shown output. The output matches what the library actually produces.

### Step 5 — Document `personaMode` and its relationship to plugins

**File:** `docs/configuration.md`  
**Action:** Expand the `personaMode` description in the `SuiteConfig` table. Currently it says "optional mode string passed to plugins". Add:
  - Clarify that `personaMode` is a passthrough value — the core library does nothing with it. It is exposed to plugins via `SuiteConfig.personaMode` so that a plugin can vary its behavior per suite (e.g., apply ledger-specific rendering only when `personaMode === 'ledger'`).
  - Mention that known mode values are entirely plugin-defined; the library imposes no constraints.

Also update `docs/plugins.md` to reference `personaMode` in the `onSuiteInit` example so plugin authors see how to read it.

**Acceptance:** A consumer reading the config reference understands that `personaMode` is plugin-facing, not engine-facing.

### Step 6 — Expand the fixture as a usable reference project

**File:** `fixtures/sample-suite/content/example-persona.md`, `fixtures/sample-suite/meta/example-persona.yaml`, `fixtures/sample-suite/meta/_shared.yaml`  
**Action:** Enrich the fixture so it demonstrates all major features a new consumer would need:

- Add Claude Code fields to `_shared.yaml` (`cc_permission_mode`, `cc_model`, `cc_memory`)
- Add `slug`, `vs_file_name`, `cc_file_name` to `example-persona.yaml`
- Add a conditional block (`{{#if show_advanced}}`) and an `{{else}}` clause to the content template
- Add a `show_advanced` flag to the persona YAML
- Add a suite-local partial reference (`{{> suite-specific}}`) to the content template

Run the test suite afterward to verify nothing breaks.

**Acceptance:** The fixture demonstrates variables, partials (shared + suite-local), conditionals, both targets' metadata fields, and explicit output filenames. All existing tests still pass.

### Step 7 — Update the agent project manifest

**Files:**
- `docs/agents/project-manifest/api-surface.md` — Remove the Ledger Plugin section (same issue as `docs/api.md`; lines documenting `ledgerPlugin`, `FRONTMATTER_LEDGER_*`, etc. that reference removed exports).
- `docs/agents/project-manifest/constraints.md` — Add a note under Known Limitations that the ledger plugin was removed in v2.0.0 and must be sourced externally.
- `docs/agents/project-manifest/README.md` — Bump the manifest revision date.

**Acceptance:** The agent manifest accurately reflects the library's current public surface with no phantom exports.

## Dependencies

- Steps 1 and 2 are independent (stale content removal).
- Step 3 (metadata reference) and Step 4 (getting-started tutorial) are independent of each other but Step 4 can cross-link to Step 3.
- Step 5 (personaMode docs) is independent.
- Step 6 (fixture enrichment) should be done before or alongside Step 4, since the tutorial references the fixture.
- Step 7 (manifest update) should be done last since it captures the final state.

Recommended sequencing: 1 → 2 → 3 → 6 → 4 → 5 → 7

## Required Components

- `README.md` (edit — remove ledger section, add doc table rows)
- `docs/api.md` (edit — remove ledger section)
- `docs/metadata-reference.md` (new file)
- `docs/getting-started.md` (new file)
- `docs/configuration.md` (edit — expand `personaMode`)
- `docs/plugins.md` (edit — add `personaMode` usage example)
- `fixtures/sample-suite/meta/_shared.yaml` (edit)
- `fixtures/sample-suite/meta/example-persona.yaml` (edit)
- `fixtures/sample-suite/content/example-persona.md` (edit)
- `docs/agents/project-manifest/api-surface.md` (edit)
- `docs/agents/project-manifest/constraints.md` (edit)
- `docs/agents/project-manifest/README.md` (edit)

## Assumptions

- The ledger plugin is permanently removed from this library and will not be re-added. All ledger content should be treated as stale.
- The `fixtures/sample-suite/` fixture is used by integration tests. Changes must remain backward-compatible or tests must be updated in the same step.
- No source code changes are needed — this is a pure documentation effort (plus fixture edits).

## Constraints

- All doc changes must match the library's current behavior (v2.1.x). No aspirational documentation.
- The getting-started tutorial's "rendered output" section must be verified against actual build output, not hand-written.
- The YAML metadata reference must be grounded in `loadMetadata()`, `buildContext()`, and the default frontmatter template source — not inferred from docs alone.
- Follow existing documentation style: Markdown tables, fenced code blocks, concise language.

## Out of Scope

- Source code changes to the library engine, loaders, or builders.
- Adding new features (e.g., a replacement for the ledger plugin).
- Updating the ai-insights workspace's consumer config or plugin code.
- Publishing a new version to npm (no functional changes warrant a release; a patch bump for the metadata reference could be considered separately).
- Rewriting the agent project manifest from scratch — only targeted fixes.

## Acceptance Criteria

- A developer who has never seen the ai-insights project can install `@mistralys/persona-builder`, follow the getting-started tutorial, and produce working VS Code + Claude Code persona files on their first attempt.
- No document references `@mistralys/persona-builder/plugins/ledger` as a working import.
- A single page (`docs/metadata-reference.md`) answers "what YAML fields exist and which are required?"
- The `fixtures/sample-suite/` fixture demonstrates variables, partials, conditionals, both targets, and explicit output filenames.
- All 236 existing tests pass after fixture changes.
- The agent project manifest (`docs/agents/project-manifest/`) accurately reflects the library's v2.1.x public surface.

## Testing Strategy

- **Step 6 (fixture edits):** Run `npm test` to verify all integration and builder tests pass with the enriched fixture.
- **Step 4 (tutorial output):** Run an actual build against the tutorial's config and diff the output against the fenced code blocks in the tutorial doc.
- **Steps 1–3, 5, 7:** Manual review — verify no broken internal links, no references to removed exports, and consistent cross-references between docs.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Fixture changes break existing tests** | Review integration test assertions against fixture before editing. Extend assertions rather than replacing existing ones. |
| **Tutorial output drifts from actual build** | Include a note in the tutorial header that output was verified against v2.1.x. Optionally add a CI step later. |
| **Missing YAML fields in metadata reference** | Ground the reference in source code (`buildContext()` in `persona-builder.ts`, default frontmatter templates in `frontmatter.ts`), not just other docs. |
| **Ledger plugin references in places not yet identified** | Run a workspace-wide grep for `ledger` before marking Step 1/2 complete. |
