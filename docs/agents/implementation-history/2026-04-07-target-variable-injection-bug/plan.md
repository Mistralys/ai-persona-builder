# Plan: Fix Target Variable Injection Bug

## Summary

The persona-builder's `buildContext()` function never injects target-specific
boolean flags (`target_vscode`, `target_claude_code`) into the rendering
context, even though downstream templates rely on `{{#if target_vscode}}`
conditionals. This causes all target-conditional blocks to evaluate as
falsy — both VS Code and Claude Code builds silently render only the
`{{else}}` branch content. The fix is to pass the `target` parameter into
`buildContext()` and inject the corresponding boolean flags.

## Architectural Context

The build pipeline flows through `build()` → `buildSuite()` →
`buildPersona()` → `buildContext()`. The `target` parameter is available in
`buildPersona()` (received at
[src/builders/persona-builder.ts](src/builders/persona-builder.ts) line 279)
but is never forwarded to `buildContext()` (called at line 286).

The conditional engine in
[src/engine/conditionals.ts](src/engine/conditionals.ts) resolves
`{{#if flag}}` blocks by checking truthiness of `context[flag]` — when the
flag key is absent from context, the block evaluates as falsy.

The `onBuildContext` plugin hook
([src/plugins/types.ts](src/plugins/types.ts) lines 134–140) currently
receives `(context, persona, suite)` but **not** `target`, so plugins
cannot inject target-specific variables either.

**Affected consumer:** The `ai-insights` persona templates use
`{{#if target_vscode}}` / `{{else}}` branching extensively in the PM
persona ([personas/ledger/src/content/2-project-manager.md](../../personas/ledger/src/content/2-project-manager.md))
and in preflight header partials. Currently both targets emit Claude Code
content.

## Approach / Architecture

Inject boolean target flags directly in `buildContext()` after the context
merge, using the `target` parameter that `buildPersona()` already has.
Additionally, pass `target` to the `onBuildContext` plugin hook so plugins
can implement target-aware logic.

The fix is scoped to the persona-builder library only — no changes needed
in ai-insights. The templates already use the correct flag names; they just
never received truthy values.

## Rationale

- Minimal change: adding one parameter to `buildContext()` and two lines
  of flag injection fixes the root cause.
- Extending `onBuildContext` to receive `target` enables plugin-based
  target logic without requiring consumers to patch the library.
- No backwards-incompatibility: `onBuildContext` gains an optional fourth
  parameter; existing plugins that don't use it are unaffected.

## Detailed Steps

1. **Add `target` parameter to `buildContext()`** in
   `src/builders/persona-builder.ts` (line 187). Add it as the fourth
   parameter with type `TargetType`. After the Layer 4 (agentMap) merge,
   inject:
   ```ts
   merged[`target_${target.replace(/-/g, '_')}`] = true;
   ```
   This produces `target_vscode: true` for the `'vscode'` target and
   `target_claude_code: true` for the `'claude-code'` target. Keys for
   non-active targets remain absent (falsy in conditionals).

2. **Pass `target` to `buildContext()`** in the `buildPersona()` function
   (line 286):
   ```ts
   let context = buildContext(personaMeta, sharedMeta, agentMap, target);
   ```

3. **Extend `onBuildContext` hook signature** in
   `src/plugins/types.ts` (line 134). Add an optional fourth parameter:
   ```ts
   onBuildContext?(
     context: Record<string, unknown>,
     persona: PersonaMetadata,
     suite: SuiteConfig,
     target?: TargetType,
   ): Record<string, unknown>;
   ```

4. **Pass `target` to `runBuildContext()`** in `src/plugins/runner.ts`
   — update the signature and forward `target` to each plugin's
   `onBuildContext` call.

5. **Pass `target` to `runBuildContext()` in `buildPersona()`**
   (line 293) where it is currently called without a target argument.

6. **Add tests** in `tests/builders/`:
   - Verify `target_vscode` is `true` when building for `'vscode'`
     and absent/undefined when building for `'claude-code'`.
   - Verify `target_claude_code` is `true` when building for
     `'claude-code'` and absent/undefined when building for `'vscode'`.
   - Verify `{{#if target_vscode}}` conditional blocks resolve correctly
     in rendered output per target.
   - Verify that a plugin `onBuildContext` hook receives the `target`
     parameter.

7. **Update documentation**:
   - `docs/agents/project-manifest/api-surface.md`: document the new
     `target` parameter on `buildContext()` and `onBuildContext`.
   - `docs/template-syntax.md`: document `target_<name>` as
     auto-injected context variables.
   - `docs/plugins.md`: update `onBuildContext` signature.

## Dependencies

- None. This is self-contained within the persona-builder library.

## Required Components

- `src/builders/persona-builder.ts` — `buildContext()` and `buildPersona()`
- `src/plugins/types.ts` — `PersonaBuildPlugin.onBuildContext` signature
- `src/plugins/runner.ts` — `runBuildContext()` signature
- `tests/builders/` — new or extended test file
- `docs/template-syntax.md`
- `docs/plugins.md`
- `docs/agents/project-manifest/api-surface.md`

## Assumptions

- The naming convention `target_<name>` (with hyphens replaced by
  underscores) is acceptable. This matches the existing template usage
  (`target_vscode`, `target_claude_code`).
- Only the active target's flag is set to `true`; flags for other targets
  are not explicitly set to `false` (they remain absent from context, which
  is falsy in the conditional engine). This is consistent with how all
  other boolean flags work in the engine.

## Constraints

- The `onBuildContext` hook change must be backwards-compatible — the new
  `target` parameter must be optional.
- No new npm dependencies.

## Out of Scope

- Adding new target types (covered by the separate upgrade plan).
- Changes to ai-insights persona templates or config.
- Changes to the conditional engine itself.

## Acceptance Criteria

- Building the same persona for `'vscode'` and `'claude-code'` targets
  produces different output when the template contains
  `{{#if target_vscode}}` blocks.
- `target_vscode` is truthy in VS Code builds and absent in Claude Code
  builds (and vice versa for `target_claude_code`).
- The `onBuildContext` plugin hook receives the active target as its fourth
  argument.
- All existing tests pass without modification.
- Rebuilding ai-insights personas after upgrading the library produces
  correct VS Code output (e.g., PM persona shows `runSubagent` instead of
  `Task` tool references).

## Testing Strategy

- Unit tests on `buildContext()` output per target.
- Integration test: build a fixture persona with target-conditional content,
  verify divergent output per target.
- Plugin hook test: mock plugin that captures `onBuildContext` arguments,
  verify `target` is passed.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Existing consumers rely on the falsy-branch behaviour** | The bug means VS Code builds have been wrong; fixing it restores intended behavior. Any consumer using `{{#if target_vscode}}` wanted this to work. |
| **Plugin signature change breaks a consumer** | The parameter is optional; existing plugins accepting 3 args continue to work. |
