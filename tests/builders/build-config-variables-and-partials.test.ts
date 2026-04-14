/**
 * tests/builders/build-config-variables-and-partials.test.ts
 *
 * WP-007 — Unit Tests: Custom Variables and Config Partials
 *
 * Verifies all 6 behavioural Acceptance Criteria:
 *
 *   AC-1: BuildConfig.variables values appear in the rendered context when no
 *         higher-priority source provides them.
 *   AC-2: SuiteConfig.variables values override BuildConfig.variables values
 *         for the same key.
 *   AC-3: Persona YAML values override both SuiteConfig.variables and
 *         BuildConfig.variables.
 *   AC-4: _shared.yaml values override BuildConfig.variables (but are
 *         overridden by persona YAML).
 *   AC-5: BuildConfig.partials entries are present in the rendered template
 *         output.
 *   AC-6: File-based partials with the same stem name override
 *         BuildConfig.partials.
 *
 * AC-7 (all new tests pass) and AC-8 (all existing tests continue to pass)
 * are verified by running the full test suite.
 *
 * These tests exercise the merge wiring introduced by WP-002 (Custom Variables)
 * and WP-004 (Config Partials).  They intentionally use the same public surface
 * as the WP-002 / WP-004 test files — buildPersona() and buildSuite() — so that
 * the acceptance criteria are demonstrably reachable through the public API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildPersona, buildSuite } from '../../src/builders/persona-builder.js';
import type { BuildConfig, BuildResult } from '../../src/builders/types.js';
import type { SuiteConfig } from '../../src/plugins/types.js';
import { createMinimalSuite } from '../helpers/suite-fixture.js';

// ---------------------------------------------------------------------------
// Temp directory lifecycle
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `wp007-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Builds a single persona with the supplied config and shared-meta and returns
 * the rendered content string.
 */
async function renderPersona(
  yamlPath: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  sharedMeta: Record<string, unknown> = { default_version: '1.0.0' },
): Promise<BuildResult> {
  return buildPersona(
    yamlPath,
    'test-suite',
    suiteConfig,
    sharedMeta,
    {},
    config,
    [],
    'vscode',
  );
}

// ---------------------------------------------------------------------------
// AC-1: BuildConfig.variables values appear in the rendered output when no
//        higher-priority source provides them.
// ---------------------------------------------------------------------------

describe('AC-1 — BuildConfig.variables values appear when no higher-priority source overrides them', () => {
  it('renders a single BuildConfig.variables value via a template placeholder', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nenv: {{environment}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { environment: 'staging' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('env: staging');
  });

  it('renders multiple BuildConfig.variables values when all are unreferenced by higher layers', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\na: {{alpha}}\nb: {{beta}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { alpha: 'first', beta: 'second' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('a: first');
    expect(result.content).toContain('b: second');
  });

  it('renders gracefully when BuildConfig.variables is absent (no-op, backward compat)', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      // no variables field
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('Test Agent');
  });
});

// ---------------------------------------------------------------------------
// AC-2: SuiteConfig.variables values override BuildConfig.variables for the
//        same key.
// ---------------------------------------------------------------------------

describe('AC-2 — SuiteConfig.variables overrides BuildConfig.variables for the same key', () => {
  it('suite-level value wins over config-level value for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\ntier: {{tier}}\n',
    });

    suiteConfig.variables = { tier: 'suite-value' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { tier: 'config-value' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('tier: suite-value');
    expect(result.content).not.toContain('config-value');
  });

  it('config-level key not shadowed by suite still appears in the output', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nconfig_only: {{config_only}}\nsuite_only: {{suite_only}}\n',
    });

    suiteConfig.variables = { suite_only: 'from-suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { config_only: 'from-config' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('config_only: from-config');
    expect(result.content).toContain('suite_only: from-suite');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Persona YAML values override both SuiteConfig.variables and
//        BuildConfig.variables for the same key.
// ---------------------------------------------------------------------------

describe('AC-3 — persona YAML values override both SuiteConfig.variables and BuildConfig.variables', () => {
  it('persona YAML overrides BuildConfig.variables for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml:
        'name: Test Agent\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nmy_key: from_persona\n',
      contentMd: '# {{name}}\nval: {{my_key}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { my_key: 'from_config' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('val: from_persona');
    expect(result.content).not.toContain('from_config');
  });

  it('persona YAML overrides SuiteConfig.variables for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml:
        'name: Test Agent\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nmy_key: from_persona\n',
      contentMd: '# {{name}}\nval: {{my_key}}\n',
    });

    suiteConfig.variables = { my_key: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('val: from_persona');
    expect(result.content).not.toContain('from_suite');
  });

  it('full three-layer chain — persona wins over suite and config for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml:
        'name: Test Agent\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nresolution: persona\n',
      contentMd: '# {{name}}\nresolution: {{resolution}}\n',
    });

    suiteConfig.variables = { resolution: 'suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { resolution: 'config' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config);

    expect(result.content).toContain('resolution: persona');
    expect(result.content).not.toContain('resolution: suite');
    expect(result.content).not.toContain('resolution: config');
  });
});

