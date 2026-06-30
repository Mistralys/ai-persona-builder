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
| `description` | `string` | Recommended | Referenced by both the default VS Code and default Claude Code frontmatter templates. Missing value warns to stderr. |
| `tools` | `string[]` | Recommended | Default frontmatter templates leave `tools` empty; `tools_list` / `tools_json` become empty strings. See [Target Differences](target-differences.md) for tool notation rules per target. |

---

## Tier 2 — Output-Path Fields

These fields control the filenames of generated output files. Neither field is required, but
omitting them causes the engine to fall back to the content file's basename.

| Field | Type | Fallback | Description |
|-------|------|----------|-------------|
| `vs_file_name` | `string` | Content file basename (e.g. `my-persona.agent.md`) | Filename used for the VS Code output file |
| `cc_file_name` | `string` | Content file basename (e.g. `my-persona.md`) | Filename used for the Claude Code output file |
| `da_file_name` | `string` | Content file basename | Filename used for the Deep Agents output file. When absent, no `da_*` derived fields are injected into the template context. |

> **Tip:** Set all three fields explicitly so output filenames stay stable if you rename the
> content source file.

---

## Tier 3 — Default Claude Code Frontmatter Fields

The default Claude Code frontmatter template references these two variables. They must be present
in **either** a per-persona YAML file or in `meta/_shared.yaml` (suite-wide defaults). Missing
values produce `[WARN] Unresolved variable` in stderr but do not fail the build unless `strict:
true` is set.

| Field | Type | Template variable | Description |
|-------|------|-------------------|-------------|
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
| `cc_tools` | `string[]` | Falls back to `tools` | Separate tool list for the Claude Code target. Exposed as `{{cc_tools_list}}`, `{{cc_tools_json}}`, and `{{cc_tools_block}}` in the template context. Useful when the Claude Code persona needs a different toolset from the VS Code persona. See [Target Differences](target-differences.md) for when and why to use separate tool lists. |
---

## Tier 4b — Deep Agents Tool Override

| Field | Type | Fallback | Description |
|-------|------|----------|-----------|
| `da_tools` | `string[]` | Falls back to `tools` | Separate tool list for the Deep Agents target. Only consumed when `da_file_name` is also set. Exposed as `{{da_tools_list}}`, `{{da_tools_json}}`, and `{{da_tools_block}}` in the template context. |

---

## Tier 4c — Sub-Agent Declarations

| Field | Type | Required? | Description |
|-------|------|-----------|-------------|
| `subagents` | `string[]` | Optional | Slugs of other personas this persona may delegate work to as sub-agents. Each slug must match a persona discoverable across all configured suites. |

The `subagents` field declares cross-suite delegation relationships. At build time,
`validateSubagentRefs()` checks every declared slug against the cross-suite agent map built by
`buildAgentNameMap()` during the pre-scan phase. An `error`-severity `ValidationResult` is
emitted for each slug that has no corresponding persona in any configured suite.

**YAML example:**

```yaml
name: Project Manager
slug: project-manager
subagents:
  - wp-decomposer
  - dependency-sequencer
  - pipeline-configurator
```

**How slug resolution works:**

1. Every persona across all configured suites contributes its `slug` (or filename stem) to a
   global agent map during the pre-scan phase.
2. For each slug in `subagents`, the validator looks up the key `agent_slug_{slug}` (with
   hyphens replaced by underscores) in the map.
3. If the key is missing, the slug is reported as unresolved.

**Strict mode:** When `strict: true` is set in `BuildConfig`, unresolved subagent slugs cause
the build to fail. Without strict mode, unresolved slugs are reported in
`BuildResult.validationResults` but do not halt the build.

