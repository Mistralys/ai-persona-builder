# Key Data Flows

## 1. Full Build Pipeline (`build()`)

The main `build(config)` entry point orchestrates the entire pipeline:

```
build(config)
  │
  ├─ For each suite in config.suites:
  │     │
  │     ├─ buildSuite(suiteName, suiteConfig, config, plugins)
  │     │     │
  │     │     ├─ Load _shared.yaml → sharedMeta
  │     │     ├─ Load partials (shared → suite-local overlay) → partialsMap
  │     │     ├─ Run onSuiteInit hooks on all plugins
  │     │     ├─ Discover persona YAML files (meta/*.yaml, excluding _*.yaml)
  │     │     │
  │     │     └─ For each persona × each target:
  │     │           │
  │     │           └─ buildPersona(yamlPath, …, target)
  │     │                 │
  │     │                 ├─ 1. Load persona YAML → personaMeta
  │     │                 ├─ 2. Merge context (sharedMeta + personaMeta + derived fields)
  │     │                 ├─ 3. Run onBuildContext hooks (context accumulation)
  │     │                 ├─ 4. Resolve frontmatter template (plugin → config → default)
  │     │                 ├─ 5. Render frontmatter (conditionals → variables)
  │     │                 ├─ 6. Load content template (.md file)
  │     │                 ├─ 7. Render body:
  │     │                 │     ├─ resolvePartials (depth-2 recursion)
  │     │                 │     ├─ resolveConditionals
  │     │                 │     ├─ resolveVariables
  │     │                 │     ├─ collapseBlankLines
  │     │                 │     └─ ensureBlankLineBeforeHeadings
  │     │                 ├─ 8. Assemble output (frontmatter + body)
  │     │                 ├─ 9. Run onPostRender hooks (output chain)
  │     │                 ├─ 10. Run onValidate hooks (collect ValidationResults)
  │     │                 ├─ 11. Determine output path (vs_file_name / cc_file_name)
  │     │                 └─ 12. Write file (unless check mode)
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
1. _shared.yaml defaults         (suite-level base)
   ↓ overridden by
2. Per-persona YAML fields       (persona-specific values)
   ↓ augmented by
3. Derived convenience fields    (version, tools_list, cc_file_name_stem, etc.)
   ↓ augmented by
4. Plugin onBuildContext hooks    (each plugin mutates/extends context)
```

### Derived Fields (auto-computed)

| Field | Source |
|-------|--------|
| `version` | `personaMeta.version` → `sharedMeta.default_version` → `'0.0.0'` |
| `tools_list` | `serializeToolsList(tools)` |
| `tools_json` | `serializeTools(tools)` |
| `cc_tools_list` | `serializeToolsList(cc_tools ?? tools)` |
| `cc_tools_json` | `serializeTools(cc_tools ?? tools)` |
| `cc_file_name_stem` | `cc_file_name` with `.md` extension stripped |

Derived fields are only set when not already present in the merged context — explicit YAML values always win.

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
Shared partials dir (sharedPartialsDir)
   ↓ merged with (suite-local overrides shared on name collision)
Suite-local partials dir (srcDir/partials/)
   ↓ result
Combined partialsMap
   ↓ used by
resolvePartials(template, partialsMap)  ← depth-2 recursion
```

## 5. Plugin Hook Execution Order

Per persona, hooks fire in this order:

```
1. onSuiteInit(suite, sharedMeta)          ← once per suite (before any persona)
2. onBuildContext(context, persona, suite)  ← per persona, before rendering
3. onPostRender(output, persona, target)   ← per persona, after rendering
4. onValidate(persona, suite, target?)     ← per persona, after post-render
```

Within each hook, plugins are invoked in **registration order** (array index in `config.plugins`).

- `onBuildContext` and `onPostRender` are **accumulating** — each plugin receives the prior plugin's output.
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
  1. Check context['vs_file_name'] (VS Code) or context['cc_file_name'] (Claude Code)
  2. If present → use as the output basename
  3. If absent  → fall back to content filename (persona-name.md)
  4. Output path = outputDir / basename
```
