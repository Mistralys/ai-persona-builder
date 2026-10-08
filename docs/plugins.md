# Plugins

Plugins extend the build pipeline without modifying the core engine. Register plugins via `BuildConfig.plugins`.

## PersonaBuildPlugin Interface

Hook invocation order per persona:

1. `onSuiteInit`      — once per suite, before any persona is built
2. `onPartials`       — once per suite, after partials are loaded from disk
3. `onBuildContext`   — per persona, before template rendering
4. `onPersonaPartials` — per persona, before template rendering (after `onBuildContext`)
5. `onPostRender`     — per persona, after body rendering
6. `onValidate`       — per persona, during the validation phase

```ts
interface PersonaBuildPlugin {
  /** Unique name used for logging and identification */
  name: string;

  /**
   * Called once per suite before any persona is built.
   * Use this to read shared metadata and set up plugin state.
   */
  onSuiteInit?(suite: SuiteConfig, sharedMeta: Record<string, unknown>): void;

  /**
   * Called once per suite after partials are loaded from disk (after any
   * BuildConfig.partials inline map has been applied), but before any persona
   * is rendered.
   *
   * Plugins are chained: each plugin receives the accumulated partials map
   * returned by the previous plugin. Return the (possibly mutated or extended)
   * map to pass it to the next plugin. The returned map must include all
   * original keys.
   */
  onPartials?(
    partialsMap: Record<string, string>,
    suiteName: string,
    suite: SuiteConfig,
  ): Record<string, string>;

  /**
   * Called for each persona before template rendering.
   * Mutate and return the context to inject additional template variables.
   * The optional `target` parameter indicates the active build target.
   */
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, unknown>;

  /**
   * Called for each persona (and target) after `onBuildContext`, before
   * template rendering.
   *
   * Allows plugins to inject or override partials on a per-persona basis.
   * Plugins are chained: each plugin receives the accumulated partials map
   * returned by the previous plugin. Return the (possibly mutated or extended)
   * map to pass it to the next plugin. The returned map must include all
   * original keys.
   *
   * **Isolation guarantee:** The builder shallow-copies the suite-level partials
   * map before the first plugin in the chain is called. The `partialsMap` you
   * receive is already persona-scoped — changes applied here are invisible to
   * other personas in the same suite. Do **not** mutate `partialsMap` in place;
   * return a new map instead (e.g. `{ ...partialsMap, myPartial: '...' }`).
   *
   * The `context` parameter reflects the post-`onBuildContext` state: persona
   * metadata and any keys injected by earlier `onBuildContext` plugins are
   * accessible, so you can make partial content conditional on persona fields.
   */
  onPersonaPartials?(
    partialsMap: Record<string, string>,
    persona: PersonaMetadata,
    context: Record<string, unknown>,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, string>;

  /**
   * Called after the full output is rendered.
   * Mutate and return the output string (e.g. to append a footer).
   */
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;

  /**
   * Called during the validation phase.
   * Return an array of ValidationResult entries (empty = no issues).
   */
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig, target?: TargetType): ValidationResult[];

  /**
   * Register custom frontmatter templates, keyed by target type.
   * These override the library defaults and config-level overrides.
   */
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
```

## Examples

### Adding a custom frontmatter field

```ts
import { build, type PersonaBuildPlugin } from '@mistralys/persona-builder';

const timestampPlugin: PersonaBuildPlugin = {
  name: 'timestamp',

  onBuildContext(context) {
    // Inject a build-time variable that templates can use as {{build_date}}
    return { ...context, build_date: new Date().toISOString().slice(0, 10) };
  },
};

const summary = await build({
  suites: {
    docs: {
      srcDir: './personas/docs',
      outputDirs: {
        vscode: './dist/vscode',
        'claude-code': './dist/cc',
      },
    },
  },
  plugins: [timestampPlugin],
});
```

### Injecting per-persona partials (`onPersonaPartials`)

Use `onPersonaPartials` to inject or override partials on a per-persona basis.
The hook runs after `onBuildContext`, so the full rendering context — including
any keys injected by earlier plugins — is available.

**Isolation guarantee:** Each persona receives its own shallow copy of the
suite-level partials map. Overrides applied here are invisible to other personas
in the same suite. Always return a new map object; do not mutate `partialsMap` in place.

```ts
import type { PersonaBuildPlugin } from '@mistralys/persona-builder';

const personaPartialsPlugin: PersonaBuildPlugin = {
  name: 'persona-partials',

  onPersonaPartials(partialsMap, persona, context, suite, target) {
    // Inject a persona-specific partial based on a YAML field
    if (persona.role === 'reviewer') {
      return {
        ...partialsMap,
        reviewerBadge: `> **Role:** Code Reviewer`,
      };
    }

    // Override an existing suite partial for a specific target
    if (target === 'claude-code' && partialsMap['toolsFooter']) {
      return {
        ...partialsMap,
        toolsFooter: `_Tools available on Claude Code only._`,
      };
    }

    // No change — return the map unmodified
    return partialsMap;
  },
};
```

Partials injected here are resolved as `{{> partialName}}` in the persona's
content template, just like suite-level partials. A persona-level injection
wins over a same-named suite-level partial for that persona only.

### Custom frontmatter template via plugin

```ts
const customFrontmatter: PersonaBuildPlugin = {
  name: 'custom-frontmatter',

  frontmatterTemplates: {
    'claude-code': `---
name: {{cc_file_name_stem}}
description: '{{description}}'
permissionMode: {{cc_permission_mode}}
model: {{cc_model}}
memory: {{cc_memory}}
mcpServers:
  - central_pm
---`,
  },
};
```

