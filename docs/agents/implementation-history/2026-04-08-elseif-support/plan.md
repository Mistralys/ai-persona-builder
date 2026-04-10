# Plan

## Summary

Add `{{else if flag}}` support to the persona-builder template engine, enabling flat multi-branch conditionals without deep nesting. Currently, three-way branching (e.g., vscode / deep_agents / claude_code) requires nested `{{#if}}` inside `{{else}}` branches, which is verbose and hard to scan. With `{{else if}}`, the same pattern becomes a flat chain.

## Architectural Context

The change is scoped entirely to the **engine layer** of the persona-builder:

- **`src/engine/conditionals.ts`** — The sole file that implements conditional resolution. Contains one exported function `resolveConditionals(text, context)` that uses a regex-based innermost-first resolution loop. The regex matches `{{#if flag}}…{{else}}…{{/if}}` blocks. No imports (zero-dependency engine invariant).
- **`tests/engine/conditionals.test.ts`** — 74 tests covering truthy/falsy, nesting, multiline, edge cases.
- **`docs/template-syntax.md`** — User-facing template syntax documentation.
- **`docs/agents/project-manifest/api-surface.md`** — Agent manifest documenting `resolveConditionals` signature and behaviour.
- **`docs/agents/project-manifest/constraints.md`** — Template syntax table listing supported syntax.

The engine processes templates in a fixed order: partials → conditionals → variables. This change only touches the conditionals phase and does not affect the pipeline.

### Current three-way pattern (nested)

```
{{#if target_vscode}}
   VS Code content
{{else}}
{{#if target_deep_agents}}
   Deep Agents content
{{else}}
   Claude Code content
{{/if}}
{{/if}}
```

### Proposed flat pattern (with `{{else if}}`)

```
{{#if target_vscode}}
   VS Code content
{{else if target_deep_agents}}
   Deep Agents content
{{else}}
   Claude Code content
{{/if}}
```

## Approach / Architecture

**Native support in the resolve function.** Instead of a desugaring pre-pass (which would require balanced-brace tracking — effectively a mini-parser), handle `{{else if}}` directly inside the existing resolution loop:

1. **Widen the regex** to capture everything between `{{#if flag}}` and `{{/if}}` (innermost blocks only — same `noNestedIf` guard as today).
2. **In the resolve callback**, split the captured inner content on `{{else if FLAG}}` and `{{else}}` markers to produce an ordered list of `(condition, body)` pairs plus an optional fallback body.
3. **Evaluate the chain** in order: return the first truthy branch's body, or the `{{else}}` fallback, or remove the block entirely.

This works because the regex already guarantees that matched content contains no nested `{{#if` — so `{{else if}}` and `{{else}}` markers within the match are unambiguous and can be split safely.

The existing innermost-first loop continues to resolve one nesting level per pass, bubbling outward until stable. `{{else if}}` chains are simply resolved as part of each pass.

**Why native over desugaring:**
- Desugaring requires balanced-brace tracking to find the correct `{{/if}}` for inserting extra closing tags — that is a mini-parser of its own.
- Native support keeps the implementation in one place (the resolve function) with no extra pass.
- No backward compatibility concern: the `ai-insights` project is the only consumer.

## Rationale

- `{{else if}}` is a universally expected construct in template languages (Handlebars, Jinja2, Liquid, etc.).
- The current workaround — nested `{{#if}}` in `{{else}}` — works but produces visual nesting that makes templates harder to read, especially with the repetitive 3-target branching pattern used throughout the persona templates.
- Native resolution is the simplest correct implementation since the innermost-first regex guarantee makes `{{else if}}` / `{{else}}` splitting unambiguous within any matched block.

## Detailed Steps

1. **Modify the regex in `resolveConditionals()`** to capture the full inner content between `{{#if flag}}` and `{{/if}}` as a single group (instead of splitting on `{{else}}`). The `noNestedIf` guard stays — it already prevents nested `{{#if` from appearing inside the match, which also means no `{{else if` of a *nested* block can interfere.

   The updated regex pattern:
   ```
   \n*{{#if (\w+)}}(INNER){{/if}}\n*
   ```
   where `INNER` uses the existing `noNestedIf` quantifier (`(?:(?!\{\{#if\b)[\s\S])*?`).

2. **Add a `resolveChain()` helper function** (internal, not exported) that takes the captured inner content and the context, and:
   - Splits on `{{else if (\w+)}}` and `{{else}}` markers, preserving the flag names.
   - Produces an ordered list: `[{ flag: string, body: string }, ...]` + optional `elseBody: string`.
   - Evaluates the chain: returns the first truthy branch body, or the else body, or signals removal.

