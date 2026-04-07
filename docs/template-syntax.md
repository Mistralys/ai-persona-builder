# Template Syntax

Templates use a lightweight `{{…}}` syntax with no external dependencies.

## Variables

```
{{variableName}}
```

Values are sourced from the merged context (shared YAML + per-persona YAML + plugin `onBuildContext`). Missing variables emit a warning to stderr but do not fail the build.

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

## Built-in Context Variables

The builder automatically derives several convenience variables from YAML metadata:

| Variable | Source |
|----------|--------|
| `{{version}}` | `version` field, or `default_version` from `_shared.yaml`, or `'0.0.0'` |
| `{{tools_list}}` | Comma-separated string of `tools` array items |
| `{{tools_json}}` | JSON array string of `tools` items |
| `{{cc_tools_list}}` | Comma-separated string of `cc_tools` (falls back to `tools`) |
| `{{cc_tools_json}}` | JSON array string of `cc_tools` |
| `{{cc_file_name_stem}}` | Stem of `cc_file_name` (filename without `.md` extension) |
| `{{target_vscode}}` | `true` when building for the `vscode` target; absent otherwise |
| `{{target_claude_code}}` | `true` when building for the `claude-code` target; absent otherwise |

### Target Flags

The `target_<name>` variables enable target-conditional content directly in templates.
Only the active target's flag is injected (`true`); the other target's flag is absent
and therefore falsy in conditionals.

```
{{#if target_vscode}}
Content shown only in VS Code builds.
{{else}}
Content shown in all other builds (e.g. Claude Code).
{{/if}}
```

The flag name is derived from the target identifier by replacing hyphens with
underscores: `vscode` → `target_vscode`, `claude-code` → `target_claude_code`.

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
permissionMode: {{cc_permission_mode}}
model: {{cc_model}}
memory: {{cc_memory}}
allowedTools: [{{cc_tools_list}}]
---
```

Override these via `BuildConfig.frontmatter` or via a plugin's `frontmatterTemplates`.

## Required YAML Fields per Target

The default Claude Code template uses the following variables that must be present in your YAML metadata (either in `meta/_shared.yaml` or in a per-persona YAML file):

| Variable | YAML field | Required by |
|----------|-----------|-------------|
| `{{cc_permission_mode}}` | `cc_permission_mode` | Default Claude Code frontmatter |
| `{{cc_model}}` | `cc_model` | Default Claude Code frontmatter |
| `{{cc_memory}}` | `cc_memory` | Default Claude Code frontmatter |

Missing fields produce an `[WARN] Unresolved variable` message in stderr but do not fail the build. To make missing fields a hard error, combine `--check --strict` (CLI) or set `strict: true` in `BuildConfig`.

**Example `_shared.yaml` with all required Claude Code fields:**

```yaml
default_version: '1.0.0'
cc_permission_mode: default
cc_model: claude-opus-4-5
cc_memory: project
```

The VS Code default template only requires `name`, `description`, and `tools` (or `tools_list`) — all standard fields already present in well-formed persona YAML.