### Validation plugin

```ts
import type { PersonaBuildPlugin, ValidationResult } from '@mistralys/persona-builder';

const requiredFieldsPlugin: PersonaBuildPlugin = {
  name: 'required-fields',

  onValidate(persona): ValidationResult[] {
    const errors: ValidationResult[] = [];
    if (!persona.description) {
      errors.push({ severity: 'error', message: `${persona.name}: missing "description" field` });
    }
    if (!persona.version) {
      errors.push({ severity: 'warning', message: `${persona.name}: missing "version" field` });
    }
    return errors;
  },
};
```

### Reading `personaMode` in a plugin

`personaMode` is a free-form string set per suite in `SuiteConfig`. The library does not
interpret it — it is your plugin's signal to change behaviour based on which suite is
being built.

```ts
import type { PersonaBuildPlugin } from '@mistralys/persona-builder';

const modeAwarePlugin: PersonaBuildPlugin = {
  name: 'mode-aware',

  onSuiteInit(suite) {
    // Called once per suite before any persona is built.
    // suite.personaMode is whatever was set in SuiteConfig.personaMode.
    if (suite.personaMode === 'numbered') {
      console.log('Building numbered workflow suite');
    }
  },

  onBuildContext(context, persona, suite) {
    if (suite.personaMode === 'numbered') {
      // Inject a mode-specific variable only for numbered suites
      return { ...context, workflow_mode: 'numbered' };
    }
    return context;
  },
};
```

Known mode values are entirely plugin-defined. The library imposes no constraints on the
string value — you choose the convention that suits your project.

---

## Built-in Validators

The library exports validator functions that plugins can use inside `onValidate` hooks:

### `validateStrictMarkers(renderedContent, requiredMarkers)`

Checks that every string in `requiredMarkers` appears verbatim somewhere in `renderedContent`.
Returns one `error`-severity `ValidationResult` per missing marker.

This is useful when a plugin injects required content via partials or `onPostRender` and wants to
guarantee that content was not accidentally removed or overridden by a template author:

```ts
import { validateStrictMarkers, type PersonaBuildPlugin, type ValidationResult } from '@mistralys/persona-builder';

const markerPlugin: PersonaBuildPlugin = {
  name: 'strict-markers',

  onValidate(persona, suite, target): ValidationResult[] {
    // Verify that specific strings appear in the final rendered output.
    // The rendered content is not available in onValidate — this validator
    // is typically called from onPostRender or by collecting the rendered
    // output externally and validating after the build.
    return [];
  },
};
```

> **Note:** `validateStrictMarkers` operates on already-rendered output strings. It is a pure
> function with no I/O. Call it wherever you have access to the rendered persona content.

### `validateSubagentRefs(persona, agentMap, index?, target?)`

Validates that every slug declared in `persona.subagents` has a corresponding `agent_slug_*` key
in `agentMap`, and — when a `PersonaIndex` and `target` are also supplied — that the slug is
actually built for the target currently being rendered. Called automatically by `buildPersona()`
during the validation phase; `buildSuite()`/`build()` pass their `personaIndex` through
automatically, so the target-aware check is on by default for anything but a direct
`buildPersona()` call made without an index. See
[Metadata Reference — Sub-Agent Declarations](metadata-reference.md#tier-4c--sub-agent-declarations)
for the full sub-agent lifecycle.

### `validateToolRequirements(options)`

Pure validator, driven entirely by the current target's `TargetDefinition.toolCapabilities`, that
checks two things for a persona being built for a given target:

1. **Dispatch grant** — a triggered `ToolRequirement` (e.g. the built-in
   `SUBAGENT_DISPATCH_REQUIREMENT`, which fires when `subagents` is declared) whose effective
   tool list grants none of the target's `dispatch` capability tools produces an `error`.
2. **Foreign notation** — a tool present in the effective tool list but recognised only by
   *another* registered target's notation (e.g. `read` showing up in a `claude-code` build)
   produces a `warning` naming the recognising target and this target's equivalent tool names.

```ts
import { validateToolRequirements, SUBAGENT_DISPATCH_REQUIREMENT } from '@mistralys/persona-builder';

const results = validateToolRequirements({
  personaName: persona.name,
  target,
  effectiveTools: context.tools,
  triggered: persona.subagents?.length ? [SUBAGENT_DISPATCH_REQUIREMENT] : [],
  definition: registry.get(target),
  registry,
});
```

**Wired into the build pipeline.** `buildPersona()` now calls this validator automatically during
its validation step, for every target with a registered `TargetDefinition`: it computes the
applied requirements (the built-in `SUBAGENT_DISPATCH_REQUIREMENT` first, then
`BuildConfig.toolRequirements`, with a config entry reusing a built-in `id` replacing it),
determines which are triggered (`when.field` against the post-`onBuildContext` context,
`when.partial` via `collectPartialReferences()`), and resolves `effectiveTools` via
`resolveTargetTools()` — the same value now exposed on `BuildResult.effectiveTools`. A plugin can
still call `validateToolRequirements()` directly from `onValidate`, as shown above, with its own
`triggered` list — for example to validate a requirement whose trigger logic doesn't fit the
built-in `field`/`partial` `when` shapes.

---

## Ledger Plugin — Migrated

> **Moved in v2.0.0** — The ledger plugin has been removed from this library and migrated to the
> [ai-insights-dev](https://github.com/mistralys/ai-insights-dev) workspace as a local CommonJS
> module at `personas/plugins/ledger/`. The `@mistralys/persona-builder/plugins/ledger` sub-path
> export no longer exists. See the ai-insights-dev repository for current ledger plugin source and
> documentation.


