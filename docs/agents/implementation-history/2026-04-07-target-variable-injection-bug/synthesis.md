## Synthesis

### Completion Status
- Status: COMPLETE
- Completed by: Standalone Developer Agent

### Implementation Summary
- Added `target?: TargetType` as a fourth parameter to `buildContext()` in `src/builders/persona-builder.ts`. After the agentMap merge step, the active target's boolean flag is injected: `merged[`target_${target.replace(/-/g, '_')}`] = true`. Only the active target's flag key is set; keys for other targets remain absent (falsy in the conditional engine).
- Updated `buildPersona()` to pass `target` to both `buildContext()` and `runBuildContext()`.
- Added `target?: TargetType` as an optional fourth parameter to `onBuildContext` in `src/plugins/types.ts`, maintaining backwards compatibility with existing plugins.
- Updated `runBuildContext()` in `src/plugins/runner.ts` to accept and forward `target` to each plugin's `onBuildContext` call.
- Templates using `{{#if target_vscode}}` and `{{#if target_claude_code}}` now correctly resolve to different branches per target, fixing the root cause of the bug.

### Documentation Updates
- `docs/template-syntax.md`: Added `target_vscode` and `target_claude_code` to the built-in context variables table, plus a new "Target Flags" sub-section explaining the flag naming convention and a usage example.
- `docs/plugins.md`: Updated `PersonaBuildPlugin` interface listing to include the `target?: TargetType` fourth parameter on `onBuildContext`.
- `docs/agents/project-manifest/api-surface.md`: Updated `runBuildContext()` signature and JSDoc to include `target?`, and updated `PersonaBuildPlugin.onBuildContext` signature.

### Verification Summary
- Tests run: full suite (`npm test`) — 16 test files
- Static analysis run: TypeScript is checked as part of Vitest's transform step
- Result: **248/248 tests pass** (12 new tests added in `tests/builders/target-variable-injection.test.ts`, plus 1 existing test in `tests/plugins/plugin-runner.test.ts` updated to expect the new 4th argument)

### Code Insights
- [low] (convention) `tests/plugins/plugin-runner.test.ts` line 169: The test `passes context, persona, and suite to the plugin hook` used a 3-argument assertion that silently passed before because `toHaveBeenCalledWith` with fewer args matches any call regardless of extra args in some matchers — however Vitest's implementation treats extra args as a mismatch. The update to include `undefined` makes the assertion precise and correct.
- [low] (improvement) `src/builders/persona-builder.ts` — `buildContext()` produces `target_vscode`, `target_claude_code`, etc. from the raw target string. If additional targets are added in future, no code changes are needed — the flag naming formula handles any target identifier automatically. This is noted as an intentional design benefit.
- [low] (debt) Several claude-code builds in the test suite emit `[WARN] Unresolved variable: {{cc_permission_mode}}` etc. These stem from existing minimal test fixtures that don't include Claude Code shared metadata; they are pre-existing and unrelated to this fix.

### Additional Comments
- The `onBuildContext` hook change is fully backwards-compatible: existing plugins that omit the fourth parameter continue to work without modification.
- The `buildContext()` function now accepts `target` as optional (`target?: TargetType`) rather than required, ensuring callers that don't pass a target (e.g. hypothetical future test utilities calling `buildContext` directly) are unaffected.
