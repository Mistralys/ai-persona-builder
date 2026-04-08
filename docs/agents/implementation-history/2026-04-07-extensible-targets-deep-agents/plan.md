# Plan: Extensible Target Types & Deep Agents Target

## Summary

Refactor the persona-builder's target system from a hardcoded two-value
union type (`'vscode' | 'claude-code'`) to an extensible, registry-based
architecture that supports arbitrary target types. Then add a new built-in
`'deep-agents'` target type for LangGraph Deep Agents consumers. The
refactor eliminates all hardcoded ternary branches on target literals and
replaces them with a `TargetDefinition` registry that maps each target to
its output directory field, filename context key, default frontmatter
template, and auto-injected context variables.

On the ai-insights side, adopt the new `'deep-agents'` target to generate
orchestrator-specific persona files that use Deep Agents' native `task`
tool for subagent invocation, and wire the orchestrator to load these
purpose-built personas instead of reusing Claude Code output.

## Architectural Context

### persona-builder (library)

The current target system is hardcoded across five files:

| File | Hardcoded Usage |
|------|-----------------|
| `src/plugins/types.ts` (L23) | `TargetType = 'vscode' \| 'claude-code'` — canonical type |
| `src/plugins/types.ts` (L58–60) | `SuiteConfig.outVscode` / `.outClaudeCode` — named output dirs |
| `src/builders/frontmatter.ts` (L93) | Ternary fallback: `target === 'vscode' ? ... : ...` |
| `src/builders/persona-builder.ts` (L322) | Output dir: `target === 'vscode' ? outVscode : outClaudeCode` |
| `src/builders/persona-builder.ts` (L326–329) | Filename: `vs_file_name` / `cc_file_name` branching |
| `src/builders/types.ts` (L57, 79, 93) | Inline literal unions in `BuildConfig` and `BuildResult` |
| `src/builders/persona-builder.ts` (L454) | Default targets: `['vscode', 'claude-code']` |

Adding a third target today requires touching all of these plus updating
`SuiteConfig` with a new `outXyz` property — a clear violation of
open/closed principle.

### ai-insights (consumer)

The orchestrator currently reuses Claude Code personas from
`personas/ledger/claude-code/`. The PM persona references Claude Code's
`Task` tool for subagent invocation, but Deep Agents' built-in tool is
`task` with a different calling convention: it requires a `subagent`
parameter matching a registered subagent name, not a description string.

The `PERSONA_FILES` dict in `orchestrator/src/config.py` is derived from
`shared/workflow-manifest.json` role entries' `persona_file` field, all
currently pointing to `personas/ledger/claude-code/`.

The orchestrator's node factory in `orchestrator/src/nodes/__init__.py`
calls `create_deep_agent()` without a `subagents` parameter — subagent
delegation is not wired.

## Approach / Architecture

### Phase 1: Extensible target system (persona-builder)

Replace the hardcoded `TargetType` union with a registry pattern:

```ts
interface TargetDefinition {
  name: string;                          // e.g. 'vscode', 'claude-code', 'deep-agents'
  outputDirKey: string;                  // SuiteConfig key for output path
  filenameContextKey?: string;           // Context field for custom filename (e.g. 'vs_file_name')
  defaultFrontmatter: string;            // Default frontmatter template
  contextFlags?: Record<string, unknown>;// Auto-injected context variables
}
```

A `TargetRegistry` holds the built-in targets and allows consumers to
register custom ones. `SuiteConfig` gains a generic `outputDirs` map
alongside deprecation shims for `outVscode` / `outClaudeCode`. All
ternary branches on target literals are replaced with registry lookups.

### Phase 2: Built-in `'deep-agents'` target (persona-builder)

Register a third built-in target:

```ts
{
  name: 'deep-agents',
  outputDirKey: 'deep-agents',
  filenameContextKey: 'da_file_name',
  defaultFrontmatter: DEFAULT_FRONTMATTER_DEEP_AGENTS,
  contextFlags: { target_deep_agents: true },
}
```