3. **Update the resolve callback** to delegate to `resolveChain()` instead of the current inline truthy/falsy logic. The existing two-branch `{{#if}}…{{else}}…{{/if}}` pattern is a degenerate case of the chain (one branch + optional else), so all existing behaviour is preserved.

4. **Write unit tests** in `tests/engine/conditionals.test.ts`:
   - Basic `{{#if a}}…{{else if b}}…{{/if}}` — truthy first branch.
   - Basic `{{#if a}}…{{else if b}}…{{/if}}` — truthy second branch.
   - Basic `{{#if a}}…{{else if b}}…{{/if}}` — both falsy (removed).
   - Three-branch chain with fallback: `{{#if a}}…{{else if b}}…{{else}}…{{/if}}`.
   - Four-branch chain: `{{#if a}}…{{else if b}}…{{else if c}}…{{else}}…{{/if}}`.
   - `{{else if}}` nested inside a larger `{{#if}}…{{else}}…{{/if}}` block.
   - `{{else if}}` with multiline content in each branch.
   - Mixed syntax: `{{else if}}` and traditional nested `{{#if}}` in the same template.
   - Verify that all 74 existing tests pass unchanged (regression).

5. **Update documentation:**
   - `docs/template-syntax.md` — Add `{{else if}}` syntax section with examples.
   - `docs/agents/project-manifest/constraints.md` — Update the Template Syntax table to include `{{else if flag}}`.
   - `docs/agents/project-manifest/api-surface.md` — Update `resolveConditionals` doc to mention `{{else if}}` support.

6. **Update CHANGELOG.md** with a new entry.

## Dependencies

- None. This is a self-contained change within the engine layer.

## Required Components

- `src/engine/conditionals.ts` — Modified (update regex, add `resolveChain()` helper, update resolve callback)
- `tests/engine/conditionals.test.ts` — Modified (add new test cases)
- `docs/template-syntax.md` — Modified
- `docs/agents/project-manifest/constraints.md` — Modified
- `docs/agents/project-manifest/api-surface.md` — Modified
- `CHANGELOG.md` — Modified

## Assumptions

- `{{else if FLAG}}` is the only syntax to support (not `{{elseif FLAG}}` or `{{elif FLAG}}`). This matches Handlebars convention, which is the closest template language the existing syntax resembles.
- Whitespace handling for `{{else if}}` follows the same rules as `{{else}}`.
- The nested `{{#if}}` inside `{{else}}` pattern will continue to work (the chain parser simply won't encounter `{{else if}}` markers in those cases, falling back to the same two-branch logic), but there is no requirement to maintain it — template authors can migrate to `{{else if}}` freely.

## Constraints

- The zero-dependency engine invariant must be preserved — all new code in `src/engine/conditionals.ts` must be pure with no imports.
- Processing order (partials → conditionals → variables) is unchanged.

## Out of Scope

- Negative conditionals (`{{#unless}}`).
- Comparison operators (`{{#if a == b}}`).
- Refactoring existing persona templates to use the new syntax (that can be done as a follow-up in the `ai-insights` workspace).
- `{{elseif}}` or `{{elif}}` as alternative spellings.

## Acceptance Criteria

- `{{#if a}}A{{else if b}}B{{else}}C{{/if}}` resolves correctly for all truth-table combinations.
- Multi-level chains (`{{else if b}}…{{else if c}}…{{else if d}}…`) work correctly.
- All 236 existing tests pass without modification.
- New tests cover the cases listed in step 4.
- `docs/template-syntax.md` documents the new syntax with examples.
- Manifest documents (`constraints.md`, `api-surface.md`) are updated.

## Testing Strategy

Unit tests in `tests/engine/conditionals.test.ts` cover:
1. End-to-end `resolveConditionals()` with `{{else if}}` syntax across all branch truth-table combinations.
2. Regression: all 74 existing tests pass unchanged.
3. Edge cases: empty branches, multiline content, mixed nested + flat syntax, `{{else if}}` inside an outer `{{else}}` branch.

Run: `npm test` in the `ai-persona-builder-DEV` workspace.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Regex change breaks existing two-branch resolution** | The chain parser treats `{{#if}}…{{else}}…{{/if}}` as a one-branch chain with a fallback — functionally identical to today. All 74 existing tests validate this. |
| **`{{else if}}` confused with `{{else}}` inside nested blocks** | The `noNestedIf` guard ensures matched content has no nested `{{#if` (and thus no `{{else if` from a deeper block). Splitting is unambiguous within any single match. |
| **Whitespace differences between `{{else if}}` and equivalent nested form** | Tests compare output of both syntaxes to verify identical results. |
