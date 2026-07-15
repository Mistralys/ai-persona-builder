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
- `name` — display name; defaults to the filename if omitted.
- `description` — shown as placeholder text in the chat input when the agent is active.
- `tools` — array of VS Code semantic tool names + MCP wildcards (`<server>/*`).
- `model` — a single model name, or a prioritized array Copilot tries in order until one is available.

### Complete VS Code Agent Field Reference

VS Code supports additional frontmatter fields beyond what the default `@mistralys/persona-builder` templates emit. Custom templates or plugins can include any of these.

**Locations:** `.github/agents/` (workspace), `.claude/agents/` (workspace — VS Code reads these directly with automatic tool name mapping), `~/.copilot/agents/` (user profile, across all workspaces).

**Core fields:**

| Field | Description |
|-------|-------------|
| `name` | Display name; defaults to the filename if omitted. |
| `description` | Shown as placeholder text in the chat input when this agent is active. |
| `argument-hint` | Hint text in the chat input guiding how to invoke the agent. |

**Tool and access control:**

| Field | Description |
|-------|-------------|
| `tools` | List of available tools (built-in, MCP, or extension-contributed). `<server>/*` includes all tools from an MCP server. |
| `agents` | Which other custom agents this one can invoke as subagents. `*` allows all, `[]` blocks all. Requires the `agent` tool in `tools`. |
| `user-invocable` | `false` hides the agent from the agents dropdown (still usable as a subagent). Default `true`. |
| `disable-model-invocation` | `true` blocks other agents from invoking this one as a subagent. Default `false`. |

**Model:**

| Field | Description |
|-------|-------------|
| `model` | A single model name, or a prioritized array Copilot tries in order until one is available. |

**Behavior:**

| Field | Description |
|-------|-------------|
| `target` | `vscode` or `github-copilot`, for which environment the agent runs in. |
| `mcp-servers` | Inline MCP server config; only relevant when `target: github-copilot`. |
| `handoffs` | Suggested next-step buttons after a response. Each entry has `label`, `agent`, `prompt`, `send` (auto-submit if `true`), and an optional `model`. |
| `hooks` | (Preview) Lifecycle hooks scoped to this agent, only active while it is running. Requires a setting flag to enable. |

> **Deprecated:** `infer` — previously controlled both `user-invocable` and `disable-model-invocation` with a single flag. Use the two separate fields instead.
>
> **Cross-compatibility:** When VS Code finds agent files in `.claude/agents/`, it reads Claude Code's own field set (`name`, `description`, `tools`, `disallowedTools`) and maps tool names across automatically, so the same definitions work in both environments.

### Claude Code Frontmatter

```yaml
---
name: my-persona
description: Brief description of the persona.
model: claude-sonnet-4-5
memory: project
tools:
  - Read
  - Edit
  - Grep
  - Bash
mcpServers:
  - my_server
---
```

Key fields:
- `name` — unique identifier (lowercase, hyphens). This is the value used for `@agent-<name>` routing.
- `description` — trigger text Claude matches against for automatic subagent delegation.
- `model` — `sonnet`, `opus`, `haiku`, `fable`, a full model ID (e.g. `claude-opus-4-8`), or `inherit` (default).
- `memory` — `user`, `project`, `local`, or `false`. Gives the subagent a persistent memory directory that survives across sessions.
- `tools` — allowlist of tools the subagent can use. Omit to inherit from the parent session.
- `mcpServers` — MCP servers scoped to this subagent (inline definitions or references to already-configured servers).

### Complete Claude Code Field Reference

Claude Code supports additional frontmatter fields beyond what the default `@mistralys/persona-builder` templates emit. Custom templates or plugins can include any of these.

**Required:**

| Field | Description |
|-------|-------------|
| `name` | Unique identifier (lowercase, hyphens). Used for `@agent-<name>` routing. |
| `description` | Trigger text for automatic subagent delegation. |

**Tool and access control:**

