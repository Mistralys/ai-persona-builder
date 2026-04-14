/**
 * tests/builders/config-suite-variables.test.ts
 *
 * QA verification for WP-002 — Custom Variables Wiring in buildContext()
 *
 * Verifies all 7 Acceptance Criteria:
 *   AC-1: buildContext() accepts optional configVariables and suiteVariables parameters
 *   AC-2: configVariables entries appear but are overridden by suiteVariables, sharedMeta, personaMeta
 *   AC-3: suiteVariables overrides configVariables but is overridden by sharedMeta and personaMeta
 *   AC-4: When neither parameter is provided, existing behaviour is unchanged
 *   AC-5: buildPersona() passes config.variables and suiteConfig.variables to buildContext()
 *   AC-6: Project compiles without errors (verified via tsc --noEmit)
 *   AC-7: All existing tests continue to pass unchanged (verified by running full suite)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildPersona } from '../../src/builders/persona-builder.js';
import type { BuildConfig, BuildResult } from '../../src/builders/types.js';
import type { SuiteConfig } from '../../src/plugins/types.js';
import { createMinimalSuite } from '../helpers/suite-fixture.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `wp002-vars-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: build and return rendered context via buildPersona()
// Trick: embed variable references in content template so we can read them back
// ---------------------------------------------------------------------------

async function buildAndGetContent(
  yamlPath: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  sharedMeta: Record<string, unknown>,
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
// AC-4: Backward compatibility — when no variables provided, existing behaviour
// ---------------------------------------------------------------------------

describe('AC-4 — backward compatibility (no variables provided)', () => {
  it('renders correctly without configVariables or suiteVariables', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: 'name: Test Agent\ndescription: A test.\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\n',
      contentMd: '# {{name}}\n{{description}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      // No variables field
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    expect(result.content).toContain('Test Agent');
    expect(result.content).toContain('A test.');
  });
});

// ---------------------------------------------------------------------------
// AC-1 & AC-5: buildPersona() passes config.variables → buildContext()
// ---------------------------------------------------------------------------

describe('AC-1 & AC-5 — config.variables flows through to rendered output', () => {
  it('renders a configVariables value when referenced in template', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nenv: {{environment}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { environment: 'production' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    expect(result.content).toContain('env: production');
  });

  it('renders a suiteConfig.variables value when referenced in template', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nregion: {{region}}\n',
    });

    suiteConfig.variables = { region: 'us-east-1' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    expect(result.content).toContain('region: us-east-1');
  });
});

// ---------------------------------------------------------------------------
// AC-2: configVariables is overridden by suiteVariables, sharedMeta, personaMeta
// ---------------------------------------------------------------------------

describe('AC-2 — configVariables override priority', () => {
  it('suiteVariables overrides configVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    suiteConfig.variables = { my_var: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { my_var: 'from_config' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    // suite wins over config
    expect(result.content).toContain('env: from_suite');
    expect(result.content).not.toContain('from_config');
  });

  it('sharedMeta overrides configVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\nmy_var: from_shared\n',
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { my_var: 'from_config' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
      my_var: 'from_shared',
    });

    // sharedMeta wins over configVariables
    expect(result.content).toContain('env: from_shared');
    expect(result.content).not.toContain('from_config');
  });

  it('personaMeta overrides configVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: 'name: Test Agent\ndescription: A test.\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nmy_var: from_persona\n',
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { my_var: 'from_config' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    // personaMeta wins over configVariables
    expect(result.content).toContain('env: from_persona');
    expect(result.content).not.toContain('from_config');
  });
});

// ---------------------------------------------------------------------------
// AC-3: suiteVariables overrides configVariables but is overridden by sharedMeta, personaMeta
// ---------------------------------------------------------------------------

describe('AC-3 — suiteVariables override priority', () => {
  it('suiteVariables overrides configVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    suiteConfig.variables = { my_var: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { my_var: 'from_config' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    expect(result.content).toContain('env: from_suite');
  });

  it('sharedMeta overrides suiteVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\nmy_var: from_shared\n',
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    suiteConfig.variables = { my_var: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
      my_var: 'from_shared',
    });

    // sharedMeta wins over suiteVariables
    expect(result.content).toContain('env: from_shared');
    expect(result.content).not.toContain('from_suite');
  });

  it('personaMeta overrides suiteVariables for same key', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: 'name: Test Agent\ndescription: A test.\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\nmy_var: from_persona\n',
      contentMd: '# {{name}}\nenv: {{my_var}}\n',
    });

    suiteConfig.variables = { my_var: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    // personaMeta wins over suiteVariables
    expect(result.content).toContain('env: from_persona');
    expect(result.content).not.toContain('from_suite');
  });
});

// ---------------------------------------------------------------------------
// Edge cases — stress tests
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('handles configVariables with empty object gracefully (no crash)', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {});

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: {},
    };

    await expect(
      buildAndGetContent(yamlPath, suiteConfig, config, { default_version: '1.0.0' }),
    ).resolves.toBeDefined();
  });

  it('handles suiteConfig.variables with empty object gracefully (no crash)', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {});
    suiteConfig.variables = {};

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await expect(
      buildAndGetContent(yamlPath, suiteConfig, config, { default_version: '1.0.0' }),
    ).resolves.toBeDefined();
  });

  it('configVariables with many keys — all appear in output when not shadowed', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\na: {{var_a}}\nb: {{var_b}}\nc: {{var_c}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { var_a: 'alpha', var_b: 'beta', var_c: 'gamma' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
    });

    expect(result.content).toContain('a: alpha');
    expect(result.content).toContain('b: beta');
    expect(result.content).toContain('c: gamma');
  });

  it('full 4-layer override chain: config → suite → shared → persona (persona wins)', async () => {
    const { yamlPath, suiteConfig } = await createMinimalSuite(testTmpDir, {
      sharedYaml: 'default_version: "1.0.0"\npriority_key: from_shared\n',
      personaYaml: 'name: Test Agent\ndescription: A test.\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\npriority_key: from_persona\n',
      contentMd: '# {{name}}\nval: {{priority_key}}\n',
    });

    suiteConfig.variables = { priority_key: 'from_suite' };

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      variables: { priority_key: 'from_config' },
    };

    const result = await buildAndGetContent(yamlPath, suiteConfig, config, {
      default_version: '1.0.0',
      priority_key: 'from_shared',
    });

    // persona wins the full chain
    expect(result.content).toContain('val: from_persona');
  });
});
