# YAML Metadata Reference

Each persona is defined by a YAML metadata file in the suite's `meta/` directory. Fields are
organized into five tiers below. Fields in higher tiers are recognized by the engine or the
default frontmatter templates; fields in lower tiers are optional conventions your templates and
plugins can read.

---

## Tier 1 — Engine-Required Fields

These fields are read directly by `loadMetadata()` and `buildContext()`. The build will throw or
produce incorrect output when they are absent.

| Field | Type | Required? | Behaviour when absent |
|-------|------|-----------|----------------------|
| `name` | `string` | **Hard required** | `loadMetadata()` throws an error |
| `slug` | `string` | Strongly recommended | Falls back to the YAML filename stem; used for `agent_*` map keys and output path fallback |
| `description` | `string` | Recommended | Default VS Code frontmatter leaves `description` unresolved (warns to stderr) |
| `tools` | `string[]` | Recommended | Default frontmatter templates leave `tools` empty; `tools_list` / `tools_json` become empty strings |

---

## Tier 2 — Output-Path Fields

These fields control the filenames of generated output files. Neither field is required, but
omitting them causes the engine to fall back to the content file's basename.

| Field | Type | Fallback | Description |
|-------|------|----------|-------------|
| `vs_file_name` | `string` | Content file basename (e.g. `my-persona.agent.md`) | Filename used for the VS Code output file |
| `cc_file_name` | `string` | Content file basename (e.g. `my-persona.md`) | Filename used for the Claude Code output file |

> **Tip:** Set both fields explicitly so output filenames stay stable if you rename the
> content source file.

---

## Tier 3 — Default Claude Code Frontmatter Fields

The default Claude Code frontmatter template references these three variables. They must be present
in **either** a per-persona YAML file or in `meta/_shared.yaml` (suite-wide defaults). Missing
values produce `[WARN] Unresolved variable` in stderr but do not fail the build unless `strict:
true` is set.

| Field | Type | Template variable | Description |
|-------|------|-------------------|-------------|
| `cc_permission_mode` | `string` | `{{cc_permission_mode}}` | Claude Code permission mode (e.g. `default`, `allowedOnly`) |
| `cc_model` | `string` | `{{cc_model}}` | Claude Code model identifier (e.g. `claude-sonnet-4-5`) |
| `cc_memory` | `string \| boolean` | `{{cc_memory}}` | Claude Code memory setting (e.g. `project`, `false`) |

These fields are **not auto-derived** by `buildContext()`. They pass through from YAML to the
template context unchanged. If you override the default Claude Code frontmatter template via a
plugin or `BuildConfig.frontmatter`, these fields are only needed if your custom template
references them.

---

## Tier 4 — Claude Code Tool Override

| Field | Type | Fallback | Description |
|-------|------|----------|-------------|
| `cc_tools` | `string[]` | Falls back to `tools` | Separate tool list for the Claude Code target. Exposed as `{{cc_tools_list}}` and `{{cc_tools_json}}` in the template context. Useful when the Claude Code persona needs a different toolset from the VS Code persona. |

---

## Tier 5 — Optional / Convention Fields

Commonly used but not required by the engine. Plugins and custom templates can read any field
from the merged context using `{{fieldName}}` syntax.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Persona version string. Falls back to `default_version` in `_shared.yaml`, then to `'0.0.0'`. |
| `author` | `string` | Author name. Useful for frontmatter or documentation. |
| `last_updated` | `string` | ISO 8601 date string (e.g. `'2026-04-01'`). |
| `id` | `string` | Machine-friendly identifier. Used by some plugins for registry lookups. |
| `role` | `string` | Role name. Used by plugins that validate personas against a workflow manifest (e.g. the ledger plugin). |

---

## Shared Defaults — `meta/_shared.yaml`

Every suite can include a `meta/_shared.yaml` file. Its fields are merged as the base layer of the
context before per-persona YAML fields are applied. Per-persona fields always win over shared
defaults.

The file is excluded from persona discovery by its `_` prefix — it is never built as a persona.

**Conventional `_shared.yaml` fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `default_version` | `string` | Suite-wide version fallback (e.g. `'1.0.0'`). Used when a persona YAML omits `version`. |
| `author` | `string` | Default author applied to every persona in the suite. |
| `last_updated` | `string` | Default last-updated date. |
| `cc_permission_mode` | `string` | Suite-wide Claude Code permission mode (Tier 3). |
| `cc_model` | `string` | Suite-wide Claude Code model (Tier 3). |
| `cc_memory` | `string \| boolean` | Suite-wide Claude Code memory setting (Tier 3). |

Any field present in `_shared.yaml` is available in every persona's template context unless
overridden by the per-persona YAML.

**Minimal `_shared.yaml` for full default-template support:**

```yaml
default_version: '1.0.0'
cc_permission_mode: default
cc_model: claude-sonnet-4-5
cc_memory: project
```

---

## Auto-Derived Context Variables

The following variables are computed by `buildContext()` at build time from the loaded metadata.
They are available in all templates but do **not** need to appear in YAML.

| Variable | Derived from | Description |
|----------|-------------|-------------|
| `{{version}}` | `version` → `default_version` → `'0.0.0'` | Resolved version string |
| `{{tools_list}}` | `tools` array | Comma-separated quoted tool names: `'read', 'write'` |
| `{{tools_json}}` | `tools` array | JSON array with outer brackets: `['read', 'write']` |
| `{{cc_tools_list}}` | `cc_tools` → fallback to `tools` | Same format as `tools_list`, for Claude Code target |
| `{{cc_tools_json}}` | `cc_tools` → fallback to `tools` | Same format as `tools_json`, for Claude Code target |
| `{{cc_file_name_stem}}` | `cc_file_name` (strips `.md`) | Used in the default Claude Code frontmatter `name` field |
| `{{agent_<slug>}}` | All personas across all suites | Cross-suite reference: `"<name> v<version>"`. Key uses slug with hyphens replaced by underscores. |

See [Template Syntax](template-syntax.md) for how to use these variables, partials, and
conditionals in your content templates.
