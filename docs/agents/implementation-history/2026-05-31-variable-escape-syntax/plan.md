# Plan

## Plan Audit Cycles
- Audits: none — Plan Auditor v1.4.0
- Architectural Reviews: none — Plan Architect Reviewer v1.5.0

## Summary

Add a backslash escape syntax to the persona builder's variable resolution engine so that
template authors can write `\{{variable_name}}` to emit a literal `{{variable_name}}` in
the rendered output without generating a `[WARN] Unresolved variable` warning. The
primary driver is `ctx-architect.md` (in the `ai-insights` persona suite), which
documents CTX generator variables using the same `{{...}}` syntax as the persona builder
— nine warnings fire every build because those markers are intentionally not in the build
context. The fix is confined to a single engine function and its test file.

## Architectural Context

The engine layer (`src/engine/`) contains five pure, zero-dependency TypeScript modules
that have no imports of any kind. Variable substitution lives in
`src/engine/variables.ts` → `resolveVariables(text, context, filename)`. It applies the
regex `/\{\{(\w+)\}\}/g`, substitutes any matched key found in `context`, and emits a
`console.warn` for every key not found (preserving the original marker in the output).
The processing order enforced by `buildPersona()` in `src/builders/persona-builder.ts` is:

```
resolvePartials → resolveConditionals → resolveVariables → postProcessor steps
```

