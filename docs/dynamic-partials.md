# Custom Variables & Dynamic Partials

This guide covers two complementary mechanisms for injecting build-time content that varies
across projects, suites, or individual personas:

- **Custom variables** — inject template values via `BuildConfig.variables` and `SuiteConfig.variables`
- **Dynamic partials** — inject or override partial content via `BuildConfig.partials`, `onPartials` and `onPersonaPartials` plugin hooks

Both features follow the same design principle: **later layers win**. Values defined closer to the
individual persona always take precedence over those defined at the global level.

---

## Table of Contents

1. [Custom Variables](#1-custom-variables)
   - [Level 1 — Global variables via `BuildConfig.variables`](#level-1--global-variables-via-buildconfigvariables)
   - [Level 2 — Per-suite variables via `SuiteConfig.variables`](#level-2--per-suite-variables-via-suiteconfigvariables)
   - [Variables merge/override order](#variables-mergeoverride-order)
2. [Dynamic Partials](#2-dynamic-partials)
   - [Level 1 — Inline partials via `BuildConfig.partials`](#level-1--inline-partials-via-buildconfigpartials)
   - [Level 2 — Suite-scoped overrides via the `onPartials` plugin hook](#level-2--suite-scoped-overrides-via-the-onpartials-plugin-hook)
   - [Level 3 — Per-persona overrides via the `onPersonaPartials` plugin hook](#level-3--per-persona-overrides-via-the-onpersonapartials-plugin-hook)
   - [Partials merge/override order](#partials-mergeoverride-order)
   - [End-to-end example — all five layers at once](#end-to-end-example--all-five-layers-at-once)
3. [Combining variables and partials](#3-combining-variables-and-partials)

---

## 1. Custom Variables

Custom variables let you inject arbitrary key/value pairs into the template context from outside
the YAML metadata files. They are ideal for values that are known at build time but should not
live inside the persona source files — for example, project-wide environment names, base URLs,
or shared configuration tokens.

### Level 1 — Global variables via `BuildConfig.variables`

Set `variables` on the top-level `BuildConfig` to make values available to every persona across
all suites.

```ts
import { build } from '@mistralys/persona-builder';
import path from 'node:path';

await build({
  suites: {
    'engineering': {
      srcDir: path.resolve('./personas/engineering'),
      outputDirs: {
        vscode: path.resolve('./dist/engineering/vscode'),
        'claude-code': path.resolve('./dist/engineering/claude-code'),
      },
    },
    'support': {
      srcDir: path.resolve('./personas/support'),
      outputDirs: {
        vscode: path.resolve('./dist/support/vscode'),
        'claude-code': path.resolve('./dist/support/claude-code'),
      },
    },
  },

  // Available in every template in every suite:
  variables: {
    company_name: 'Acme Corp',
    support_email: 'help@acme.example',
    environment: 'production',
  },
});
```

Any template in any suite can then reference these variables:

```md
## Contact

Reach the {{company_name}} team at {{support_email}}.
```

### Level 2 — Per-suite variables via `SuiteConfig.variables`

Set `variables` on a `SuiteConfig` entry to inject values that apply only to that suite. These
override any same-named global variable from `BuildConfig.variables`.

```ts
await build({
  suites: {
    'engineering': {
      srcDir: path.resolve('./personas/engineering'),
      outputDirs: {
        vscode: path.resolve('./dist/engineering/vscode'),
        'claude-code': path.resolve('./dist/engineering/claude-code'),
      },

      // Override company_name for this suite only:
      variables: {
        company_name: 'Acme Engineering',
        on_call_channel: '#eng-oncall',
      },
    },
    'support': {
      srcDir: path.resolve('./personas/support'),
      outputDirs: {
        vscode: path.resolve('./dist/support/vscode'),
        'claude-code': path.resolve('./dist/support/claude-code'),
      },

      // This suite gets the global company_name ("Acme Corp")
      // and its own support-specific variable:
      variables: {
        escalation_channel: '#support-escalations',
      },
    },
  },

  variables: {
    company_name: 'Acme Corp',
    support_email: 'help@acme.example',
  },
});
```

The `engineering` suite will render `{{company_name}}` as `"Acme Engineering"`, while the
`support` suite will render it as `"Acme Corp"`.

### Variables merge/override order

Template variables are built from seven layers. **Later layers always win over earlier ones**:

| Layer | Source | Priority |
|-------|--------|----------|
| 1 | `BuildConfig.variables` | Lowest |
| 2 | `SuiteConfig.variables` | — |
| 3 | `_shared.yaml` fields | — |
| 4 | Per-persona YAML fields | — |
| 5 | Derived/computed fields (`version`, `tools_list`, etc.) | — |
| 6 | Cross-suite agent map (`agent_<slug>` variables) | — |
| 7 | Target flags (`target_vscode`, `target_claude_code`, etc.) | **Highest** |

> **Key rule:** `SuiteConfig.variables` overrides `BuildConfig.variables`, but is itself
> overridden by `_shared.yaml` fields and per-persona YAML metadata. Use `BuildConfig.variables`
> for project-wide defaults and `SuiteConfig.variables` for suite-specific defaults.

For example, if `BuildConfig.variables` sets `env: 'production'` and a persona's YAML also sets
`env: 'staging'`, the persona's YAML value wins.

See [Template Syntax → Variables](template-syntax.md#variables) for the full reference.

---

## 2. Dynamic Partials

Dynamic partials let you inject or override partial content without placing files on disk. They
are useful for programmatically generated content, environment-specific snippets, and per-persona
content that depends on runtime data.

### Level 1 — Inline partials via `BuildConfig.partials`

Pass an inline `partials` map to `BuildConfig` to register partial content as strings. This is
the simplest approach when you want to inject content that is computed at build time.

```ts
import { build } from '@mistralys/persona-builder';
import path from 'node:path';
import fs from 'node:fs';

// Example: load a dynamically generated partial from an external source
const changelogSnippet = fs.readFileSync('./CHANGELOG.md', 'utf8')
  .split('\n')
  .slice(0, 10)           // Take just the first 10 lines
  .join('\n');

await build({
  suites: {
    'my-suite': {
      srcDir: path.resolve('./personas/my-suite'),
      outputDirs: {
        vscode: path.resolve('./dist/vscode'),
        'claude-code': path.resolve('./dist/claude-code'),
      },
    },
  },

  // Inline partials — lowest precedence layer:
  partials: {
    recent_changes: changelogSnippet,
    legal_footer: '> © 2025 Acme Corp. All rights reserved.',
  },
});
```

Templates reference them the same way as file-based partials:

```md
## Recent Changes

{{> recent_changes}}

---

{{> legal_footer}}
```

> **Note:** Inline partials from `BuildConfig.partials` are the **lowest-precedence** layer. Any
> partial with the same name loaded from `sharedPartialsDir`, suite-local `partials/`, or an
> `onPartials` hook will override them.

### Level 2 — Suite-scoped overrides via the `onPartials` plugin hook

The `onPartials` hook runs once per suite, after all partials are loaded from disk and after any
`BuildConfig.partials` map has been merged in. Use it to inject or override partials
programmatically at the suite level.

**Contract:** receive the accumulated partials map, return the (possibly mutated) map. The
returned map is passed to the next plugin in the chain. **Always include all original keys** —
return `{ ...partialsMap, myPartial: '...' }` rather than a fresh object.

```ts
import type { PersonaBuildPlugin } from '@mistralys/persona-builder';

export const environmentBannerPlugin: PersonaBuildPlugin = {
  name: 'environment-banner',

  onPartials(partialsMap, suiteName, suite) {
    // Inject an environment-specific banner for every persona in this suite.
    const env = process.env.BUILD_ENV ?? 'development';

    return {
      ...partialsMap,
      env_banner: env === 'production'
        ? '> ⚠️ **Production environment.** Treat all data as live.'
        : `> 🔧 **${env} environment.** Safe to experiment.`,
    };
  },
};

await build({
  suites: {
    'my-suite': {
      srcDir: path.resolve('./personas/my-suite'),
      outputDirs: {
        vscode: path.resolve('./dist/vscode'),
        'claude-code': path.resolve('./dist/claude-code'),
      },
    },
  },
  plugins: [environmentBannerPlugin],
});
```

> **Execution order:** Multiple plugins are chained — each receives the map returned by the
> previous plugin. The order of `plugins` in `BuildConfig` controls which plugin runs first.
> The **last** plugin to set a key wins.

### Level 3 — Per-persona overrides via the `onPersonaPartials` plugin hook

The `onPersonaPartials` hook runs once per persona (and per target), after `onBuildContext`.
It receives a **shallow copy** of the suite-level partials map, so changes are isolated to the
current persona — they will not affect other personas in the same suite.

Use this hook when partial content depends on persona-specific data: role, tier, capabilities, or
any field from the persona's YAML metadata.

**Contract:** same chaining rules as `onPartials` — receive the map, return a new map. Mutating
in place may work but is not guaranteed to be safe; always return `{ ...partialsMap, ... }`.

```ts
import type { PersonaBuildPlugin } from '@mistralys/persona-builder';

export const tierDisclaimerPlugin: PersonaBuildPlugin = {
  name: 'tier-disclaimer',

  onPersonaPartials(partialsMap, persona, context, suite, target) {
    // `context` holds the post-onBuildContext merged state — all YAML fields
    // and any keys injected by earlier onBuildContext plugins are accessible.
    const tier = context['tier'] as string | undefined;

    if (tier === 'admin') {
      return {
        ...partialsMap,
        disclaimer: '> 🔒 **Admin persona.** Restricted to authorised users.',
      };
    }

    if (tier === 'read-only') {
      return {
        ...partialsMap,
        disclaimer: '> 👁️ **Read-only persona.** No write operations permitted.',
      };
    }

    // Return unchanged map for personas without a tier field:
    return partialsMap;
  },
};
```

A persona with `tier: admin` in its YAML will receive the admin disclaimer, while all other
personas in the same suite receive the map untouched.

```yaml
# personas/my-suite/meta/admin-agent.yaml
name: Admin Agent
tier: admin
vs_file_name: admin-agent.agent.md
cc_file_name: admin-agent.md
```

The content template can then unconditionally include the partial:

```md
{{> disclaimer}}

## Role

...
```

Because `onPersonaPartials` runs per-persona, the `disclaimer` partial resolves to different
content for each persona without any `{{#if}}` conditionals in the template itself.

> **Isolation guarantee:** The builder shallow-copies the suite-level partials map before passing
> it to the first `onPersonaPartials` plugin in the chain. Changes you apply inside this hook
> are invisible to other personas in the same suite.

### Partials merge/override order

Partials are resolved in five layers. **Later layers always win over earlier ones**:

| Layer | Source | Priority |
|-------|--------|----------|
| 1 | `BuildConfig.partials` (inline map) | Lowest |
| 2 | `sharedPartialsDir` — files in the shared partials directory | — |
| 3 | Suite-local partials — files in `<srcDir>/partials/` | — |
| 4 | `onPartials` plugin hooks — plugin-injected partials (suite-level) | — |
| 5 | `onPersonaPartials` plugin hooks — per-persona overrides | **Highest** |

For per-persona rendering, a **copy** of the layer-4 map is handed to `onPersonaPartials` hooks,
which can further override it for the duration of a single persona's render pass.

> **Key rule:** `onPartials` hooks win over any file on disk. `onPersonaPartials` hooks win over
> `onPartials` for the individual persona — but those overrides do not propagate back to the
> suite-level map.

> **Nesting limit:** Partial inclusion is resolved with a maximum recursion depth of **2**. This
> means a partial can itself include one level of nested partials (i.e. a partial-within-a-partial),
> but a third level of nesting is **not** expanded — the `{{> name}}` marker is left as-is in the
> output. This cap applies to all five layers, including partials injected by `onPartials` and
> `onPersonaPartials` hooks. If you encounter unexpanded `{{> …}}` markers in your output, check
> whether your partials are nested more than two levels deep.

### End-to-end example — all five layers at once

The following example exercises every layer of the resolution order in a single `build()` call.
It mirrors the integration test suite added in the WP-008 test coverage pass, so you can compare
the example code with the live tests in `tests/integration/build.test.ts`.

**Scenario:** two personas share a template that includes `{{> dynamic_partial}}`. Each layer adds
or overrides the partial, and the highest-precedence layer wins.

```ts
import { build } from '@mistralys/persona-builder';
import type { PersonaBuildPlugin } from '@mistralys/persona-builder';
import path from 'node:path';

// ----- Layer 5: onPersonaPartials — per-persona override (highest precedence) -----
// Demonstrates the per-persona isolation guarantee: each persona receives
// distinct partial content; changes for one persona never affect another.
const perPersonaPlugin: PersonaBuildPlugin = {
  name: 'per-persona-partial',

  onPersonaPartials(partialsMap, persona) {
    // The builder already shallow-copied the suite-level map before calling
    // this hook, so mutations here are invisible to other personas.
    return {
      ...partialsMap,
      dynamic_partial: `Content tailored for ${persona.name}.`,
    };
  },
};

// ----- Layer 4: onPartials — suite-level override -----
// Runs once per suite after file-based partials are loaded.
// Wins over any file on disk; loses to onPersonaPartials.
const suitePlugin: PersonaBuildPlugin = {
  name: 'suite-partial',

  onPartials(partialsMap) {
    return {
      ...partialsMap,
      dynamic_partial: 'Suite-level content (overrides disk files).',
    };
  },
};

await build({
  suites: {
    'my-suite': {
      srcDir: path.resolve('./personas/my-suite'),
      // Layer 3 (suite-local files): any .md file in ./personas/my-suite/partials/
      // named dynamic_partial.md would be layer 3 — overridden by onPartials and onPersonaPartials.
      outputDirs: {
        vscode: path.resolve('./dist/vscode'),
        'claude-code': path.resolve('./dist/claude-code'),
      },
    },
  },

  // Layer 2: sharedPartialsDir — files here form the second layer.
  // A file named dynamic_partial.md here would override BuildConfig.partials
  // but lose to suite-local files, onPartials hooks, and onPersonaPartials hooks.
  sharedPartialsDir: path.resolve('./personas/shared/partials'),

  // Layer 1: inline partials — lowest precedence.
  partials: {
    dynamic_partial: 'Fallback content from BuildConfig.partials.',
  },

  plugins: [suitePlugin, perPersonaPlugin],
});
```

**Resolution outcome for each persona** (highest-precedence layer wins):

| Layer | Source | Value of `dynamic_partial` | Wins? |
|-------|--------|---------------------------|-------|
| 1 | `BuildConfig.partials` | `'Fallback content from BuildConfig.partials.'` | No |
| 2 | `sharedPartialsDir` file | _(value from file, if present)_ | No |
| 3 | Suite-local partials file | _(value from file, if present)_ | No |
| 4 | `onPartials` hook | `'Suite-level content (overrides disk files).'` | No |
| 5 | `onPersonaPartials` hook | `'Content tailored for <persona name>.'` | ✅ **Yes** |

> **Isolation guarantee:** Because `onPersonaPartials` runs on a **shallow copy** of the
> suite-level partials map, `persona-alpha` and `persona-beta` each see their own value for
> `dynamic_partial`. Neither persona's output contains the other persona's partial content.

---

## 3. Combining variables and partials

Variables and partials compose naturally. A partial injected by `onPersonaPartials` can itself
reference template variables, and those variables are resolved in the normal 7-layer merge after
all partials have been resolved.

```ts
// Plugin: inject a partial that references a template variable
export const signaturePlugin: PersonaBuildPlugin = {
  name: 'signature',

  onPersonaPartials(partialsMap, persona, context) {
    // The partial content can use {{variable}} syntax —
    // variable substitution runs after partial inclusion.
    return {
      ...partialsMap,
      signature: '— {{name}} v{{version}}, brought to you by {{company_name}}',
    };
  },
};
```

Processing order for a template that includes `{{> signature}}`:

1. `{{> signature}}` is replaced with the partial's raw content string.
2. Template conditionals (`{{#if … }}`) are evaluated.
3. `{{name}}`, `{{version}}`, and `{{company_name}}` are substituted from the merged context.

This means you can author generic, reusable partial templates that are parameterised by context
variables — the combination lets you express sophisticated per-persona content without hard-coding
anything in the plugin itself.

---

For full API details see:

- [Configuration Reference](configuration.md) — `BuildConfig.variables`, `SuiteConfig.variables`, `BuildConfig.partials`
- [Plugins](plugins.md) — `onPartials` and `onPersonaPartials` hook signatures
- [Template Syntax](template-syntax.md) — variable substitution and partial inclusion
