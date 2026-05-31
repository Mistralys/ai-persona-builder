# Template Syntax

Templates use a lightweight `{{…}}` syntax with no external dependencies.

## Variables

```
{{variableName}}
```

Values are sourced from the merged context built in this priority order (later layers win):

1. `BuildConfig.variables` — global defaults set in your top-level config
2. `SuiteConfig.variables` — suite-level overrides
3. `_shared.yaml` fields
4. Per-persona YAML fields
5. Derived/computed fields (e.g. `version`, `tools_list`)
6. Cross-suite agent map (`agent_<slug>` variables)
7. Target flags (`target_<name>` booleans) — always highest priority

Plugin `onBuildContext` hooks run after step 4 and may contribute additional keys or override existing ones. Missing variables emit a warning to stderr but do not fail the build.

### Escape Syntax

Prefix a variable marker with a backslash to emit it as literal text, bypassing substitution and suppressing any unresolved-variable warning:

```
\{{variableName}}
```

The backslash is consumed by the engine; the output is the bare `{{variableName}}` marker with no substitution performed. This is useful when you need to show template syntax examples inside rendered output, or when you intentionally want to defer resolution to a downstream processor.

**Double-backslash chaining:** The escape is applied to exactly one leading backslash. A double backslash (`\\{{variableName}}`) produces `\{{variableName}}` in the output — the first backslash acts as the escape character, and the second backslash passes through literally. This behaviour is consistent with standard template-engine escape chaining.

| Input | Output |
|-------|--------|
| `\{{name}}` | `{{name}}` (literal, no substitution) |
| `\\{{name}}` | `\{{name}}` (one backslash + literal marker) |
| `{{name}}` | `Alice` (normal substitution, given `name = "Alice"`) |

## Partials

```
{{> partialName}}
```

Partials are loaded from the `partials/` directory and resolved up to 2 levels deep.

## Conditionals

```
{{#if flagName}}
Content shown when flagName is truthy.
{{else}}
Fallback content.
{{/if}}
```

### Else-If Chains

Use `{{else if flagName}}` to express multi-branch conditionals without deep nesting:

```
{{#if a}}
Content shown when a is truthy.
{{else if b}}
Content shown when a is falsy and b is truthy.
{{else}}
Fallback content when both a and b are falsy.
{{/if}}
```

**Truth table:**

| `a` | `b` | Output |
|-----|-----|--------|
| `true` | any | first branch |
| `false` | `true` | second branch |
| `false` | `false` | `{{else}}` fallback |

Chains may have any number of `{{else if}}` branches. The first truthy branch wins;
all subsequent branches are discarded. If no branch is truthy and there is no
`{{else}}`, the entire block is removed from the output.

`{{else if}}` chains are normalised into equivalent nested `{{#if}}` blocks before
resolution, so they compose correctly with traditional nested syntax.

### Nested Conditionals

`{{#if}}` blocks may be nested inside `{{else}}` branches. This is the standard pattern
for writing content that differs across all three built-in targets:

```
{{#if target_vscode}}
Content shown only in VS Code builds.
{{else}}
{{#if target_deep_agents}}
Content shown only in Deep Agents builds.
{{else}}
Content shown in Claude Code (or any remaining) builds.
{{/if}}
{{/if}}
```

The engine resolves nested blocks innermost-first across multiple passes until the output
stabilises. No stray `{{/if}}` markers appear in the output regardless of nesting depth.

## Built-in Context Variables

The builder automatically derives several convenience variables from YAML metadata:

| Variable | Source |
|----------|--------|
| `{{version}}` | `version` field, or `default_version` from `_shared.yaml`, or `'0.0.0'` |
| `{{tools_list}}` | Comma-separated string of `tools` array items |
| `{{tools_json}}` | JSON array string of `tools` items |
| `{{tools_block}}` | YAML block sequence of `tools` items; or ` []` when empty |
| `{{cc_tools_list}}` | Comma-separated string of `cc_tools` (falls back to `tools`) |
| `{{cc_tools_json}}` | JSON array string of `cc_tools` |
| `{{cc_tools_block}}` | YAML block sequence of `cc_tools` (falls back to `tools`); used in the default Claude Code frontmatter |
| `{{cc_file_name_stem}}` | Stem of `cc_file_name` (filename without `.md` extension) |
| `{{da_tools_list}}` | Comma-separated string of `da_tools` (falls back to `tools`); only present when `da_file_name` is set |
| `{{da_tools_json}}` | JSON array string of `da_tools`; only present when `da_file_name` is set |
| `{{da_tools_block}}` | YAML block sequence of `da_tools` (falls back to `tools`); only present when `da_file_name` is set |
| `{{da_file_name_stem}}` | Stem of `da_file_name` (filename without `.md` extension); only present when `da_file_name` is set |
| `{{target_vscode}}` | `true` when building for the `vscode` target; absent otherwise |
| `{{target_claude_code}}` | `true` when building for the `claude-code` target; absent otherwise |
| `{{target_deep_agents}}` | `true` when building for the `deep-agents` target; absent otherwise |

### Target Flags

The `target_<name>` variables enable target-conditional content directly in templates.
Only the active target's flag is injected (`true`); all other targets' flags are absent
and therefore falsy in conditionals.

```
{{#if target_vscode}}
Content shown only in VS Code builds.
{{else}}
Content shown in all other builds (e.g. Claude Code, Deep Agents, or custom targets).
{{/if}}
```

The flag name is derived from the target identifier by replacing hyphens with
underscores: `vscode` → `target_vscode`, `claude-code` → `target_claude_code`,
`deep-agents` → `target_deep_agents`. The same rule applies to custom targets.

## Default Frontmatter Templates

**VS Code:**

```
---
name: '{{name}} v{{version}}'
description: '{{description}}'
tools: [{{tools_list}}]
---
```

**Claude Code:**

```
---
name: {{cc_file_name_stem}}
description: {{description}}
model: {{cc_model}}
memory: {{cc_memory}}
tools:{{cc_tools_block}}
---
```

Override these via `BuildConfig.frontmatter` or via a plugin's `frontmatterTemplates`.

## Required YAML Fields per Target

The default Claude Code template uses the following variables that must be present in your YAML metadata (either in `meta/_shared.yaml` or in a per-persona YAML file):

| Variable | YAML field | Required by |
|----------|-----------|-------------|
| `{{description}}` | `description` | Default Claude Code frontmatter |
| `{{cc_model}}` | `cc_model` | Default Claude Code frontmatter |
| `{{cc_memory}}` | `cc_memory` | Default Claude Code frontmatter |

Missing fields produce an `[WARN] Unresolved variable` message in stderr but do not fail the build. To make missing fields a hard error, combine `--check --strict` (CLI) or set `strict: true` in `BuildConfig`.

**Example `_shared.yaml` with all required Claude Code fields:**

```yaml
default_version: '1.0.0'
cc_model: claude-opus-4-5
cc_memory: project
```

The VS Code default template only requires `name`, `description`, and `tools` (or `tools_list`) — all standard fields already present in well-formed persona YAML.

---

See [Getting Started](getting-started.md) for a hands-on tutorial that demonstrates these features end-to-end.