// ---------------------------------------------------------------------------
// AC-4: _shared.yaml values override BuildConfig.variables (but are
//        overridden by persona YAML).
// ---------------------------------------------------------------------------

describe('AC-4 — _shared.yaml values override BuildConfig.variables but are overridden by persona YAML', () => {
  it('_shared.yaml value wins over BuildConfig.variables for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\nenv: from_shared\n',
      contentMd: '# {{name}}\nenv: {{env}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { env: 'from_config' },
    };

    // Pass the shared values directly — same as what buildSuite() supplies to buildPersona()
    const result = await renderPersona(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
      env: 'from_shared',
    });

    expect(result.content).toContain('env: from_shared');
    expect(result.content).not.toContain('from_config');
  });

  it('persona YAML overrides _shared.yaml for the same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\nenv: from_shared\n',
      personaYaml:
        'name: Test Agent\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nenv: from_persona\n',
      contentMd: '# {{name}}\nenv: {{env}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { env: 'from_config' },
    };

    const result = await renderPersona(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
      env: 'from_shared',
    });

    expect(result.content).toContain('env: from_persona');
    expect(result.content).not.toContain('from_shared');
    expect(result.content).not.toContain('from_config');
  });

  it('end-to-end via buildSuite(): _shared.yaml overrides BuildConfig.variables', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\nsource: from_shared\n',
      contentMd: '# {{name}}\nsource: {{source}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { source: 'from_config' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('source: from_shared');
    expect(results[0].content).not.toContain('from_config');
  });
});

// ---------------------------------------------------------------------------
// AC-5: BuildConfig.partials entries are present in the rendered template
//        output.
// ---------------------------------------------------------------------------

describe('AC-5 — BuildConfig.partials entries appear in rendered output', () => {
  it('renders a partial defined in BuildConfig.partials when referenced in content', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n{{> disclaimer}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { disclaimer: 'This is a config-level disclaimer.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('This is a config-level disclaimer.');
  });

  it('renders multiple BuildConfig.partials in a single persona output', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> header}}\n\n# {{name}}\n\n{{> footer}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: {
        header: 'Config header.',
        footer: 'Config footer.',
      },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Config header.');
    expect(results[0].content).toContain('Config footer.');
  });

  it('config partial that has no file-based counterpart is still rendered', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      // suite has a file partial named "greeting"; "info" comes only from config
      suitePartials: { greeting: 'File-based greeting.' },
      contentMd: '{{> greeting}}\n{{> info}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { info: 'Config-only info block.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Config-only info block.');
    // The file-based greeting should also still be present
    expect(results[0].content).toContain('File-based greeting.');
  });
});

// ---------------------------------------------------------------------------
// AC-6: File-based partials with the same stem name override BuildConfig.partials.
// ---------------------------------------------------------------------------

describe('AC-6 — file-based partials override BuildConfig.partials for the same stem name', () => {
  it('suite-local file partial wins over BuildConfig.partials entry with the same key', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Suite-local greeting (file).' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { greeting: 'Config-level greeting.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Suite-local greeting (file).');
    expect(results[0].content).not.toContain('Config-level greeting.');
  });

  it('shared file partial wins over BuildConfig.partials entry with the same key', async () => {
    // Put the shared partial in a temp shared-partials directory
    const sharedPartialsDir = path.join(testTmpDir, 'shared-partials');
    await mkdir(sharedPartialsDir, { recursive: true });
    await writeFile(path.join(sharedPartialsDir, 'greeting.md'), 'Shared file greeting.');

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { greeting: 'Config-level greeting.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Shared file greeting.');
    expect(results[0].content).not.toContain('Config-level greeting.');
  });

  it('BuildConfig.partials key not shadowed by any file partial still appears', async () => {
    const sharedPartialsDir = path.join(testTmpDir, 'shared-partials');
    await mkdir(sharedPartialsDir, { recursive: true });
    // "other" is a file partial; "config-only" exists only in BuildConfig.partials
    await writeFile(path.join(sharedPartialsDir, 'other.md'), 'Other shared partial.');

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> config-only}}\n{{> other}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { 'config-only': 'Config-only partial.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Config-only partial.');
    expect(results[0].content).toContain('Other shared partial.');
  });

  it('full three-layer priority: suite-local file > shared file > BuildConfig.partials', async () => {
    const sharedPartialsDir = path.join(testTmpDir, 'shared-partials');
    await mkdir(sharedPartialsDir, { recursive: true });
    await writeFile(path.join(sharedPartialsDir, 'greeting.md'), 'Shared file greeting.');

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Suite-local greeting (file).' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { greeting: 'Config-level greeting.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    // Suite-local file partial is the highest priority of the three layers
    expect(results[0].content).toContain('Suite-local greeting (file).');
    expect(results[0].content).not.toContain('Shared file greeting.');
    expect(results[0].content).not.toContain('Config-level greeting.');
  });
});
