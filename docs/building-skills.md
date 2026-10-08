# Building Skills with persona-builder

> **Audience:** Developers using `@mistraljs/persona-builder` to build skill files
> (`SKILL.md`) from YAML metadata and Markdown content templates — the same pipeline used for
> personas.

---

## Overview

Skills use a different frontmatter schema than personas, but the build pipeline is the same.
The `TargetRegistry` API lets you register custom targets with skill-appropriate frontmatter
templates, then build skills through the standard `build()` entry point.

This guide walks through the complete setup: creating a custom registry, defining frontmatter
templates, configuring suites, and calling `build()`.

---

## 1. Create a Custom Target Registry

Create a new `TargetRegistry` instance for skills — do not register skill targets on
`defaultRegistry`, which is reserved for persona targets.

```js
const { build, TargetRegistry } = require('@mistraljs/persona-builder');

const skillRegistry = new TargetRegistry();
```

---

## 2. Define Frontmatter Templates

Skills need different frontmatter per target. The templates use the same Handlebars-like
syntax as persona frontmatter — `{{variable}}` for substitution, `{{#if flag}}` for
conditionals.

### VS Code Skill Frontmatter

```js
const VSCODE_SKILL_FRONTMATTER = `---
name: {{name}}
description: "{{description}}"
{{#if argument_hint}}argument-hint: "{{argument_hint}}"
{{/if}}{{#if agent}}agent: {{agent}}
{{/if}}---`;
```

Key fields:
- `name` — required, must match the directory name (lowercase, hyphens, numbers only).
- `description` — required, shown in the skill picker.
- `argument-hint` — optional, guides invocation syntax.

### Claude Code Skill Frontmatter

```js
const CLAUDE_SKILL_FRONTMATTER = `---
name: {{name}}
description: "{{description}}"
{{#if context}}context: {{context}}
{{/if}}{{#if agent}}agent: {{agent}}
{{/if}}---`;
```

Key differences from VS Code:
- Claude Code uses `context` (e.g. `fork`) instead of `argument-hint`.
- The `agent` field specifies which subagent type to use with `context: fork`.

**Skill-Drives-Agent pattern:** When both `context: fork` and `agent: <name>` are set, the
skill body becomes the driving prompt for a forked subagent running under that agent's system
prompt, tools, and model. Only the subagent's summary returns to the main conversation. The
`agent` value must match the `name` field of an agent in `.claude/agents/` (built-in agents
like `Explore`, `Plan`, and `general-purpose` also work). This is the inverse of putting a
`skills:` list in an agent's frontmatter, which preloads skill content into the agent instead.
See [Skill Frontmatter](target-differences.md#skill-frontmatter-cross-platform) for the full
field comparison.

> **Note:** `argument_hint` in YAML metadata maps to `argument-hint` in the frontmatter
> (underscore → hyphen). Handle this in the template — YAML keys use underscores, frontmatter
> keys use hyphens.

See the [Skill Frontmatter (Cross-Platform)](target-differences.md#skill-frontmatter-cross-platform)
reference for the complete field inventory.

---

## 3. Register Skill Targets

Register each target with its frontmatter template and a unique `outputDirKey`:

```js
skillRegistry.register({
    name:               'vscode-skill',
    outputDirKey:       'vscode-skill',
    defaultFrontmatter: VSCODE_SKILL_FRONTMATTER,
    contextFlags:       { target_vscode_skill: true },
});

skillRegistry.register({
    name:               'claude-skill',
    outputDirKey:       'claude-skill',
    defaultFrontmatter: CLAUDE_SKILL_FRONTMATTER,
    contextFlags:       { target_claude_skill: true },
});
```

| Field | Purpose |
|-------|---------|
| `name` | Unique target identifier — used in the `targets` array and `outputDirs` keys. |
| `outputDirKey` | Maps to the suite's `outputDirs` entry for this target's output directory. |
| `defaultFrontmatter` | Template string rendered with the build context for each skill. |
| `contextFlags` | Injected into the template context — enables `{{#if target_vscode_skill}}` conditionals in content templates. |

---

## 4. Configure the Suite

Skills follow the same directory convention as personas:

```
skills/
├── meta/
│   ├── _shared.yaml          # Suite-wide defaults
│   └── my-skill.yaml         # Per-skill metadata
└── content/                   # Can also be named src/
    └── my-skill.md           # Skill body content
```

> **Tip:** Use `contentSubdir: 'src'` in the suite config if you prefer `src/` over
> `content/` for the content directory.

Configure the suite with output directories for each custom target:

```js
const path = require('path');

const ROOT = __dirname;

const suiteConfig = {
    srcDir:       path.join(ROOT, 'skills'),
    contentSubdir: 'src',                         // optional override
    outputDirs: {
        'vscode-skill': path.join(ROOT, 'dist', 'vscode-skills'),
        'claude-skill': path.join(ROOT, 'dist', 'claude-skills'),
    },
};
```

The `outputDirs` keys must match the `outputDirKey` values from the target registration.

---

## 5. Call `build()`

Pass the custom registry and target list to `build()`:

```js
await build({
    suites:         { skills: suiteConfig },
    targets:        ['vscode-skill', 'claude-skill'],
    targetRegistry: skillRegistry,
});
```

This runs the standard pipeline — YAML loading, context merging, template rendering,
validation, file writing — with your custom targets instead of the built-in ones.

---

## 6. Skill Metadata (YAML)

### `_shared.yaml`

Suite-wide defaults. At minimum, provide a fallback version:

```yaml
default_version: '1.0.0'
```

### Per-skill YAML (`meta/my-skill.yaml`)

```yaml
name: my-skill
description: "Performs a specific task on the codebase."
argument_hint: "Describe the task"    # VS Code only (omit for Claude)
context: fork                          # Claude only (omit for VS Code)
agent: my-agent                        # Optional — which agent runs the skill

changelog: |
  1.1.0 (2026-07-01): Added argument hint.
  1.0.0 (2026-06-15): Initial skill.
```

Fields that are target-specific (`argument_hint`, `context`) are safely handled by the
`{{#if}}` conditionals in the frontmatter templates — they render only when present.

---

## 7. Skill Content (Markdown)

Skill content templates work exactly like persona content templates — partials, conditionals,
and variables are all available:

```markdown
# {{name}}

{{> skill-preamble}}

{{#if target_vscode_skill}}
## VS Code Instructions

Use the `/{{name}}` command to invoke this skill.
{{/if}}

{{#if target_claude_skill}}
## Claude Code Instructions

This skill runs in a forked subagent context.
{{/if}}
```

---

## 8. Publishing Skills

The build output is flat files (`my-skill.md`). Most host environments expect skills in a
directory structure (`my-skill/SKILL.md`). A publish step converts the flat output:

```
dist/vscode-skills/my-skill.md    →    .github/skills/my-skill/SKILL.md
dist/claude-skills/my-skill.md    →    .claude/skills/my-skill/SKILL.md
```

This conversion is outside persona-builder's scope — implement it in your project's publish
script. A minimal example:

```js
const fs = require('fs');
const path = require('path');

function publishSkills(srcDir, destDir) {
    // Clear destination
    fs.rmSync(destDir, { recursive: true, force: true });

    for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith('.md')) continue;

        const stem = path.basename(file, '.md');
        const skillDir = path.join(destDir, stem);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.copyFileSync(
            path.join(srcDir, file),
            path.join(skillDir, 'SKILL.md'),
        );
    }
}
```

---

## Complete Example

Putting it all together — a standalone `build-skills.js` script:

```js
const path = require('path');
const { build, TargetRegistry } = require('@mistraljs/persona-builder');

const ROOT = path.resolve(__dirname, '..');

// --- Frontmatter templates ---

const VSCODE_SKILL_FRONTMATTER = `---
name: {{name}}
description: "{{description}}"
{{#if argument_hint}}argument-hint: "{{argument_hint}}"
{{/if}}---`;

const CLAUDE_SKILL_FRONTMATTER = `---
name: {{name}}
description: "{{description}}"
{{#if context}}context: {{context}}
{{/if}}{{#if agent}}agent: {{agent}}
{{/if}}---`;

// --- Registry ---

const skillRegistry = new TargetRegistry();

skillRegistry.register({
    name:               'vscode-skill',
    outputDirKey:       'vscode-skill',
    defaultFrontmatter: VSCODE_SKILL_FRONTMATTER,
    contextFlags:       { target_vscode_skill: true },
});

skillRegistry.register({
    name:               'claude-skill',
    outputDirKey:       'claude-skill',
    defaultFrontmatter: CLAUDE_SKILL_FRONTMATTER,
    contextFlags:       { target_claude_skill: true },
});

// --- Build ---

async function main() {
    const result = await build({
        suites: {
            skills: {
                srcDir: path.join(ROOT, 'skills'),
                outputDirs: {
                    'vscode-skill': path.join(ROOT, 'dist', 'vscode-skills'),
                    'claude-skill': path.join(ROOT, 'dist', 'claude-skills'),
                },
            },
        },
        targets:        ['vscode-skill', 'claude-skill'],
        targetRegistry: skillRegistry,
    });

    console.log(`Built ${result.totalBuilt} skills, wrote ${result.totalWritten} files.`);
}

main().catch(console.error);
```

---

## Further Reading

- [Target Differences](target-differences.md) — Full skill frontmatter field reference.
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, and
  `TargetRegistry` options.
- [Template Syntax](template-syntax.md) — Partials, conditionals, and variable substitution.
- [API Reference](api.md) — `TargetRegistry`, `TargetDefinition`, and `build()` signatures.
