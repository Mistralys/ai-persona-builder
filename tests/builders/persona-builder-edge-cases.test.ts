/**
 * tests/builders/persona-builder-edge-cases.test.ts
 *
 * QA edge-case stress tests for WP-006.
 * These exercise failure modes and boundary conditions NOT covered by the
 * Developer's AC tests.
 *
 * Edge cases probed:
 *   EC-1: build() with empty suites record → empty but valid BuildSummary
 *   EC-2: build() strict:true (no check) writes files then throws → files exist on disk after throw
 *   EC-3: buildPersona() where persona YAML has no name field → name derived from filename stem
 *   EC-4: buildSuite() with no persona YAMLs in meta/ → returns empty array (no crash)
 *   EC-5: build() targets:[] (empty targets list) → no results, success=true
 *   EC-6: Multiple plugins each returning ValidationResults → all collected, strict failure aggregates all
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, buildPersona, buildSuite } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin, SuiteConfig } from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `persona-build-ec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

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

  await writeFile(
    path.join(suiteDir, 'meta', '_shared.yaml'),
    opts.sharedYaml ?? `default_version: '2.0.0'\nauthor: test-author\n`,
  );

  await writeFile(
    path.join(suiteDir, 'meta', `${pName}.yaml`),
    opts.personaYaml ??
      `name: Test Persona\ndescription: A test persona.\nvs_file_name: ${pName}.agent.md\ncc_file_name: ${pName}.md\ntools:\n  - read\n`,
  );

  await writeFile(
    path.join(suiteDir, 'content', `${pName}.md`),
    opts.contentMd ?? `# {{name}}\n\n{{description}}\n`,
  );

  return { suiteDir, outDir };
}

// ---------------------------------------------------------------------------
// EC-1: Empty suites record
// ---------------------------------------------------------------------------

describe('EC-1: empty suites record', () => {
  it('returns a valid empty BuildSummary without throwing', async () => {
    const summary = await build({ suites: {} });

    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBe(0);
    expect(summary.totalWritten).toBe(0);
    expect(summary.results).toEqual([]);
    expect(summary.strictFailures).toEqual([]);
  });

  it('returns valid empty BuildSummary in strict mode with no suites', async () => {
    const summary = await build({ suites: {}, strict: true });

    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBe(0);
    expect(summary.strictFailures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EC-2: strict:true without check:true — files are written before the throw
// ---------------------------------------------------------------------------

describe('EC-2: strict mode without check — file write then throw', () => {
  it('writes output files to disk even when strict mode throws', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const plugin: PersonaBuildPlugin = {
      name: 'strict-error',
      onValidate() {
        return [{ severity: 'error', message: 'Strict failure after write.' }];
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
      // check is NOT set — files WILL be written
      plugins: [plugin],
    };

    // Expect the build to throw due to strict mode
    await expect(build(config)).rejects.toThrow(/strict mode/i);

    // Despite the throw, the output file SHOULD have been written
    // (build processes all suites first, then throws at the end)
    const outputFile = path.join(outDir, 'vscode', 'test-persona.agent.md');
    expect(existsSync(outputFile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EC-3: Persona YAML with no name field → derives from filename stem
// ---------------------------------------------------------------------------

describe('EC-3: persona YAML missing name field', () => {
  it('derives the name from the filename stem when name is absent in YAML', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir, {
      personaYaml: `description: No name here.\nvs_file_name: test-persona.agent.md\ncc_file_name: test-persona.md\n`,
      contentMd: '# {{name}}\n\n{{description}}\n',
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

    expect(summary.success).toBe(true);
    // Name should fall back to 'test-persona' (the filename stem)
    expect(summary.results[0].content).toContain('test-persona');
    expect(summary.results[0].content).toContain('No name here.');
  });
});

// ---------------------------------------------------------------------------
// EC-4: No persona YAMLs in meta/ → empty result array
// ---------------------------------------------------------------------------

describe('EC-4: meta/ directory with no persona YAMLs', () => {
  it('returns an empty results array without throwing when no persona files exist', async () => {
    const suiteDir = path.join(testTmpDir, 'empty-suite');
    const outDir = path.join(testTmpDir, 'out');

    // Only _shared.yaml — no persona files
    await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
    await mkdir(path.join(suiteDir, 'content'), { recursive: true });
    await writeFile(
      path.join(suiteDir, 'meta', '_shared.yaml'),
      `default_version: '1.0.0'\n`,
    );

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { empty: suiteConfig },
      targets: ['vscode'],
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBe(0);
    expect(summary.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EC-5: Empty targets array
// ---------------------------------------------------------------------------

describe('EC-5: empty targets array', () => {
  it('returns empty BuildSummary when targets is an empty array', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: path.join(outDir, 'vscode'),
      outClaudeCode: path.join(outDir, 'cc'),
    };

    const config: BuildConfig = {
      suites: { test: suiteConfig },
      targets: [],
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBe(0);
    expect(summary.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EC-6: Multiple plugins each emitting ValidationResults
// ---------------------------------------------------------------------------

describe('EC-6: multiple plugins with ValidationResults', () => {
  it('collects ValidationResults from all plugins into each result', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const pluginA: PersonaBuildPlugin = {
      name: 'validator-a',
      onValidate() {
        return [{ severity: 'info', message: 'Plugin A says OK.' }];
      },
    };

    const pluginB: PersonaBuildPlugin = {
      name: 'validator-b',
      onValidate() {
        return [{ severity: 'warning', message: 'Plugin B warns.' }];
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
      plugins: [pluginA, pluginB],
    };

    const summary = await build(config);

    const allVR = summary.results.flatMap((r) => r.validationResults);
    expect(allVR).toHaveLength(2);
    expect(allVR.some((v) => v.message === 'Plugin A says OK.')).toBe(true);
    expect(allVR.some((v) => v.message === 'Plugin B warns.')).toBe(true);
  });

  it('strict mode aggregates failures from all plugins', async () => {
    const { suiteDir, outDir } = await createMinimalSuite(testTmpDir);

    const pluginA: PersonaBuildPlugin = {
      name: 'plugin-a-error',
      onValidate() {
        return [{ severity: 'error', message: 'Plugin A error.' }];
      },
    };

    const pluginB: PersonaBuildPlugin = {
      name: 'plugin-b-warning',
      onValidate() {
        return [{ severity: 'warning', message: 'Plugin B warning.' }];
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
      plugins: [pluginA, pluginB],
    };

    try {
      await build(config);
      expect.fail('Should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('Plugin A error.');
      expect(msg).toContain('Plugin B warning.');
    }
  });
});