| Field | Description |
|-------|-------------|
| `tools` | Allowlist of tools the subagent can use. Omit to inherit from the parent session. Accepts MCP patterns (`mcp__<server>` or `mcp__<server>__*`) and subagent restrictions (`Agent(agent-name, ...)`). |
| `disallowedTools` | Denylist — removes tools the subagent would otherwise inherit. Applied before `tools` when both are set. |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, or `plan`. Ignored for plugin-distributed subagents. |
| `mcpServers` | MCP servers scoped to this subagent — inline definitions or string references to already-configured servers. |

**Model and cost:**

| Field | Description |
|-------|-------------|
| `model` | `sonnet`, `opus`, `haiku`, `fable`, a full model ID (e.g. `claude-opus-4-8`), or `inherit` (default). |
| `effort` | `low`, `medium`, `high`, `xhigh`, or `max`. Overrides the session's effort level while this subagent is active. |
| `maxTurns` | Caps how many agentic turns the subagent can take before stopping. |

**Behavior and lifecycle:**

| Field | Description |
|-------|-------------|
| `background` | `true` to always run as a background task rather than blocking the main conversation. Default `false`. |
| `isolation` | `worktree` to give the subagent its own temporary git worktree instead of working directly in the checkout. |
| `initialPrompt` | Auto-submitted as the first user turn when the agent runs as the main session agent (via `--agent` or the `agent` setting). |
| `color` | Display color in the task list/transcript (`red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`). |

**Knowledge and memory:**

| Field | Description |
|-------|-------------|
| `skills` | List of skills whose content is preloaded into the subagent's context at startup. |
| `memory` | `user`, `project`, `local`, or `false`. Gives the subagent a persistent memory directory (`~/.claude/agent-memory/<name>/`, `.claude/agent-memory/<name>/`, or `.claude/agent-memory-local/<name>/`). |

**Other:**

| Field | Description |
|-------|-------------|
| `hooks` | Lifecycle hooks (`PreToolUse`, `PostToolUse`, `Stop`, etc.) scoped to this subagent. Ignored for plugin-distributed subagents. |

> **Plugin-distributed subagents:** When a subagent comes from a plugin rather than `.claude/agents/` directly, `tools`, `mcpServers`, `hooks`, and `permissionMode` are all **ignored** for security reasons.

### Skill Frontmatter (Cross-Platform)

Skills (`SKILL.md` files) use a different frontmatter schema than personas. While persona-builder's built-in targets (`vscode`, `claude-code`, `deep-agents`) produce persona output, the [`TargetRegistry`](../agents/project-manifest/api-surface.md#targetregistry) API can register custom skill targets with skill-appropriate frontmatter templates. See the [Building Skills](building-skills.md) guide for a complete walkthrough.