The default frontmatter for deep-agents is minimal (no IDE-specific YAML
fields — the persona content is loaded as a plain `system_prompt` string
by Deep Agents consumers).

### Phase 3: ai-insights adoption

- Add `'deep-agents'` to the build targets and configure output
  directories.
- Add `{{#if target_deep_agents}}` branches in persona templates that
  reference subagent invocation (PM initially).
- Add `da_file_name` metadata fields to persona YAMLs.
- Update the orchestrator to read from the new output directory and pass
  `subagents` definitions to `create_deep_agent()`.

## Rationale

- **Registry over union types**: A registry is the standard pattern for
  extensibility without source modification. Consumers can add targets
  (e.g., `'cursor'`, `'windsurf'`) without forking the library.
- **Backwards compatibility**: The two existing targets remain as built-in
  registrations. `SuiteConfig.outVscode` / `.outClaudeCode` are preserved
  as deprecated aliases for `outputDirs['vscode']` /
  `outputDirs['claude-code']`.
- **`'deep-agents'` as a library-level target**: Deep Agents is a
  general-purpose LangGraph framework, not specific to ai-insights. Other
  persona-builder consumers may need the same target.
- **Slug-based agent names**: Deep Agents' `task` tool requires `subagent`
  to match the registered subagent `name`. Using slugs (e.g.,
  `"wp-decomposer"`) is natural — the persona-builder already computes
  slugs for cross-suite agent maps.

## Detailed Steps

### Phase 1: Extensible target system (persona-builder)

1. **Define `TargetDefinition` interface** in `src/plugins/types.ts`:
   ```ts
   export interface TargetDefinition {
     name: string;
     outputDirKey: string;
     filenameContextKey?: string;
     defaultFrontmatter: string;
     contextFlags?: Record<string, unknown>;
   }
   ```

2. **Create `src/targets/` module** with:
   - `types.ts` — `TargetDefinition` (re-exported from plugins/types.ts)
   - `registry.ts` — `TargetRegistry` class:
     - `register(def: TargetDefinition): void`
     - `get(name: string): TargetDefinition`
     - `has(name: string): boolean`
     - `names(): string[]`
     - `getOutputDir(name: string, suite: SuiteConfig): string`
     - `getFilenameKey(name: string): string | undefined`
     - `getDefaultFrontmatter(name: string): string`
     - `getContextFlags(name: string): Record<string, unknown>`
   - `built-in.ts` — registers `'vscode'` and `'claude-code'` with their
     current defaults; exported as `defaultRegistry`.
   - `index.ts` — barrel export.

3. **Refactor `TargetType`** in `src/plugins/types.ts`:
   ```ts
   // Keep as a type alias for backwards compatibility, but widen it.
   export type TargetType = string;
   
   // Well-known target constants for type-safe references.
   export const TARGET_VSCODE = 'vscode' as const;
   export const TARGET_CLAUDE_CODE = 'claude-code' as const;
   export const TARGET_DEEP_AGENTS = 'deep-agents' as const;
   ```

4. **Refactor `SuiteConfig`** in `src/plugins/types.ts`:
   ```ts
   export interface SuiteConfig {
     srcDir: string;
     /** Generic output directory map: target name → output path */
     outputDirs?: Record<string, string>;
     /** @deprecated Use outputDirs['vscode']. Kept for backwards compat. */
     outVscode?: string;
     /** @deprecated Use outputDirs['claude-code']. Kept for backwards compat. */
     outClaudeCode?: string;
     personaMode?: string;
     partialsSubdir?: string;
     metaSubdir?: string;
     contentSubdir?: string;
   }
   ```
   Add a resolution function that merges deprecated fields into
   `outputDirs` at build time.

5. **Refactor `BuildConfig`** in `src/builders/types.ts`:
   ```ts
   export interface BuildConfig {
     suites: Record<string, SuiteConfig>;
     sharedPartialsDir?: string;
     plugins?: PersonaBuildPlugin[];
     targets?: string[];                              // was Array<'vscode' | 'claude-code'>
     check?: boolean;
     strict?: boolean;
     frontmatter?: Partial<Record<string, string>>;   // was Record<'vscode' | 'claude-code', string>
     targetRegistry?: TargetRegistry;                  // optional custom registry
   }
   ```

