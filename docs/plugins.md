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
   */
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
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
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig): ValidationResult[];

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
import { build, type PersonaBuildPlugin } from '@smor/persona-build';

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
      outVscode: './dist/vscode',
      outClaudeCode: './dist/cc',
    },
  },
  plugins: [timestampPlugin],
});
```

### Custom frontmatter template via plugin

```ts
const ledgerPlugin: PersonaBuildPlugin = {
  name: 'ledger',

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
import type { PersonaBuildPlugin, ValidationResult } from '@smor/persona-build';

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
