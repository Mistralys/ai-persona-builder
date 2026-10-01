# Key Data Flows

## 1. Full Build Pipeline (`build()`)

The main `build(config)` entry point orchestrates the entire pipeline:

```
build(config)
  │
  ├─ Pre-scan: scanPersonas(config, registry) → agentNameMapFromIndex(index)
  │     │
  │     ├─ For each suite in config.suites:
  │     │     ├─ Load _shared.yaml → default_version fallback
  │     │     ├─ Discover persona YAML files (via persona-files.ts helpers)
  │     │     └─ For each persona:
  │     │           version = resolveChangelogMeta(persona.changelog)?.version
  │     │                     ?? sharedMeta.default_version ?? '0.0.0'
  │     │           targets = resolvePersonaTargets(persona.targets, registry, yamlPath)
  │     │                     (absent → every registered target; invalid/empty → [] + issue)
  │     │           toolParityExceptions = persona.tool_parity_exceptions ?? []
  │     │           → recorded as one PersonaIndexEntry in PersonaIndex.entries / .bySlug
  │     ├─ Return PersonaIndex: { entries, bySlug, issues }
  │     │
  │     └─ agentNameMapFromIndex(index), derived from the same PersonaIndex (single scan —
  │           cannot disagree with the per-persona target/exception data):
  │           key   = "agent_" + slug (hyphens → underscores)     → "<name> v<version>"
  │           key   = "agent_slug_" + slug (hyphens → underscores) → slug (hyphens preserved)
  │     └─ Return agentMap: Record<string, string>
  │
  ├─ For each suite in config.suites:
  │     │
  │     ├─ For each target in targets:
  │     │     │
  │     │     └─ buildSuite(suiteName, suiteConfig, config, plugins, target, agentMap, registry, personaIndex)
  │     │           │
  │     │           ├─ Load _shared.yaml → sharedMeta
  │     │           ├─ Load partials (BuildConfig.partials → shared → suite-local overlay) → partialsMap
  │     │           ├─ Run onSuiteInit hooks on all plugins
  │     │           ├─ Run onPartials hooks on all plugins (accumulating partialsMap)
  │     │           ├─ Discover persona YAML files (meta/*.yaml, excluding _*.yaml)
  │     │           ├─ Look up each YAML's resolved targets from personaIndex (self-scan this
  │     │           │   suite alone when personaIndex is omitted — a direct buildSuite() call)
  │     │           │
  │     │           └─ For each persona whose resolved targets include `target`:
  │     │                 │   (an excluded persona is skipped here — no context built, no
  │     │                 │    plugin hooks run, nothing written; build() records it in
  │     │                 │    BuildSummary.skipped)
  │     │                 │
  │     │                 └─ buildPersona(yamlPath, …, target, agentMap)
  │     │                 │
  │     │                 ├─ 1. Load persona YAML → personaMeta
  │     │                 ├─ 2. Merge context (BuildConfig.variables → SuiteConfig.variables →
  │     │                 │      sharedMeta → personaMeta → derived fields → agentMap → target flags)
  │     │                 ├─ 3. Run onBuildContext hooks (context accumulation)
  │     │                 ├─ 4. Run onPersonaPartials hooks (per-persona partials accumulation;
  │     │                 │      a shallow copy of partialsMap is created before the first hook
  │     │                 │      so that persona-level overrides are isolated per persona), then
  │     │                 │      stripComments() every entry of the resulting map into a second,
  │     │                 │      stripped copy used for rendering and for the tool-requirement scan
  │     │                 │      (step 11) — covers config-, shared-, suite-, and plugin-injected
  │     │                 │      partials alike, since this is their last shared mutation point
  │     │                 ├─ 5. Resolve frontmatter template (plugin → config → default)
  │     │                 ├─ 6. Render frontmatter (stripComments → resolveConditionals → resolveVariables)
  │     │                 ├─ 7. Load content template (.md file), then stripComments() it immediately —
  │     │                 │      before the raw-template tool-requirement scan (step 11) ever sees it
  │     │                 ├─ 8. Render body:
  │     │                 │     ├─ resolvePartials (depth-2 recursion, using the stripped partials map)
  │     │                 │     ├─ [PLANNED] onPreRender hooks — fires here, after partials but before
  │     │                 │     │   conditionals/variables (raw template still intact; inspection-only)
  │     │                 │     ├─ resolveConditionals
  │     │                 │     ├─ resolveVariables
  │     │                 │     ├─ collapseBlankLines
  │     │                 │     └─ ensureBlankLineBeforeHeadings
  │     │                 ├─ 9. Assemble output (frontmatter + body)
  │     │                 ├─ 10. Run onPostRender hooks (output chain)
  │     │                 ├─ 11. Run onValidate hooks + validateSubagentRefs() + validateToolRequirements()
  │     │                 │      (when target has a registered TargetDefinition) — collect
  │     │                 │      ValidationResults; also resolves effectiveTools via resolveTargetTools()
  │     │                 │      onto BuildResult
  │     │                 ├─ 12. Determine output path (vs_file_name / cc_file_name)
  │     │                 └─ 13. Write file (unless check mode)
  │     │
  │     └─ Collect BuildResult[] (filtered — excluded personas already skipped, not just omitted)
  │
  ├─ Capability-parity post-pass (validateToolParity(), src/validators/tool-parity-validator.ts):
  │     ├─ Group all collected BuildResult[] by personaYamlPath
  │     ├─ For each group, keep only results whose target has a registered TargetDefinition
  │     │   (a capability map to resolve against) and a defined effectiveTools
  │     ├─ resolveCapabilities(effectiveTools, definition) for each surviving result →
  │     │   one TargetCapabilitySet per target
  │     ├─ validateToolParity(personaLabel, perTarget, toolParityExceptions) — a persona
  │     │   with < 2 surviving TargetCapabilitySets yields no findings
  │     └─ Append each returned ToolParityFinding.result to its target's own
  │         BuildResult.validationResults — before strictFailures is computed, so parity
  │         errors participate in both the default (non-strict) and `strict: true` failure paths
  │
  ├─ Aggregate results → BuildSummary
  │     ├─ skipped: for each PersonaIndexEntry × active target where target ∉ entry.targets,
  │     │   push { suite, target, personaYamlPath } — derived from the same personaIndex
  │     │   buildSuite() used, so it cannot disagree with what was actually skipped
  │     └─ issues: personaIndex.issues, copied verbatim
  ├─ strictFailures: unconditionally collect every error/warning ValidationResult from every
  │     result's validationResults plus issues (not gated behind `strict` — see Build Success
  │     Semantics below); errors/warnings counts derived from it
  ├─ success = errors === 0 && (!strict || warnings === 0); if strict and !success, throw after
  │     all suites have built (files may already be written — combine strict with check for CI)
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
| `version` | `resolveChangelogMeta(personaMeta.changelog)?.version` → `sharedMeta.default_version` → `'0.0.0'` | Always — unconditionally overwritten |
| `last_updated` | `resolveChangelogMeta(personaMeta.changelog)?.date` → `''` | Only when absent from merged YAML |
| `tools_list` | `serializeToolsList(tools)` | Always |
| `tools_json` | `serializeTools(tools)` | Always |
| `cc_tools_list` | `serializeToolsList(cc_tools ?? tools)` | Always |
| `cc_tools_json` | `serializeTools(cc_tools ?? tools)` | Always |
| `tools_block` | `serializeToolsBlock(tools)` | Always |
| `cc_tools_block` | `serializeToolsBlock(cc_tools ?? tools)` | Always |
| `cc_file_name_stem` | `cc_file_name` with `.md` extension stripped | Always |
| `da_file_name_stem` | `da_file_name` with `.md` extension stripped | Only when `da_file_name` is set |
| `da_tools_list` | `serializeToolsList(da_tools ?? tools)` | Only when `da_file_name` is set |
| `da_tools_json` | `serializeTools(da_tools ?? tools)` | Only when `da_file_name` is set |
| `da_tools_block` | `serializeToolsBlock(da_tools ?? tools)` | Only when `da_file_name` is set |
| `agent_<slug>` | `"<name> v<version>"` for every persona across all suites; slug hyphens → underscores in key | Always |
| `agent_slug_<slug>` | Raw hyphenated slug string for every persona; key uses underscores, value preserves hyphens | Always |

Derived fields are only set when not already present in the merged context — explicit YAML values always win. **Exception: `version` is unconditionally overwritten** regardless of any `version:` key in per-persona YAML.

> **`da_*` gate:** The `da_file_name_stem`, `da_tools_list`, `da_tools_json`, and `da_tools_block` fields are
> gated on `da_file_name` being present in the merged context. Personas without `da_file_name`
> will not have these fields injected (no error, no empty string). This differs from the
> `cc_*` equivalents which are always emitted unconditionally.

## 3. Frontmatter Template Precedence

```
Plugin frontmatterTemplates     (first registered plugin with target key wins)
   ↓ fallback
BuildConfig.frontmatter         (config-level override)
   ↓ fallback
registry.get(target).defaultFrontmatter   (target definition default)
   ↓ fallback
Library defaults                (DEFAULT_FRONTMATTER_CLAUDE_CODE — last resort)
```

For custom targets (e.g. skill targets), provide `defaultFrontmatter` in the `TargetDefinition` at
registration time. This eliminates the need for plugin or config-level overrides. See the
[Building Skills](../../building-skills.md) guide for a worked example.

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
5. stripComments() every entry   (produces a second, stripped copy — the suite-level and
                                   persona-scoped maps above are never mutated in place)
   ↓ result: Stripped, persona-scoped partialsMap
6. resolvePartials(template, strippedPartialsMap)  ← depth-2 recursion
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
  ├─ printSummary(): print every error/warning (with suite/target/persona, or the index-level
  │     issue's own embedded path), the skipped-persona count, and error/warning/built/written
  │     totals
  └─ Exit code: 0 (success) or 1 (!summary.success — any error by default, or a thrown build,
        or any warning when --strict)
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