6. **Refactor `BuildResult.target`** in `src/builders/types.ts`:
   Change from `'vscode' | 'claude-code'` to `string`.

7. **Refactor `resolveFrontmatterTemplate()`** in
   `src/builders/frontmatter.ts`:
   - Accept a `TargetRegistry` parameter (or the resolved
     `TargetDefinition`).
   - Replace the hardcoded ternary fallback with
     `registry.getDefaultFrontmatter(target)`.

8. **Refactor output directory resolution** in
   `src/builders/persona-builder.ts` (line 322):
   Replace `target === 'vscode' ? outVscode : outClaudeCode` with
   `registry.getOutputDir(target, suiteConfig)`.

9. **Refactor filename resolution** in
   `src/builders/persona-builder.ts` (lines 326–329):
   Replace the if/else chain with:
   ```ts
   const fnKey = registry.getFilenameKey(target);
   if (fnKey && typeof context[fnKey] === 'string') {
     outputBasename = context[fnKey] as string;
   } else {
     outputBasename = contentBasename;
   }
   ```

10. **Inject target context flags** in `buildContext()`:
    After the agentMap merge, inject flags from the registry:
    ```ts
    const flags = registry.getContextFlags(target);
    for (const [key, value] of Object.entries(flags)) {
      merged[key] = value;
    }
    ```
    This supersedes the bug-fix plan's manual flag injection with a
    registry-driven approach. (If the bug-fix plan is implemented first,
    this step replaces that logic.)

11. **Refactor default targets** in `build()` (line 454):
    Replace `['vscode', 'claude-code']` with `registry.names()`.

12. **Update all inline type annotations** that use
    `'vscode' | 'claude-code'` to use `TargetType` (now `string`) or the
    named constants.

13. **Extend `buildAgentNameMap()`** to also emit slug-based keys:
    Currently it emits `agent_<slug>` → `"Name vX.Y.Z"` (display name).
    Add a parallel key `agent_slug_<slug>` → `"slug"` (machine name).
    This gives templates access to both forms:
    - `{{agent_wp_decomposer}}` → `"WP Decomposer v1.0.0"` (for VS Code /
      Claude Code display)
    - `{{agent_slug_wp_decomposer}}` → `"wp-decomposer"` (for Deep Agents
      `task(subagent=...)`)

14. **Add tests**:
    - Registry: register/get/has, custom target, output dir resolution.
    - Build pipeline: custom target produces output in the correct
      directory with correct filename and frontmatter.
    - Context flags: custom target's flags appear in rendered output.
    - Backwards compat: `outVscode` / `outClaudeCode` still work.

15. **Update documentation**:
    - `docs/configuration.md`: document `outputDirs`, deprecate
      `outVscode` / `outClaudeCode`.
    - `docs/template-syntax.md`: document `target_<name>` flags and
      `agent_slug_<slug>` variables.
    - `docs/plugins.md`: document registry and custom target registration.
    - `docs/agents/project-manifest/api-surface.md`: full API update.
    - `docs/agents/project-manifest/constraints.md`: update target
      constraints.
    - `docs/agents/project-manifest/data-flows.md`: update build flow.
    - `CHANGELOG.md`: document breaking changes (type widening).

### Phase 2: Built-in `'deep-agents'` target (persona-builder)

16. **Define `DEFAULT_FRONTMATTER_DEEP_AGENTS`** in
    `src/builders/frontmatter.ts`:
    ```ts
    export const DEFAULT_FRONTMATTER_DEEP_AGENTS = `---
    name: {{da_file_name_stem}}
    description: '{{description}}'
    model: {{da_model}}
    ---`;
    ```
    Deep Agents personas are loaded as plain Markdown files by consumers.
    The frontmatter serves as metadata for the build system and consumer
    tooling (e.g., orchestrator persona loader), not for IDE integration.
    Keep it minimal.

