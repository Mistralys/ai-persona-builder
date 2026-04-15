# Key Data Flows

## 1. Full Build Pipeline (`build()`)

The main `build(config)` entry point orchestrates the entire pipeline:

```
build(config)
  │
  ├─ Pre-scan: buildAgentNameMap(config)
  │     │
  │     ├─ For each suite in config.suites:
  │     │     ├─ Load _shared.yaml → default_version fallback
  │     │     ├─ Discover persona YAML files
  │     │     └─ For each persona:
  │     │           key   = "agent_" + slug (hyphens → underscores)     → "<name> v<version>"
  │     │           key   = "agent_slug_" + slug (hyphens → underscores) → slug (hyphens preserved)
  │     └─ Return agentMap: Record<string, string>
  │
  ├─ For each suite in config.suites:
  │     │
  │     ├─ buildSuite(suiteName, suiteConfig, config, plugins, agentMap)
  │     │     │
  │     │     ├─ Load _shared.yaml → sharedMeta
  │     │     ├─ Load partials (BuildConfig.partials → shared → suite-local overlay) → partialsMap
  │     │     ├─ Run onSuiteInit hooks on all plugins
  │     │     ├─ Run onPartials hooks on all plugins (accumulating partialsMap)
  │     │     ├─ Discover persona YAML files (meta/*.yaml, excluding _*.yaml)
  │     │     │
  │     │     └─ For each persona × each target:
  │     │           │
  │     │           └─ buildPersona(yamlPath, …, target, agentMap)
  │     │                 │
  │     │                 ├─ 1. Load persona YAML → personaMeta
  │     │                 ├─ 2. Merge context (BuildConfig.variables → SuiteConfig.variables →
  │     │                 │      sharedMeta → personaMeta → derived fields → agentMap → target flags)
  │     │                 ├─ 3. Run onBuildContext hooks (context accumulation)
  │     │                 ├─ 4. Run onPersonaPartials hooks (per-persona partials accumulation;
                 │      a shallow copy of partialsMap is created before the first hook
                 │      so that persona-level overrides are isolated per persona)
  │     │                 ├─ 5. Resolve frontmatter template (plugin → config → default)
  │     │                 ├─ 6. Render frontmatter (conditionals → variables)
  │     │                 ├─ 7. Load content template (.md file)
  │     │                 ├─ 8. Render body:
  │     │                 │     ├─ resolvePartials (depth-2 recursion)
  │     │                 │     ├─ [PLANNED] onPreRender hooks — fires here, after partials but before
  │     │                 │     │   conditionals/variables (raw template still intact; inspection-only)
  │     │                 │     ├─ resolveConditionals
  │     │                 │     ├─ resolveVariables
  │     │                 │     ├─ collapseBlankLines
  │     │                 │     └─ ensureBlankLineBeforeHeadings
  │     │                 ├─ 9. Assemble output (frontmatter + body)
  │     │                 ├─ 10. Run onPostRender hooks (output chain)
  │     │                 ├─ 11. Run onValidate hooks + validateSubagentRefs() (collect ValidationResults)
  │     │                 ├─ 12. Determine output path (vs_file_name / cc_file_name)
  │     │                 └─ 13. Write file (unless check mode)
  │     │
  │     └─ Collect BuildResult[]
  │
  ├─ Aggregate results → BuildSummary
  ├─ If strict: check for error/warning ValidationResults → strictFailures
  └─ Return BuildSummary
```

## 2. Context Merge Order

Template variables are resolved from a merged context object. Later values win:

```
0.   BuildConfig.variables       (global defaults — lowest priority)
   ↓ overridden by
0.5. SuiteConfig.variables       (suite-level defaults)
   ↓ overridden by
1. _shared.yaml defaults         (suite-level base)
   ↓ overridden by
2. Per-persona YAML fields       (persona-specific values)
   ↓ augmented by
3. Derived convenience fields    (version, tools_list, cc_file_name_stem, etc.)
   ↓ augmented by
4. Cross-suite agent name map    (agent_* keys — non-overriding: only injected when not already present;
   |                              explicit YAML values always win)
   ↓ augmented by
5. Plugin onBuildContext hooks    (each plugin mutates/extends context)
```

### Derived Fields (auto-computed)

