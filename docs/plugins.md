# Plugins

Plugins extend the build pipeline without modifying the core engine. Register plugins via `BuildConfig.plugins`.

## PersonaBuildPlugin Interface

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

## Ledger Plugin — Migrated

> **Moved in v2.0.0** — The ledger plugin has been removed from this library and migrated to the
> [ai-insights-dev](https://github.com/mistralys/ai-insights-dev) workspace as a local CommonJS
> module at `personas/plugins/ledger/`. The `@mistralys/persona-builder/plugins/ledger` sub-path
> export no longer exists. See the ai-insights-dev repository for current ledger plugin source and
> documentation.