17. **Register `'deep-agents'` as a built-in target** in
    `src/targets/built-in.ts`:
    ```ts
    registry.register({
      name: 'deep-agents',
      outputDirKey: 'deep-agents',
      filenameContextKey: 'da_file_name',
      defaultFrontmatter: DEFAULT_FRONTMATTER_DEEP_AGENTS,
      contextFlags: { target_deep_agents: true },
    });
    ```

18. **Add `da_*` computed convenience fields** in `buildContext()`
    (parallel to existing `cc_*` fields):
    - `da_file_name_stem` — derived from `da_file_name` (strip `.md`).
    - `da_model` — default from `_shared.yaml` or persona YAML.

19. **Add tests** for deep-agents target: frontmatter rendering, output
    path, filename resolution, context flags.

20. **Document** the deep-agents target in `docs/configuration.md` and
    `docs/template-syntax.md`.

### Phase 3: ai-insights adoption

21. **Add `'deep-agents'` target to `persona-build.config.js`**:
    ```js
    targets: ['vscode', 'claude-code', 'deep-agents'],
    suites: {
      ledger: {
        srcDir: ...,
        outputDirs: {
          'vscode':     path.join(ROOT, 'personas', 'ledger', 'vs-code'),
          'claude-code': path.join(ROOT, 'personas', 'ledger', 'claude-code'),
          'deep-agents': path.join(ROOT, 'personas', 'ledger', 'deep-agents'),
        },
        // Keep outVscode/outClaudeCode for transition if needed
      },
      standalone: {
        srcDir: ...,
        outputDirs: {
          'vscode':      path.join(ROOT, 'personas', 'standalone', 'vs-code'),
          'claude-code':  path.join(ROOT, 'personas', 'standalone', 'claude-code'),
          'deep-agents':  path.join(ROOT, 'personas', 'standalone', 'deep-agents'),
        },
      },
    },
    ```

22. **Add `da_file_name` to persona YAML metadata** for all ledger and
    standalone personas. Convention: same as `cc_file_name` (e.g.,
    `2-project-manager.md`).

23. **Add `{{#if target_deep_agents}}` branches** in persona templates
    that reference subagent invocation. Start with the PM persona
    (`personas/ledger/src/content/2-project-manager.md`):
    ```handlebars
    {{#if target_vscode}}
       Invoke `runSubagent` with agentName: "{{agent_wp_decomposer}}"
    {{else}}
       {{#if target_deep_agents}}
       Use the `task` tool with:
       - `subagent`: `"{{agent_slug_wp_decomposer}}"`
       - `task`: the full plan document content, project name, and
         any explicit scope/phasing notes
       {{else}}
       Use the `Task` tool with `description: Use the custom agent
       "{{agent_wp_decomposer}}"`.
       {{/if}}
    {{/if}}
    ```
    Repeat for all four subagent invocations (steps 3–6).

24. **Add deep-agents preflight partials** (or conditional no-op):
    The deep-agents target does not need IDE preflight checks. Add a
    `{{#if target_deep_agents}}` guard in the preflight conditional block,
    or create a no-op partial `mcp-preflight-header-deep-agents`.

25. **Update `shared/workflow-manifest.json`** to add a
    `persona_file_deep_agents` field (or rename `persona_file` to a map)
    for each role, pointing to `personas/ledger/deep-agents/<file>.md`.

26. **Update orchestrator `PERSONA_FILES`** in
    `orchestrator/src/config.py` to read from the new deep-agents
    persona file paths in the manifest.

27. **Wire subagent loading in the orchestrator node factory**
    (`orchestrator/src/nodes/__init__.py`):
    - For the PM stage (and any future stages needing subagents), load
      standalone deep-agents personas as subagent definitions.
    - Build the `subagents` list as dicts:
      ```python
      subagents = [
          {
              "name": "wp-decomposer",
              "description": "Decompose plan into work packages",
              "system_prompt": load_standalone_persona("wp-decomposer"),
              "tools": [],  # Inherit parent tools
          },
          # ... dependency-sequencer, pipeline-configurator, ledger-bootstrapper
      ]
      ```
    - Pass `subagents=subagents` to `create_deep_agent()`.
    - Only the Ledger Bootstrapper subagent needs MCP tools — pass the
      wrapped MCP tools to it specifically.

