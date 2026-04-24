# VS Code vs Claude Code — Target Differences Guide

> **Audience:** AI agents using `@mistralys/persona-builder` to create or maintain persona
> files. This guide covers the structural and semantic differences between the two primary
> build targets so agents produce correct output for each platform.

---

## Why This Matters

VS Code and Claude Code are fundamentally different host environments. Each has its own:

- Tool naming scheme and notation
- Frontmatter schema
- MCP server referencing mechanism
- Output filename convention

Getting any of these wrong produces a persona file that **looks valid but silently fails** at
runtime. This guide prevents the most common mistakes.

---

## 1. Output Filename Conventions

| Target | YAML Field | Naming Pattern | Example |
|--------|-----------|----------------|---------|
| VS Code | `vs_file_name` | `<slug>.agent.md` | `my-persona.agent.md` |
| Claude Code | `cc_file_name` | `<slug>.md` | `my-persona.md` |
| Deep Agents | `da_file_name` | `<slug>.md` | `my-persona.md` |

**Rules:**
- VS Code persona files **must** use the `.agent.md` extension — the IDE scans for this
  pattern to discover agent instructions.
- Claude Code persona files use plain `.md` — no `.agent.md` suffix.
- Always set both `vs_file_name` and `cc_file_name` explicitly in the persona YAML to keep
  filenames stable if you later rename the content source file.

---

## 2. Tool Name Notation — The #1 Source of Mistakes

### VS Code Tools

VS Code uses **semantic capability names** — short, lowercase identifiers that map to VS Code's
built-in instruction system capabilities:

```yaml
tools:
  - vscode      # VS Code API access
  - execute     # Terminal / command execution
  - read        # File reading
  - edit        # File editing
  - search      # Workspace search
  - web         # Web browsing / fetching
  - agent       # Sub-agent invocation
  - todo        # Task tracking
```

### VS Code MCP Server Tools

MCP server tools in VS Code use the **`server_name/tool_name`** notation (forward slash):

```yaml
tools:
  - my_server/some_tool       # Single tool from an MCP server
  - my_server/*               # All tools from an MCP server (wildcard)
```

> **Common mistake:** Using `server_name#tool_name` (hash notation) instead of
> `server_name/tool_name` (slash notation). The hash form is **incorrect** for VS Code
> personas.

### Claude Code Tools

Claude Code has its own set of **built-in tool names** — capitalized, platform-specific:

```yaml
cc_tools:
  - Bash          # Shell command execution
  - Read          # File reading
  - Edit          # File editing
  - Write         # File writing (separate from Edit)
  - Grep          # Text search
  - Glob          # File pattern search
  - Task          # Sub-agent / task invocation
  - WebFetch      # Fetch a URL
  - WebSearch     # Web search
  - TodoRead      # Read task list
  - TodoWrite     # Write to task list
```

### Claude Code MCP Server Tools

Claude Code references MCP servers **separately** in the frontmatter `mcpServers` field —
they are **not** embedded in the tools list. MCP tool names in Claude Code use the
**`mcp__server__tool`** notation (double underscores):

```yaml
# In frontmatter:
mcpServers:
  - my_server

# In persona body text (when referencing specific tools):
# Use mcp__my_server__some_tool (double-underscore notation)
```

> **Common mistake:** Putting MCP server references in the `cc_tools` array. Claude Code's
> `tools` list is for **built-in tools only**. MCP servers go in `mcpServers`.

### Quick Reference Table

| Aspect | VS Code | Claude Code |
|--------|---------|-------------|
| Built-in tool names | Lowercase (`read`, `edit`, `search`) | Capitalized (`Read`, `Edit`, `Grep`) |
| MCP tool notation | `server/tool` or `server/*` | `mcp__server__tool` |
| MCP server declaration | Embedded in `tools` array | Separate `mcpServers` frontmatter field |
| Tool list YAML field | `tools` | `cc_tools` (falls back to `tools` if absent) |

---

## 3. Frontmatter Differences

### VS Code Frontmatter

```yaml
---
name: 'My Persona v1.0.0'
description: 'Brief description of the persona.'
tools: ['read', 'edit', 'search', 'my_server/*']
---
```

Key fields:
- `name` — includes the version number (e.g. `v1.0.0`)
- `description` — shown in the VS Code agent picker
- `tools` — array of VS Code semantic tool names + MCP wildcards

### Claude Code Frontmatter

```yaml
---
name: my-persona
permissionMode: default
model: claude-sonnet-4-5
memory: project
tools: ['Read', 'Edit', 'Grep', 'Bash']
mcpServers:
  - my_server
---
```

