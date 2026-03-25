/**
 * tests/builders/persona-builder.test.ts
 *
 * Integration-level tests for the builder core:
 *   - buildPersona()  — single persona pipeline
 *   - buildSuite()    — suite-level discovery + batching
 *   - build()         — top-level entry point with check/strict modes
 *
 * Strategy:
 *   - Each test creates a temporary directory tree, populates it with
 *     minimal fixture files, and exercises the live builder against it.
 *   - The fixtures/ directory in the project root provides a canonical
 *     "happy path" suite for positive assertions.
 *   - Strict-mode and check-mode tests use ephemeral temp directories.
 *
 * Acceptance Criteria verified:
 *   AC-1: buildPersona() produces correct rendered output for a fixture persona
 *   AC-2: buildSuite() processes all discovered personas → BuildResult[]
 *   AC-3: build(config) is callable, accepts BuildConfig, returns BuildSummary
 *   AC-4: --check mode completes without writing files
 *   AC-5: --strict mode throws when any ValidationResult has severity error/warning
 *   AC-6: All builder tests pass; TypeScript strict-mode reports zero errors
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPersona, buildSuite, build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin, SuiteConfig } from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Fixtures directory (from the project root)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_SUITE_DIR = path.join(FIXTURES_ROOT, 'sample-suite');
const SHARED_PARTIALS_DIR = path.join(FIXTURES_ROOT, 'shared', 'partials');

const SAMPLE_SUITE_CONFIG: SuiteConfig = {
  srcDir: SAMPLE_SUITE_DIR,
  outVscode: path.join(FIXTURES_ROOT, 'out', 'vscode'),
  outClaudeCode: path.join(FIXTURES_ROOT, 'out', 'claude-code'),
};

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `persona-build-builder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  // Clean up the temp directory
  await rm(testTmpDir, { recursive: true, force: true });

  // Clean up any fixture output directories created during positive-path tests
  const outDir = path.join(FIXTURES_ROOT, 'out');
  await rm(outDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal suite directory in a temp folder
// ---------------------------------------------------------------------------

async function createMinimalSuite(
  baseDir: string,
  opts: {
    sharedYaml?: string;
    personaYaml?: string;
    contentMd?: string;
    personaName?: string;
  } = {},
): Promise<{ suiteDir: string; outDir: string }> {
  const suiteDir = path.join(baseDir, 'my-suite');
  const outDir = path.join(baseDir, 'out');

  await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
  await mkdir(path.join(suiteDir, 'content'), { recursive: true });
  await mkdir(path.join(suiteDir, 'partials'), { recursive: true });

  const pName = opts.personaName ?? 'test-persona';

  // _shared.yaml
  await writeFile(
    path.join(suiteDir, 'meta', '_shared.yaml'),
    opts.sharedYaml ??
      `default_version: '2.0.0'\nauthor: test-author\nlast_updated: '2026-01-01'\n`,
  );

  // per-persona YAML
  await writeFile(
    path.join(suiteDir, 'meta', `${pName}.yaml`),
    opts.personaYaml ??
      `name: Test Persona\ndescription: A test persona.\nvs_file_name: ${pName}.agent.md\ncc_file_name: ${pName}.md\ntools:\n  - read\n`,
  );

  // content template
  await writeFile(
    path.join(suiteDir, 'content', `${pName}.md`),
    opts.contentMd ?? `# {{name}}\n\n{{description}}\n`,
  );

  return { suiteDir, outDir };
}

// ---------------------------------------------------------------------------
// buildPersona() — AC-1
// ---------------------------------------------------------------------------

describe('buildPersona() — AC-1', () => {
  it('renders the correct output for the fixture example-persona (vscode target)', async () => {
    const outDir = path.join(FIXTURES_ROOT, 'out', 'vscode');
    const personaYamlPath = path.join(SAMPLE_SUITE_DIR, 'meta', 'example-persona.yaml');

    // Load shared meta and partials manually for this test
    const config: BuildConfig = {
      suites: { sample: SAMPLE_SUITE_CONFIG },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
    };

    // Load the shared.yaml and partials as the builder would
    const { loadPartials } = await import('../../src/loaders/partials-loader.js');
    const yaml = (await import('js-yaml')).default;
    const { readFile: readFs } = await import('node:fs/promises');

    const sharedMeta = yaml.load(
      await readFs(path.join(SAMPLE_SUITE_DIR, 'meta', '_shared.yaml'), 'utf8'),
    ) as Record<string, unknown>;

    const sharedPartials = await loadPartials(SHARED_PARTIALS_DIR);
    const suitePartials = await loadPartials(path.join(SAMPLE_SUITE_DIR, 'partials'));
    const partialsMap = { ...sharedPartials, ...suitePartials };

    const result = await buildPersona(
      personaYamlPath,
      'sample',
      SAMPLE_SUITE_CONFIG,
      sharedMeta,
      partialsMap,
      config,
      [],
      'vscode',
    );

    // Content assertions
    expect(result.suite).toBe('sample');
    expect(result.target).toBe('vscode');
    expect(result.written).toBe(true);
    expect(result.validationResults).toEqual([]);

    // Rendered output should contain variable substitutions
    expect(result.content).toContain('Example Persona');
    expect(result.content).toContain('1.0.0'); // from _shared.yaml default_version
    expect(result.content).toContain('A minimal example persona for integration testing.');

    // Partial {{> greeting}} should have been resolved
    expect(result.content).toContain('Hello, I am Example Persona.');

    // Output file should exist
    expect(existsSync(result.outputPath)).toBe(true);
    const written = await readFile(result.outputPath, 'utf8');
    expect(written).toBe(result.content);
  });

  it('renders the correct output for the fixture example-persona (claude-code target)', async () => {
    const personaYamlPath = path.join(SAMPLE_SUITE_DIR, 'meta', 'example-persona.yaml');

    const { loadPartials } = await import('../../src/loaders/partials-loader.js');
    const yaml = (await import('js-yaml')).default;
    const { readFile: readFs } = await import('node:fs/promises');

    const sharedMeta = yaml.load(
      await readFs(path.join(SAMPLE_SUITE_DIR, 'meta', '_shared.yaml'), 'utf8'),
    ) as Record<string, unknown>;

    const sharedPartials = await loadPartials(SHARED_PARTIALS_DIR);
    const suitePartials = await loadPartials(path.join(SAMPLE_SUITE_DIR, 'partials'));
    const partialsMap = { ...sharedPartials, ...suitePartials };

    const config: BuildConfig = {
      suites: { sample: SAMPLE_SUITE_CONFIG },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['claude-code'],
    };

    const result = await buildPersona(
      personaYamlPath,
      'sample',
      SAMPLE_SUITE_CONFIG,
      sharedMeta,
      partialsMap,
      config,
      [],
      'claude-code',
    );

    expect(result.target).toBe('claude-code');
    expect(result.written).toBe(true);
    expect(result.content).toContain('Example Persona');
    expect(result.content).toContain('Hello, I am Example Persona.');
    // Output file should use cc_file_name
    expect(path.basename(result.outputPath)).toBe('example-persona.md');
  });

  it('does not write a file when check mode is enabled', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const personaYamlPath = path.join(suiteDir, 'meta', 'test-persona.yaml');

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      check: true,
    };

    const result = await buildPersona(
      personaYamlPath,
      'test',
      suiteConfig,
      { default_version: '2.0.0' },
      {},
      config,
      [],
      'vscode',
    );

    expect(result.written).toBe(false);
    expect(existsSync(path.join(outDir, 'vscode', 'test-persona.agent.md'))).toBe(false);
    // Content is still rendered
    expect(result.content).toContain('Test Persona');
  });

  it('runs plugin onBuildContext hook and uses the mutated context', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const personaYamlPath = path.join(suiteDir, 'meta', 'test-persona.yaml');

    // Custom content template that uses a plugin-injected variable
    await writeFile(
      path.join(suiteDir, 'content', 'test-persona.md'),
      '# {{name}}\n\nInjected: {{plugin_value}}\n',
    );

    const plugin: PersonaBuildPlugin = {
      name: 'context-injector',
      onBuildContext(ctx) {
        return { ...ctx, plugin_value: 'hello-from-plugin' };
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
    };

    const result = await buildPersona(
      personaYamlPath,
      'test',
      suiteConfig,
      { default_version: '2.0.0' },
      {},
      config,
      [plugin],
      'vscode',
    );

    expect(result.content).toContain('hello-from-plugin');
  });

  it('runs plugin onPostRender hook and uses the mutated output', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const personaYamlPath = path.join(suiteDir, 'meta', 'test-persona.yaml');

    const plugin: PersonaBuildPlugin = {
      name: 'post-render-suffix',
      onPostRender(output) {
        return output + '\n<!-- GENERATED -->';
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
    };

    const result = await buildPersona(
      personaYamlPath,
      'test',
      suiteConfig,
      { default_version: '2.0.0' },
      {},
      config,
      [plugin],
      'vscode',
    );

    expect(result.content).toContain('<!-- GENERATED -->');
  });

  it('collects ValidationResults from plugin onValidate hook', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const personaYamlPath = path.join(suiteDir, 'meta', 'test-persona.yaml');

    const plugin: PersonaBuildPlugin = {
      name: 'validator',
      onValidate() {
        return [{ severity: 'info', message: 'Looks good.' }];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    const result = await buildPersona(
      personaYamlPath,
      'test',
      suiteConfig,
      { default_version: '2.0.0' },
      {},
      config,
      [plugin],
      'vscode',
    );

    expect(result.validationResults).toHaveLength(1);
    expect(result.validationResults[0]).toMatchObject({
      severity: 'info',
      message: 'Looks good.',
    });
  });

  it('uses plugin frontmatterTemplates when provided', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const personaYamlPath = path.join(suiteDir, 'meta', 'test-persona.yaml');

    const customTemplate = `---\ncustom: true\nname: {{name}}\n---`;

    const plugin: PersonaBuildPlugin = {
      name: 'custom-fm',
      frontmatterTemplates: { vscode: customTemplate },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    const result = await buildPersona(
      personaYamlPath,
      'test',
      suiteConfig,
      { default_version: '2.0.0' },
      {},
      config,
      [plugin],
      'vscode',
    );

    expect(result.content).toContain('custom: true');
    expect(result.content).toContain('name: Test Persona');
  });
});

// ---------------------------------------------------------------------------
// buildSuite() — AC-2
// ---------------------------------------------------------------------------

describe('buildSuite() — AC-2', () => {
  it('returns an array of BuildResult objects for each discovered persona', async () => {
    const config: BuildConfig = {
      suites: { sample: SAMPLE_SUITE_CONFIG },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
    };

    const results = await buildSuite('sample', SAMPLE_SUITE_CONFIG, config, [], 'vscode');

    expect(Array.isArray(results)).toBe(true);
    // The sample suite has exactly one persona (example-persona.yaml)
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      suite: 'sample',
      target: 'vscode',
    });
  });

  it('processes multiple personas in a suite', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      personaName: 'persona-a',
      personaYaml: 'name: Persona A\ndescription: First.\nvs_file_name: persona-a.agent.md\ncc_file_name: persona-a.md\n',
      contentMd: '# {{name}}\n\n{{description}}\n',
    });

    // Add a second persona
    await writeFile(
      path.join(suiteDir, 'meta', 'persona-b.yaml'),
      'name: Persona B\ndescription: Second.\nvs_file_name: persona-b.agent.md\ncc_file_name: persona-b.md\n',
    );
    await writeFile(
      path.join(suiteDir, 'content', 'persona-b.md'),
      '# {{name}}\n\n{{description}}\n',
    );

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test', suiteConfig, config, [], 'vscode');

    expect(results).toHaveLength(2);
    expect(results.map((r) => path.basename(r.outputPath)).sort()).toEqual([
      'persona-a.agent.md',
      'persona-b.agent.md',
    ]);
  });

  it('excludes _shared.yaml from discovered persona files', async () => {
    const config: BuildConfig = {
      suites: { sample: SAMPLE_SUITE_CONFIG },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
    };

    const results = await buildSuite('sample', SAMPLE_SUITE_CONFIG, config, [], 'vscode');

    // Should not attempt to build _shared.yaml as a persona
    for (const result of results) {
      expect(path.basename(result.personaYamlPath)).not.toBe('_shared.yaml');
    }
  });

  it('fires onSuiteInit before building personas', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);
    const callLog: string[] = [];

    const plugin: PersonaBuildPlugin = {
      name: 'suite-init-tracker',
      onSuiteInit() {
        callLog.push('suiteInit');
      },
      onBuildContext(ctx) {
        callLog.push('buildContext');
        return ctx;
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    await buildSuite('test', suiteConfig, config, [plugin], 'vscode');

    expect(callLog[0]).toBe('suiteInit');
    expect(callLog).toContain('buildContext');
  });

  it('loads shared partials and suite-local partials', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> greeting}}\n\n# {{name}}\n',
    });

    // Create a shared partials dir with a greeting partial
    const sharedPartialsDir = path.join(testTmpDir, 'shared', 'partials');
    await mkdir(sharedPartialsDir, { recursive: true });
    await writeFile(path.join(sharedPartialsDir, 'greeting.md'), 'Hello from shared!');

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      sharedPartialsDir,
      targets: ['vscode'],
      check: true,
    };

    const results = await buildSuite('test', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Hello from shared!');
  });

  it('suite-local partials override shared partials of the same name', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> greeting}}\n\n# {{name}}\n',
    });

    // Shared partial
    const sharedPartialsDir = path.join(testTmpDir, 'shared', 'partials');
    await mkdir(sharedPartialsDir, { recursive: true });
    await writeFile(path.join(sharedPartialsDir, 'greeting.md'), 'Hello from shared!');

    // Suite-local override
    await writeFile(path.join(suiteDir, 'partials', 'greeting.md'), 'Hello from suite-local!');

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      sharedPartialsDir,
      targets: ['vscode'],
      check: true,
    };

    const results = await buildSuite('test', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Hello from suite-local!');
    expect(results[0].content).not.toContain('Hello from shared!');
  });
});

// ---------------------------------------------------------------------------
// build() — AC-3: callable, accepts BuildConfig, returns BuildSummary
// ---------------------------------------------------------------------------

describe('build() — AC-3', () => {
  it('returns a BuildSummary with success=true for a valid suite', async () => {
    const config: BuildConfig = {
      suites: { sample: SAMPLE_SUITE_CONFIG },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode', 'claude-code'],
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(Array.isArray(summary.results)).toBe(true);
    // 1 persona × 2 targets = 2 results
    expect(summary.results).toHaveLength(2);
    expect(summary.totalBuilt).toBe(2);
    expect(summary.totalWritten).toBe(2);
    expect(summary.strictFailures).toEqual([]);
  });

  it('iterates all suites × targets', async () => {
    const { suiteDir: suiteADir, outDir: outADir } = await createMinimalSuite(testTmpDir);
    const suiteBDir = path.join(testTmpDir, 'suite-b');
    const outBDir = path.join(testTmpDir, 'out-b');

    // Create suite B
    await mkdir(path.join(suiteBDir, 'meta'), { recursive: true });
    await mkdir(path.join(suiteBDir, 'content'), { recursive: true });
    await writeFile(
      path.join(suiteBDir, 'meta', '_shared.yaml'),
      `default_version: '1.0.0'\n`,
    );
    await writeFile(
      path.join(suiteBDir, 'meta', 'suite-b-persona.yaml'),
      `name: Suite B Persona\ndescription: Suite B.\nvs_file_name: suite-b-persona.agent.md\ncc_file_name: suite-b-persona.md\n`,
    );
    await writeFile(
      path.join(suiteBDir, 'content', 'suite-b-persona.md'),
      '# {{name}}\n',
    );

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteADir,
          outVscode: path.join(outADir, 'vscode'),
          outClaudeCode: path.join(outADir, 'cc'),
        },
        'suite-b': {
          srcDir: suiteBDir,
          outVscode: path.join(outBDir, 'vscode'),
          outClaudeCode: path.join(outBDir, 'cc'),
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);

    // 2 suites × 1 target × 1 persona each = 2 results
    expect(summary.totalBuilt).toBe(2);
    const suiteNames = summary.results.map((r) => r.suite).sort();
    expect(suiteNames).toEqual(['suite-a', 'suite-b']);
  });
});

// ---------------------------------------------------------------------------
// --check mode — AC-4
// ---------------------------------------------------------------------------

describe('--check mode — AC-4', () => {
  it('completes without writing any files to disk', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(summary.totalWritten).toBe(0);
    // Output directories should not have been created
    expect(existsSync(path.join(outDir, 'vscode'))).toBe(false);
    expect(existsSync(path.join(outDir, 'cc'))).toBe(false);
    // All results report written=false
    for (const result of summary.results) {
      expect(result.written).toBe(false);
    }
  });

  it('still renders content and accumulates ValidationResults in check mode', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'check-validator',
      onValidate() {
        return [{ severity: 'info', message: 'Check mode validation ran.' }];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
      plugins: [plugin],
    };

    const summary = await build(config);

    expect(summary.totalWritten).toBe(0);
    const allValidation = summary.results.flatMap((r) => r.validationResults);
    expect(allValidation).toHaveLength(1);
    expect(allValidation[0].message).toBe('Check mode validation ran.');
  });
});

// ---------------------------------------------------------------------------
// --strict mode — AC-5
// ---------------------------------------------------------------------------

describe('--strict mode — AC-5', () => {
  it('throws when a plugin returns a ValidationResult with severity "error"', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'error-validator',
      onValidate() {
        return [{ severity: 'error', message: 'This persona has an error.' }];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      strict: true,
      check: true,
      plugins: [plugin],
    };

    await expect(build(config)).rejects.toThrow(/strict mode/i);
  });

  it('throws when a plugin returns a ValidationResult with severity "warning"', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'warning-validator',
      onValidate() {
        return [{ severity: 'warning', message: 'This persona has a warning.' }];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      strict: true,
      check: true,
      plugins: [plugin],
    };

    await expect(build(config)).rejects.toThrow(/strict mode/i);
  });

  it('does NOT throw in strict mode when all ValidationResults have severity "info"', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'info-only-validator',
      onValidate() {
        return [{ severity: 'info', message: 'All good.' }];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      strict: true,
      check: true,
      plugins: [plugin],
    };

    await expect(build(config)).resolves.toMatchObject({ success: true });
  });

  it('populates strictFailures in the thrown error context', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'multi-error-validator',
      onValidate() {
        return [
          { severity: 'error', message: 'Error one.' },
          { severity: 'warning', message: 'Warning one.' },
          { severity: 'info', message: 'Info note.' },
        ];
      },
    };

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      strict: true,
      check: true,
      plugins: [plugin],
    };

    try {
      await build(config);
      expect.fail('build() should have thrown in strict mode');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      // Error message should describe both failures
      expect(msg).toContain('Error one.');
      expect(msg).toContain('Warning one.');
      // Info should NOT be reported as a strict failure
      expect(msg).not.toContain('Info note.');
    }
  });

  it('does not throw in strict mode when there are no ValidationResults', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      strict: true,
      check: true,
    };

    const summary = await build(config);
    expect(summary.success).toBe(true);
    expect(summary.strictFailures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Context derivation helpers
// ---------------------------------------------------------------------------

describe('context derivation', () => {
  it('derives version from _shared.yaml default_version when not in persona YAML', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      sharedYaml: `default_version: '9.9.9'\n`,
      contentMd: 'Version: {{version}}\n',
    });

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.results[0].content).toContain('Version: 9.9.9');
  });

  it('per-persona version overrides shared default_version', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      sharedYaml: `default_version: '1.0.0'\n`,
      personaYaml: `name: Versioned\ndescription: Desc.\nversion: '5.0.0'\nvs_file_name: test-persona.agent.md\ncc_file_name: test-persona.md\n`,
      contentMd: 'Version: {{version}}\n',
    });

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.results[0].content).toContain('Version: 5.0.0');
  });

  it('computes tools_list from tools array', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      contentMd: 'Tools: {{tools_list}}\n',
    });

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    // Default persona has tools: [read]
    expect(summary.results[0].content).toContain("'read'");
  });
});