28. **Add orchestrator config for subagent personas**: Define which
    stages get which subagents. This could be a new dict in `config.py`
    or derived from the workflow manifest.

29. **Build and validate**: Run `npm run build-personas` and verify:
    - `personas/ledger/deep-agents/` contains 9 persona files.
    - `personas/standalone/deep-agents/` contains standalone files.
    - PM deep-agents persona references `task` tool with slug-based
      subagent names.

30. **Update ai-insights documentation**:
    - `personas/docs/agents/project-manifest/constraints.md`: add
      deep-agents target conventions.
    - `personas/docs/agents/project-manifest/data-flows.md`: add
      deep-agents build flow.
    - `orchestrator/docs/agents/project-manifest/constraints.md`: update
      persona loading docs.
    - Root `AGENTS.md`: update cross-system dependencies table with
      deep-agents persona file paths.

## Dependencies

- Phase 1 has no external dependencies.
- Phase 2 depends on Phase 1 (registry must exist).
- Phase 3 depends on Phase 2 (deep-agents target must be available) and
  requires the persona-builder to be published/linked before ai-insights
  can consume it.
- The target variable injection bug fix (separate plan) should ideally be
  implemented first, as Phase 1 Step 10 supersedes it with a
  registry-driven approach. If both plans are executed sequentially, the
  bug fix can be merged first and then refactored in Phase 1.

## Required Components

### persona-builder (new)
- `src/targets/types.ts` — `TargetDefinition` interface
- `src/targets/registry.ts` — `TargetRegistry` class
- `src/targets/built-in.ts` — default registrations
- `src/targets/index.ts` — barrel export

### persona-builder (modified)
- `src/plugins/types.ts` — `TargetType`, `SuiteConfig`
- `src/builders/types.ts` — `BuildConfig`, `BuildResult`
- `src/builders/frontmatter.ts` — `resolveFrontmatterTemplate()`,
  `DEFAULT_FRONTMATTER_DEEP_AGENTS`
- `src/builders/persona-builder.ts` — `buildContext()`, `buildPersona()`,
  `build()`, `buildAgentNameMap()`
- `src/plugins/runner.ts` — `runBuildContext()` signature
- `src/index.ts` — re-export targets module
- `tests/` — new and updated tests
- `docs/` — configuration, template-syntax, plugins, project-manifest

### ai-insights (modified)
- `personas/persona-build.config.js` — add deep-agents target + output dirs
- `personas/ledger/src/content/2-project-manager.md` — deep-agents branch
- `personas/ledger/src/meta/*.yaml` — add `da_file_name` fields
- `personas/standalone/src/meta/*.yaml` — add `da_file_name` fields
- `shared/workflow-manifest.json` — deep-agents persona file paths
- `orchestrator/src/config.py` — update `PERSONA_FILES` derivation
- `orchestrator/src/nodes/__init__.py` — wire subagent loading
- Various docs

### ai-insights (new)
- `personas/ledger/deep-agents/` — generated output directory
- `personas/standalone/deep-agents/` — generated output directory

## Assumptions

- The `TargetRegistry` is instantiated once per `build()` call (not
  global/singleton) to avoid cross-test contamination. The default
  registry includes the three built-in targets; consumers can extend it
  via `BuildConfig.targetRegistry`.
- Deep Agents personas do not need IDE-specific frontmatter fields
  (permissions, memory, etc.) — those are runtime concerns of the
  orchestrator, not the persona file format.
- The orchestrator will strip frontmatter before passing persona content
  as `system_prompt` to `create_deep_agent()`, or Deep Agents ignores
  YAML frontmatter in system prompts (to be verified).