VS Code and Claude Code now follow the same open standard ([agentskills.io](https://agentskills.io)) for cross-tool portability.

**Locations:** project — `.github/skills/`, `.claude/skills/`, `.agents/skills/`; personal — `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`.

**Identity and triggering:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `name` | **Required** (must match directory name, max 64 chars, lowercase/hyphens/numbers only) | Optional (defaults to directory name) | Display name / identifier. VS Code silently fails to load skills with invalid names. |
| `description` | **Required** (max 1,024 chars) | Recommended (falls back to first body paragraph; combined with `when_to_use`, truncated at 1,536 chars) | What the skill does and when to use it. |
| `when_to_use` | — | Optional | Extra trigger phrases appended to `description` (shares the 1,536-char cap). |
| `argument-hint` | Optional | Optional | Shown in autocomplete to hint at expected arguments. |
| `arguments` | — | Optional | Named positional arguments for `$name` substitution. |
| `paths` | — | Optional | Glob patterns restricting when the skill auto-activates. |

**Invocation control:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `disable-model-invocation` | Optional | Optional | `true` blocks auto-invocation; only manual `/name` trigger works. |
| `user-invocable` | Optional | Optional | `false` hides from the `/` menu; the model can still invoke it. |

**Tool access:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `allowed-tools` | — | Optional | Pre-approve tools (no prompting) while the skill is active. |
| `disallowed-tools` | — | Optional | Remove tools from the available pool while active; resets on next message. |

**Model and reasoning:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `model` | — | Optional | Overrides the active model for the rest of the turn. |
| `effort` | — | Optional | `low` / `medium` / `high` / `xhigh` / `max`, overriding session effort. |

**Subagent execution:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `context` | Experimental (requires setting) | Optional | `fork` to run in an isolated subagent instead of inline. |
| `agent` | — (fork is agent-agnostic) | Optional | Which subagent type to use with `context: fork`. Defaults to `general-purpose`. |

**Other:**

| Field | VS Code | Claude Code | Description |
|-------|---------|-------------|-------------|
| `hooks` | — | Optional | Lifecycle hooks scoped to the skill. |
| `shell` | — | Optional | `bash` (default) or `powershell` for inline commands. |

> **Key asymmetry:** Claude Code's `context: fork` lets you target a named agent via the `agent` field; VS Code's fork is currently agent-agnostic (spins up a generic subagent).

**Skill-Drives-Agent pattern (Claude Code):** When a skill declares both `context: fork` and `agent: <name>`, invoking the skill spins up an isolated subagent running under that agent's system prompt, tools, and model. The skill body becomes the driving prompt for the forked subagent, and only its summary returns to the main conversation. The `agent` value must match the `name` field of an agent file in `.claude/agents/` (built-in agents like `Explore`, `Plan`, and `general-purpose` also work).

This is the inverse of the **Agent-Preloads-Skills** direction, where you put a `skills:` list in a subagent's frontmatter to preload skill content into that subagent's context at startup. The two patterns serve different use cases:

| Pattern | Frontmatter | Who drives | Use case |
|---------|-------------|------------|----------|
| Skill drives agent | `context: fork` + `agent:` on the **skill** | The skill body is the prompt | Run a specific task under an agent's persona (e.g. invoke an audit skill that delegates to a Curator agent) |
| Agent preloads skills | `skills:` on the **agent** | The user's message is the prompt | Give an agent domain knowledge at startup (e.g. a coding agent that always has style-guide skills loaded) |

> **VS Code loading model:** VS Code uses three-level progressive loading — `name`/`description` are always visible, the SKILL.md body loads only on invocation, and supporting files in the skill directory load only when referenced.

### Fields That Only Exist in One Target

| Field | VS Code | Claude Code |
|-------|---------|-------------|
| `name` | Yes (with version in display name) | Yes (filename stem, used for routing) |
| `description` | Yes (placeholder text) | Yes (auto-delegation trigger) |
| `tools` | Yes (MCP refs allowed) | Yes (capitalized built-in names) |
| `disallowedTools` | No | Optional (denylist) |
| `agents` | Yes (subagent access control) | No (uses `Agent()` in `tools` instead) |
| `permissionMode` | No | Optional |
| `model` | Optional (single or prioritized array) | Yes (single model or alias) |
| `effort` | No | Optional |
| `maxTurns` | No | Optional |
| `memory` | No | Yes |
| `mcpServers` / `mcp-servers` | `mcp-servers` for `target: github-copilot` only | Yes — `mcpServers` |
| `background` | No | Optional |
| `isolation` | No | Optional |
| `skills` | No | Optional |
| `hooks` | Preview (requires setting flag) | Optional |
| `handoffs` | Yes (next-step buttons) | No |
| `target` | Yes (`vscode` / `github-copilot`) | No |
| `user-invocable` | Yes | No (Claude Code uses it only on skills) |
| `disable-model-invocation` | Yes | No (Claude Code uses it only on skills) |
| `id` | Yes | No |

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
| 8 | Claude Code frontmatter fields | Include `model` and `memory` — they have no VS Code equivalent; `description` is also referenced by the default template |
| 9 | Version in name | VS Code `name` includes version (`v1.0.0`); Claude Code `name` does not |
| 10 | Target conditionals | Use `{{#if target_vscode}}` / `{{#if target_claude_code}}` for platform-specific content |

---

## 8. Minimal Complete Example

### `meta/_shared.yaml`

```yaml
default_version: '1.0.0'
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