| Field | Source | Condition |
|-------|--------|-----------|
| `version` | `personaMeta.version` → `sharedMeta.default_version` → `'0.0.0'` | Always |
| `tools_list` | `serializeToolsList(tools)` | Always |
| `tools_json` | `serializeTools(tools)` | Always |
| `cc_tools_list` | `serializeToolsList(cc_tools ?? tools)` | Always |
| `cc_tools_json` | `serializeTools(cc_tools ?? tools)` | Always |
| `cc_file_name_stem` | `cc_file_name` with `.md` extension stripped | Always |
| `da_file_name_stem` | `da_file_name` with `.md` extension stripped | Only when `da_file_name` is set |
| `da_tools_list` | `serializeToolsList(da_tools ?? tools)` | Only when `da_file_name` is set |
| `da_tools_json` | `serializeTools(da_tools ?? tools)` | Only when `da_file_name` is set |
| `agent_<slug>` | `"<name> v<version>"` for every persona across all suites; slug hyphens → underscores in key | Always |
| `agent_slug_<slug>` | Raw hyphenated slug string for every persona; key uses underscores, value preserves hyphens | Always |

Derived fields are only set when not already present in the merged context — explicit YAML values always win.

> **`da_*` gate:** The `da_file_name_stem`, `da_tools_list`, and `da_tools_json` fields are
> gated on `da_file_name` being present in the merged context. Personas without `da_file_name`
> will not have these fields injected (no error, no empty string). This differs from the
> `cc_*` equivalents which are always emitted unconditionally.

## 3. Frontmatter Template Precedence

```
Plugin frontmatterTemplates     (first registered plugin with target key wins)
   ↓ fallback
BuildConfig.frontmatter         (config-level override)
   ↓ fallback
Library defaults                (DEFAULT_FRONTMATTER_VSCODE / DEFAULT_FRONTMATTER_CLAUDE_CODE)
```

## 4. Partials Resolution

```
0. BuildConfig.partials          (inline map — lowest priority)
   ↓ overlaid by
1. Shared partials dir (sharedPartialsDir)
   ↓ overlaid by (suite-local overrides shared on name collision)
2. Suite-local partials dir (srcDir/partials/)
   ↓ result: Combined partialsMap passed to plugin hooks
3. onPartials hooks              (runPartials — once per suite, after step 2; highest suite-level priority)
   ↓ result: Suite-level partialsMap (shallow-copied per persona before step 4)
4. onPersonaPartials hooks       (runPersonaPartials — per persona × target, after onBuildContext)
   ↓ result: Persona-scoped partialsMap (isolated per persona)
5. resolvePartials(template, partialsMap)  ← depth-2 recursion
```

## 5. Plugin Hook Execution Order

Per persona, hooks fire in this order:

```
1. onSuiteInit(suite, sharedMeta)                          ← once per suite (before any persona)
2. onPartials(partialsMap, suiteName, suite)                ← once per suite (after partials loaded)
3. onBuildContext(context, persona, suite)                  ← per persona, before rendering
4. onPersonaPartials(partialsMap, persona, context, suite)  ← per persona, before rendering (after onBuildContext)
5. onPostRender(output, persona, target)                    ← per persona, after rendering
6. onValidate(persona, suite, target?)                      ← per persona, after post-render
```

Within each hook, plugins are invoked in **registration order** (array index in `config.plugins`).

- `onBuildContext`, `onPartials`, `onPersonaPartials`, and `onPostRender` are **accumulating** — each plugin receives the prior plugin's output.
- `onValidate` is **collecting** — results are concatenated into a flat array.

## 6. CLI Flow

```
persona-build [flags]
  │
  ├─ Parse args (--config, --check, --strict, --help, --version)
  ├─ Load config file (dynamic import: .js ESM / .cjs / .json)
  ├─ Merge CLI flags into BuildConfig
  ├─ Call build(config)
  ├─ Report results to stdout
  └─ Exit code: 0 (success) or 1 (strict failure)
```

## 7. Output File Naming

```
For each persona × target:
  1. Check context[filenameContextKey]:
       VS Code target      → context['vs_file_name']
       Claude Code target  → context['cc_file_name']
       Deep Agents target  → context['da_file_name']
       Custom target       → context[TargetDefinition.filenameContextKey] (if defined)
  2. If present → use as the output basename
  3. If absent  → fall back to content filename (persona-name.md)
  4. Output path = outputDir / basename
```
