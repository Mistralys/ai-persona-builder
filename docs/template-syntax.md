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

Partials are loaded from the `partials/` directory and resolved up to 2 levels deep (one partial
can include another partial, which can include a third). Partial references beyond the depth limit
are **left as-is** in the output — the `{{> name}}` marker is preserved verbatim with no error or
warning. This cap is not configurable.

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

`{{else if}}` is resolved natively by the engine's tokenizer — it is not rewritten into
nested `{{#if}}` blocks first — but it composes correctly with traditional nested syntax
regardless.

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

The engine resolves nesting in a single pass over a bracket-matched block tree, so blocks
resolve correctly regardless of depth. No stray `{{/if}}` markers appear in the output
regardless of nesting depth.

### Whitespace Rules

A conditional tag written on a line by itself (only whitespace before and after it on that
line) is a **standalone tag**: the entire line, including its trailing newline, is removed
from the output. A tag written inline with surrounding text removes only the tag itself,
leaving the rest of the line and its line breaks untouched:

```
Use the {{#if a}}Task{{else}}task{{/if}} tool.
```

renders as `Use the Task tool.` (or `Use the task tool.`) with no extra line break
introduced.

When a conditional block resolves to nothing (no branch taken, or an empty branch) and sits
between two lines of content, the surrounding blank-line run is merged so that exactly one
paragraph break remains — content on either side of a vanished block never ends up
separated by a gap larger than a single blank line. Blank lines that are part of a **kept**
branch are emitted exactly as written and are not merged with blank lines outside the tag.

Two or more vanished blocks sitting next to each other — separated only by blank lines, or
with no gap at all — merge as a single unit, not one pair at a time:

```
Intro.

{{#if a}}
A
{{/if}}

{{#if b}}
B
{{/if}}

Outro.
```

renders as:

```
Intro.

Outro.
```

with `a` and `b` both falsy: the blank-line run before the first vanished block, the run
between the two, and the run after the second all merge into the single blank line that
separates `Intro.` from `Outro.`, exactly as if only one block had vanished. A block whose
branch keeps real content breaks the chain — vanished blocks on either side of it never
merge across that content.

Malformed or unterminated conditional tags — a stray `{{/if}}`, an unclosed `{{#if}}`, an
`{{else}}` or `{{else if}}` outside any block, a second `{{else}}` in the same block, or a
flag name that isn't a plain `\w+` identifier — are left in the output exactly as written,
with no substitution or removal attempted.

**Line endings:** `{{#if}}` input is normalised to LF (`\n`) line endings before anything
else happens, regardless of whether it was written with LF, CRLF, or a lone CR. The output
of `resolveConditionals()` never contains `\r`, so a CRLF template (for example, one checked
out on Windows with `core.autocrlf=true`) resolves identically to its LF twin.

## Comments

```
{{!-- comment --}}
{{! comment }}
```

Both forms are recognised; neither has an escape form for producing a literal `{{!` in
output. `{{!-- … --}}` ends at the first `--}}` and may span multiple lines and contain a
literal `}}` — it is the only safe form for a note that itself mentions template syntax.
`{{! … }}` ends at the first `}}` and may also span multiple lines, but cannot contain a
literal `}}`.

Comments are removed by `stripComments()`, which runs **before** partials, conditionals, and
variables are resolved — before anything else touches the template. This is why a comment is
fully inert: any tag or template syntax written inside one — a partial reference, a
conditional block, or a variable marker — is removed along with the comment text and never
separately recognised, resolved, or reported as missing. A commented-out `{{> partialName}}`
never expands and never warns; a commented-out `{{unknownVariable}}` never triggers an
unresolved-variable warning.

`resolveConditionals()` does not recognise comment delimiters — it is `stripComments()`'s job
alone, and the only one, to remove them. A direct API caller that wants both conditionals and
comments resolved must call `stripComments()` first.

An unterminated `{{!--` or `{{!` (no closing delimiter before end of input) is left in the
output exactly as written, exactly like a malformed conditional tag.

### Whitespace and Line Handling

Comments share the same standalone/inline whitespace contract as conditional tags:

- A **standalone** comment — the only non-whitespace content on its line (or, for a
  multi-line comment, only whitespace before it on its first line and only whitespace after
  it on its last line) — has its entire line span removed, including the final line
  terminator.
- An **inline** comment — sharing a line with other content — has only its own characters
  removed; the rest of the line is untouched.
- **Blank-run merge:** where removing a standalone comment leaves a blank-line run directly
  above and another directly below, the two merge into the longer run instead of adding
  together — exactly as for a conditional block that emits nothing.
- **Adjacent removals merge as one.** Two or more standalone comments next to each other —
  separated only by blank lines, or with no gap at all — merge as a single unit, the same
  way two adjacent vanished conditional blocks do:

  ```
  Intro.

  {{!-- first note --}}

  {{!-- second note --}}

  Outro.
  ```

  renders as `Intro.\n\nOutro.`, not `Intro.` and `Outro.` separated by two blank lines.

```
Line one.
{{!-- standalone note --}}
Line two.
```

renders as:

```
Line one.
Line two.
```

with no blank line inserted, because the standalone comment's own line — including its
trailing newline — is removed entirely, leaving the two content lines adjacent exactly as if
the comment line had never been written.

An `{{else}}` immediately followed by an inline comment on the same line —
`{{else}}{{!-- note --}}` — resolves as a standalone `{{else}}`: the comment is inert text as
far as `resolveConditionals()` is concerned (it does not recognise comment delimiters), and
`stripComments()` removes the comment's own characters without affecting the `{{else}}` tag's
standalone status.

**Line endings:** like `resolveConditionals()`, `stripComments()` normalises its input to LF
line endings before anything else happens, so a CRLF or lone-CR comment resolves identically
to its LF twin, and the output never contains `\r`.

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

### Frontmatter Template Precedence

Frontmatter templates are resolved through a four-layer precedence chain (first match wins):

1. **Plugin `frontmatterTemplates`** — the first registered plugin that has a template for the
   active target wins (highest priority)
2. **`BuildConfig.frontmatter`** — config-level override keyed by target name
3. **`TargetDefinition.defaultFrontmatter`** — the default template declared in the target’s
   registry entry
4. **Library fallback** — the built-in Claude Code template (used for unrecognised custom targets
   that provide no default)

Override via `BuildConfig.frontmatter` for project-wide customisation, or via a plugin's
`frontmatterTemplates` for plugin-scoped customisation that takes precedence over everything else.

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