The partials and conditionals processors use non-word-character prefixes (`>` and `#`),
so they never consume plain `{{word}}` markers — including escaped ones prefixed with
`\`. This means a `\{{word}}` marker will pass through partials and conditionals
processing untouched and arrive at `resolveVariables` intact.

Relevant files:
- `src/engine/variables.ts` — `resolveVariables()`, the only function to change
- `src/engine/index.ts` — barrel re-export (no change needed, signature is unchanged)
- `tests/engine/variables.test.ts` — unit test suite for `resolveVariables()`
- `docs/agents/project-manifest/constraints.md` — Template Syntax table to update

## Approach / Architecture

Extend the `resolveVariables()` regex from `/\{\{(\w+)\}\}/g` to
`/(\\?)\{\{(\w+)\}\}/g`, capturing an optional leading backslash in a first capture
group. In the replacement function:

- If the first capture group is `\` (an escaped marker): return `{{varName}}` as a
  literal string — no context lookup, no warning.
- Otherwise (no leading backslash): existing substitution logic unchanged.

Because the regex now optionally consumes a preceding `\` character, escaped markers are
handled atomically — there is no risk of the unescaped `{{varName}}` portion being
re-matched in a subsequent pass.

This change keeps `resolveVariables()` zero-dependency and purely functional. No new
processing step, no new module, no new export — the public function signature
`(text, context, filename) → string` is unchanged.

## Rationale

Backslash escaping is the de-facto standard for template engines (Handlebars, Mustache).
A `\` before `{{` has no special meaning in Markdown, so persona content files are
unaffected in terms of formatting. The fix is the smallest possible change that achieves
the goal: one regex tweak and a branch in one function.

## Considered Alternatives

| Decision | Chosen Shape | Alternatives Considered | Trade-Off Summary |
|----------|--------------|-------------------------|-------------------|
| Escape syntax | `\{{varName}}` (backslash prefix) | Triple braces `{{{varName}}}` | Triple braces are ambiguous (Handlebars uses them for unescaped HTML) and harder to search for; backslash is the canonical template-engine escape character. |
| Escape syntax | `\{{varName}}` (backslash prefix) | Special prefix `{{!varName}}` or `{{-varName}}` | Discoverable only if documented; no prior art. Backslash is instantly recognisable to authors familiar with any templating language. |
| Implementation location | Inline in `resolveVariables()` | New pre/post-processing step in `persona-builder.ts` | A pre/post step adds complexity to the pipeline and requires round-tripping through a placeholder string. Handling it inline is self-contained and easier to test. |
| Implementation location | Inline in `resolveVariables()` | New engine module `escape.ts` | Unnecessary abstraction for a one-function change; the escape concern is intrinsic to variable resolution, not a separate pipeline stage. |

## Pattern Alignment

- **Zero-dependency engine** (`src/engine/constraints.md` §1): change is purely string
  manipulation, no imports added — invariant preserved.
- **Processing order: partials → conditionals → variables** (`data-flows.md` §8): no
  change to pipeline order; the escape is handled within the variables step.
- **Named re-export utility barrels** (`constraints.md` Naming Conventions): no new
  utility module introduced; no barrel change needed.

## Detailed Steps

1. **Modify `src/engine/variables.ts`**  
   - Change the regex from `/\{\{(\w+)\}\}/g` to `/(\\?)\{\{(\w+)\}\}/g`.
   - Update the replacement function to extract two capture groups: `escape` (group 1)
     and `varName` (group 2).
   - When `escape === '\\'`: return `` `{{${varName}}}` `` immediately (no lookup,
     no warning).
   - When `escape` is empty: existing substitution logic (lookup → warn-and-preserve).
   - Update the JSDoc comment to document the escape behaviour.

2. **Update `tests/engine/variables.test.ts`**  
   Add a new describe block (or extend the existing edge-cases block) covering:
   - `\{{varName}}` with the key **absent** from context → no warning, output is
     `{{varName}}`.
   - `\{{varName}}` with the key **present** in context → no substitution, no warning,
     output is literal `{{varName}}`.
   - Mixed: `\{{escaped}} {{resolved}} \{{escaped2}}` → escaped markers pass through,
     resolved marker is substituted, no warnings.
   - Multiple occurrences of the same escaped marker → all preserved, no warnings.

3. **Update `docs/agents/project-manifest/constraints.md`**  
   - Add a row to the Template Syntax table for the escape syntax:  
     `\{{varName}}` → Escaped variable marker (literal pass-through, no warning) →
     `resolveVariables()`.
   - Add a note below the table explaining that the backslash is consumed by the engine
     and does not appear in the rendered output.

## Dependencies

- None. This is a self-contained change within `src/engine/variables.ts`.

## Required Components

- `src/engine/variables.ts` — modified (existing file)
- `tests/engine/variables.test.ts` — modified (existing file)
- `docs/agents/project-manifest/constraints.md` — modified (existing file)

## Assumptions

- Persona content files that happen to contain a literal `\` immediately before `{{word}}`
  (outside of the new escape intent) will now have that backslash consumed by the engine.
  This is accepted: `\{{word}}` was previously undefined behaviour (it would produce the
  `\` character followed by a preserved `{{word}}` marker + a warning), and no existing
  test or fixture relies on that behaviour.
- The backslash character `\` is written as a single character in the Markdown source
  file on disk and is read as-is by the content loader. There is no additional escaping
  layer between the file system and the engine.

## Constraints

- The engine layer must remain zero-dependency (`src/engine/` invariant).
- The `resolveVariables()` function signature must not change (callers in
  `persona-builder.ts` pass positional arguments by convention).
- No new pipeline step may be added to `buildPersona()` for this feature.

## Out of Scope

- Escaping partial markers (`\{{> partial}}`) — partials are resolved first and the
  regex in `resolvePartials` does not match `\{{>...}}` today; a separate concern.
- Escaping conditional markers (`\{{#if...}}`/ `\{{/if}}`) — same rationale.
- A "raw block" syntax (`{{raw}}...{{/raw}}`) — unnecessary given the per-marker
  escape is sufficient for the reported use case.
- Updating the consumer persona (`ai-insights/personas/standalone/src/content/ctx-architect.md`)
  to use the escape syntax — that is a follow-on task for the ai-insights workspace after
  the library is released or linked.

## Acceptance Criteria

- `\{{variable_name}}` in a persona content template renders as `{{variable_name}}` in
  the built output file without generating a `[WARN] Unresolved variable` message.
- `{{variable_name}}` (no backslash) with the key absent from context still produces a
  warning, preserving backward compatibility.
- `{{variable_name}}` with the key present in context is still substituted normally.
- All existing `resolveVariables()` tests continue to pass unchanged.
- All new tests for the escape behaviour pass.

## Testing Strategy

The engine is fully unit-testable in isolation because it is zero-dependency. All
tests run against `resolveVariables()` directly with inline strings — no filesystem,
no build config, no plugins. Existing tests serve as a regression guard; new tests
specifically cover the escape behaviour.

## Test Plan

- `tests/engine/variables.test.ts` — *Escaped marker absent from context: no warning, literal preserved* — Acceptance criterion: no warning + literal `{{...}}` output
- `tests/engine/variables.test.ts` — *Escaped marker present in context: no substitution, no warning* — Acceptance criterion: escape prevents substitution even when key exists
- `tests/engine/variables.test.ts` — *Mixed: escaped and unescaped markers in same string* — Acceptance criterion: each marker handled by its own rule, no cross-contamination
- `tests/engine/variables.test.ts` — *Multiple occurrences of same escaped marker* — Acceptance criterion: all instances preserved, zero warnings

## Documentation Updates

- `docs/agents/project-manifest/constraints.md` — Add `\{{varName}}` row to the
  Template Syntax table and a note explaining the backslash-consumption behaviour.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Existing content files accidentally contain `\{{word}}`** | Audited: no existing fixture, persona content, or partial in the `ai-persona-builder` repository contains this pattern. The regex change will be a no-op for all current content. |
| **Backslash rendering in Markdown preview** | A lone `\` before `{{` may render invisibly in some Markdown previewers, making escaped markers look identical to unescaped ones to a human reading the source in preview mode. This is cosmetic only; the engine reads raw file content. |
| **Consumer confusion over syntax** | Mitigated by adding the escape row to `constraints.md` template syntax table, making it discoverable via the standard documentation path. |