Key fields:
- `name` — the filename stem, **no version number**
- `permissionMode` — Claude Code permission mode (`default`, `acceptEdits`, etc.)
- `model` — Claude Code model identifier (or `inherit` to use the user's configured model)
- `memory` — memory scope (`project`, `user`, or `false`)
- `tools` — Claude Code built-in tools only (capitalized names)
- `mcpServers` — list of MCP server names available to this persona

### Fields That Only Exist in One Target

| Field | VS Code | Claude Code |
|-------|---------|-------------|
| `name` (with version) | Yes | No — uses filename stem |
| `description` | Yes | Optional |
| `tools` | Yes (MCP refs allowed) | Yes (capitalized built-in names) |
| `permissionMode` | No | Yes |
| `model` | Optional | Yes |
| `memory` | No | Yes |
| `mcpServers` | No | Yes |

---

## 4. YAML Metadata — `tools` vs `cc_tools`

### When to Use a Single `tools` Field

Use `tools` alone when both targets share the same logical tool set and the MCP server references
are the same. The builder uses `tools` for the VS Code target and falls back to it for Claude
Code when `cc_tools` is absent.

```yaml
# Both targets get the same tools
tools:
  - read
  - edit
  - search
  - my_server/*
```

### When to Define Separate `cc_tools`

Define `cc_tools` when the Claude Code persona needs a **different set of capabilities**:

```yaml
# VS Code gets semantic names + MCP wildcard
tools:
  - vscode
  - execute
  - read
  - edit
  - search
  - my_server/*

# Claude Code gets platform-specific names (no MCP refs here)
cc_tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - Glob
```

**When separate lists are needed:**
- The two platforms have different built-in tool names (most common case)
- One target needs tools the other does not support
- MCP tools go in `tools` (VS Code) but not in `cc_tools` (Claude Code uses `mcpServers`)

### Deep Agents: `da_tools`

Same pattern — `da_tools` overrides the tool list for the Deep Agents target. Falls back to
`tools` when absent. Only injected when `da_file_name` is set.

---

## 5. Content Template Conditionals

Use target flags to render platform-specific sections within a single content template:

```handlebars
{{#if target_vscode}}
<!-- VS Code-specific instructions -->
Use `my_server/some_tool` to perform the action.
{{else if target_claude_code}}
<!-- Claude Code-specific instructions -->
Use the `mcp__my_server__some_tool` tool to perform the action.
{{else if target_deep_agents}}
<!-- Deep Agents-specific instructions -->
{{/if}}
```

Available target flags (auto-injected, always boolean `true` for the active target):

| Flag | Active When |
|------|------------|
| `target_vscode` | Building for VS Code |
| `target_claude_code` | Building for Claude Code |
| `target_deep_agents` | Building for Deep Agents |

### Common Pattern: Shared Content with Target-Specific Blocks

```handlebars
## Your Persona Instructions

This section is shared across all targets.

### Tool Usage

{{#if target_vscode}}
The following MCP tools are available via the `my_server` server:
- `my_server/tool_a` — does X
- `my_server/tool_b` — does Y
{{else if target_claude_code}}
The following MCP tools are available (server: `my_server`):
- `mcp__my_server__tool_a` — does X
- `mcp__my_server__tool_b` — does Y
{{/if}}
```

---

## 6. Shared Defaults — `_shared.yaml`

Suite-wide defaults for Claude Code frontmatter fields belong in `_shared.yaml`:

```yaml
default_version: '1.0.0'

# Claude Code defaults (Tier 3 fields)
cc_permission_mode: default
cc_model: claude-sonnet-4-5
cc_memory: project
```

These fields are **not auto-derived** by the builder. If the default Claude Code frontmatter
template references them and they are missing, the build emits unresolved-variable warnings.

---

## 7. Common Agent Mistakes — Checklist

Before submitting persona changes, verify:

| # | Check | Mistake to Avoid |
|---|-------|------------------|
| 1 | Tool notation for VS Code | Do NOT use `server#tool` — use `server/tool` |
| 2 | Tool notation for Claude Code | Do NOT use `server/tool` — use `mcp__server__tool` in body text |
| 3 | MCP in Claude Code tools list | Do NOT put MCP refs in `cc_tools` — use `mcpServers` in frontmatter |
| 4 | VS Code filename suffix | Must be `.agent.md`, not plain `.md` |
| 5 | Claude Code filename suffix | Must be plain `.md`, not `.agent.md` |
| 6 | Separate tool lists | Use `cc_tools` when Claude Code needs different tool names |
| 7 | Same tools for both targets | When using a single `tools` list, ensure the names work for both |
| 8 | Claude Code frontmatter fields | Include `permissionMode`, `model`, `memory` — they have no VS Code equivalent |
| 9 | Version in name | VS Code `name` includes version (`v1.0.0`); Claude Code `name` does not |
| 10 | Target conditionals | Use `{{#if target_vscode}}` / `{{#if target_claude_code}}` for platform-specific content |

---

## 8. Minimal Complete Example

### `meta/_shared.yaml`

```yaml
default_version: '1.0.0'
cc_permission_mode: default
cc_model: claude-sonnet-4-5
cc_memory: project
```

### `meta/my-agent.yaml`

```yaml
slug: my-agent
name: My Agent
description: Does useful things.
vs_file_name: my-agent.agent.md
cc_file_name: my-agent.md

tools:
  - vscode
  - read
  - edit
  - search
  - my_server/*

cc_tools:
  - Read
  - Edit
  - Grep
  - Bash
```

### `content/my-agent.md`

```handlebars
# {{name}}

You are an agent that does useful things.

## Available Tools

{{#if target_vscode}}
Use the following tools:
- `my_server/do_thing` — performs the action
- `my_server/check_status` — checks current status
{{else if target_claude_code}}
Use the following tools:
- `mcp__my_server__do_thing` — performs the action
- `mcp__my_server__check_status` — checks current status
{{/if}}
```

### Generated VS Code Output (`my-agent.agent.md`)

```yaml
---
name: 'My Agent v1.0.0'
description: 'Does useful things.'
tools: ['vscode', 'read', 'edit', 'search', 'my_server/*']
---
```
```markdown
# My Agent

You are an agent that does useful things.

## Available Tools

Use the following tools:
- `my_server/do_thing` — performs the action
- `my_server/check_status` — checks current status
```

### Generated Claude Code Output (`my-agent.md`)

```yaml
---
name: my-agent
permissionMode: default
model: claude-sonnet-4-5
memory: project
tools: ['Read', 'Edit', 'Grep', 'Bash']
---
```
```markdown
# My Agent

You are an agent that does useful things.

## Available Tools

Use the following tools:
- `mcp__my_server__do_thing` — performs the action
- `mcp__my_server__check_status` — checks current status
```