**Template access:** The raw `subagents` array is available in the template context via
`{{subagents}}`, but its primary purpose is validation — not template rendering. To reference
another persona's display name or slug in template prose, use the cross-suite agent variables
`{{agent_<slug>}}` and `{{agent_slug_<slug>}}` (see [Auto-Derived Context
Variables](#auto-derived-context-variables)).

> **Absence is valid:** Personas that omit `subagents` (or declare an empty list) pass
> validation silently.

---

## Tier 5 — Optional / Convention Fields

Commonly used but not required by the engine. Plugins and custom templates can read any field
from the merged context using `{{fieldName}}` syntax.

| Field | Type | Description |
|-------|------|-------------|
| `changelog` | `string` | Persona version history as a changelog block scalar. `buildContext()` calls `resolveChangelogMeta()` on this field to derive the `version` and `last_updated` context variables automatically. First matching entry wins. Supported formats: `X.Y.Z (YYYY-MM-DD): …` or `X.Y.Z: …`. See [Utility Functions — `resolveChangelogMeta`](agents/project-manifest/api-surface.md#resolvechangelogmetainput) for the full parsing rules. |
| `version` | `string` | **Always overwritten — do not set manually.** `buildContext()` unconditionally derives `version` from `changelog` → `default_version` → `'0.0.0'`. Any `version:` value in per-persona YAML is silently ignored. Use the `changelog` field to control the rendered version. |
| `author` | `string` | Author name. Useful for frontmatter or documentation. |
| `last_updated` | `string` | ISO 8601 date string (e.g. `'2026-04-01'`). Explicit YAML values are preserved. When absent, `buildContext()` derives it from the `changelog` date component (empty string if the changelog entry has no date). |
| `id` | `string` | Machine-friendly identifier. Used by some plugins for registry lookups. |
| `role` | `string` | Role name. Used by plugins that validate personas against a workflow manifest (e.g. the ledger plugin). |
| `displayName` | `string` | Human-readable display name. When present, used instead of `name` in contexts where a user-friendly label is preferred. Falls back to `name` when absent. |

---

## Shared Defaults — `meta/_shared.yaml`

Every suite can include a `meta/_shared.yaml` file. Its fields are merged as the base layer of the
context before per-persona YAML fields are applied. Per-persona fields always win over shared
defaults.

The file is excluded from persona discovery by its `_` prefix — it is never built as a persona.

**Conventional `_shared.yaml` fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `default_version` | `string` | Suite-wide version fallback (e.g. `'1.0.0'`). Used when a persona YAML has no `changelog` field (or the changelog has no parseable version entry). |
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
| `{{version}}` | `changelog` (via `resolveChangelogMeta`) → `default_version` → `'0.0.0'` | Resolved version string. Always derived from `changelog`; any `version:` in per-persona YAML is silently overwritten. |
| `{{last_updated}}` | `changelog` date (via `resolveChangelogMeta`) → `''` | ISO date string, or empty string. Only injected when absent from all YAML sources. |
| `{{tools_list}}` | `tools` array | Comma-separated quoted tool names: `'read', 'write'` |
| `{{tools_json}}` | `tools` array | JSON array with outer brackets: `['read', 'write']` |
| `{{tools_block}}` | `tools` array | YAML block sequence: `\n  - read\n  - write`; or ` []` when empty |
| `{{cc_tools_list}}` | `cc_tools` → fallback to `tools` | Same format as `tools_list`, for Claude Code target |
| `{{cc_tools_json}}` | `cc_tools` → fallback to `tools` | Same format as `tools_json`, for Claude Code target |
| `{{cc_tools_block}}` | `cc_tools` → fallback to `tools` | YAML block sequence for the Claude Code target; used in the default Claude Code frontmatter |
| `{{cc_file_name_stem}}` | `cc_file_name` (strips `.md`) | Used in the default Claude Code frontmatter `name` field |
| `{{da_file_name_stem}}` | `da_file_name` (strips `.md`) | Only present when `da_file_name` is set; used in the default Deep Agents frontmatter `name` field |
| `{{da_tools_list}}` | `da_tools` → fallback to `tools` | Only present when `da_file_name` is set; same format as `tools_list`, for Deep Agents target |
| `{{da_tools_json}}` | `da_tools` → fallback to `tools` | Only present when `da_file_name` is set; same format as `tools_json`, for Deep Agents target |
| `{{da_tools_block}}` | `da_tools` → fallback to `tools` | Only present when `da_file_name` is set; YAML block sequence for the Deep Agents target |
| `{{agent_<slug>}}` | All personas across all suites | Cross-suite reference: `"<name> v<version>"`. Key uses slug with hyphens replaced by underscores. |

See [Template Syntax](template-syntax.md) for how to use these variables, partials, and
conditionals in your content templates.