- Slug-based agent names (`agent_slug_<slug>` variables) are acceptable
  for the `task(subagent=...)` parameter.

## Constraints

- **Backwards compatibility is mandatory.** `outVscode` / `outClaudeCode`
  in `SuiteConfig` must continue to work (deprecated but functional).
  Existing configs without `outputDirs` must build without changes.
- **No new npm production dependencies** in persona-builder.
- **Cross-platform**: all path handling via `path.join()` / `pathlib`.
- **Deep Agents is not an ai-insights concept**: the `'deep-agents'`
  target name and its built-in definition must be generic — no references
  to ledgers, orchestrators, or ai-insights in the persona-builder
  library.

## Out of Scope

- Adding subagent support to non-PM personas (future work, same pattern).
- MCP tool subsetting per subagent (the Ledger Bootstrapper needs MCP
  tools, others don't — this is orchestrator-side config, not a persona
  concern).
- Deep Agents async subagent support.
- Persona-builder CLI changes for target selection (currently config-only;
  CLI target parsing can be added later).
- Deprecation removal of `outVscode` / `outClaudeCode` (that is a future
  major version concern).

## Acceptance Criteria

- `TargetType` is `string`, not a closed union. Well-known constants
  (`TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, `TARGET_DEEP_AGENTS`) are
  exported for type-safe references.
- A consumer can register a custom target via `BuildConfig.targetRegistry`
  without modifying persona-builder source.
- The `'deep-agents'` target is built-in and produces output with correct
  frontmatter, filenames, and directory placement.
- Building ai-insights personas with `targets: ['vscode', 'claude-code',
  'deep-agents']` produces three output directories per suite.
- The PM deep-agents persona references `task(subagent: "wp-decomposer")`
  instead of `runSubagent()` or `Task` tool.
- The orchestrator loads deep-agents personas and passes `subagents` to
  `create_deep_agent()` for the PM stage.
- All existing tests pass. No regressions in VS Code or Claude Code
  output.
- `outVscode` / `outClaudeCode` configs without `outputDirs` continue to
  work.

## Testing Strategy

### persona-builder
- **Unit**: `TargetRegistry` — register, get, has, names, duplicate
  rejection, unknown target error.
- **Unit**: `SuiteConfig` resolution — `outputDirs` takes precedence over
  deprecated fields; deprecated fields are auto-migrated.
- **Unit**: `buildContext()` — target flags injected from registry.
- **Unit**: `buildAgentNameMap()` — both display and slug keys emitted.
- **Integration**: Full build with three targets — verify output dirs,
  filenames, frontmatter, and conditional content differ per target.
- **Backwards compat**: Config using only `outVscode` / `outClaudeCode`
  (no `outputDirs`) builds successfully.

### ai-insights
- **Persona freshness**: `npm run build-personas -- --check` passes after
  regeneration.
- **Orchestrator**: Verify PM agent receives subagent definitions (unit
  test with mocked `create_deep_agent`).
- **Manifest validation**: `node scripts/validate-workflow-manifest.js`
  passes with new `persona_file_deep_agents` fields.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Type widening breaks consumer type checks** | Export well-known constants. Document migration: replace `'vscode'` literals with `TARGET_VSCODE`. |
| **`outVscode` / `outClaudeCode` deprecation confuses users** | Keep working indefinitely. Add JSDoc `@deprecated` tags. Document migration path. Only remove in a future major version. |
| **Deep Agents frontmatter format unclear** | Start minimal. The orchestrator strips frontmatter anyway; format can be extended later. |
| **Subagent tool passthrough (Ledger Bootstrapper needs MCP tools)** | Configure per-subagent tools in orchestrator config, not in persona. The persona just describes intent; the orchestrator handles tooling. |
| **Registry complexity for simple use cases** | Default registry is pre-populated; consumers who don't need custom targets never interact with it. |
| **Nested conditionals in templates** (`{{#if}}` inside `{{#else}}`) | The conditional engine already supports nesting (regex is non-greedy, matches innermost first). Verify with integration tests. |
