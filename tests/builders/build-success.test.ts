/**
 * tests/builders/build-success.test.ts
 *
 * Unit/integration tests for WP-010's build() success semantics:
 *   - success = errors === 0 && (!strict || warnings === 0)
 *   - an error-severity result fails a non-strict build (no throw, just
 *     success: false) and a strict build (throws)
 *   - a warning-severity result does NOT fail a non-strict build, but does
 *     fail a strict build
 *   - BuildSummary.errors / warnings counts are correct
 *   - BuildSummary.issues is folded into strictFailures
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `build-success-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

async function createSuite(
  baseDir: string,
  opts: { personaYaml: string; contentMd: string },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, 'src');
  const outVscode = path.join(baseDir, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, 'out', 'claude-code');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });

  await writeFile(path.join(srcDir, 'meta', '_shared.yaml'), "default_version: '1.0.0'\n");
  await writeFile(path.join(srcDir, 'meta', 'persona.yaml'), opts.personaYaml);
  await writeFile(path.join(srcDir, 'content', 'persona.md'), opts.contentMd);

  return { srcDir, outVscode, outClaudeCode };
}

const CLEAN_PERSONA_YAML = [
  'slug: persona',
  'name: Persona',
  'description: Test.',
  'vs_file_name: persona.agent.md',
  'cc_file_name: persona.md',
].join('\n') + '\n';

const UNKNOWN_SUBAGENT_YAML = [
  'slug: persona',
  'name: Persona',
  'description: Test.',
  'subagents:',
  '  - nonexistent-slug',
  'vs_file_name: persona.agent.md',
  'cc_file_name: persona.md',
].join('\n') + '\n';

describe('build() success semantics — errors always fail', () => {
  it('a clean build with no findings succeeds (errors: 0, warnings: 0)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, { personaYaml: CLEAN_PERSONA_YAML, contentMd: '# {{name}}\n' });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.success).toBe(true);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
  });

  it('an error-severity result fails a non-strict build without throwing', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, { personaYaml: UNKNOWN_SUBAGENT_YAML, contentMd: '# {{name}}\n' });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.success).toBe(false);
    expect(summary.errors).toBeGreaterThan(0);
  });

  it('an error-severity result throws in strict mode', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, { personaYaml: UNKNOWN_SUBAGENT_YAML, contentMd: '# {{name}}\n' });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
      strict: true,
    };

    await expect(build(config)).rejects.toThrow(/strict mode/i);
  });

  it('a warning-severity result (foreign notation) does not fail a non-strict build', async () => {
    const base = makeTempDir();
    // 'read' in a claude-code tool list is vscode notation — a warning, not an error.
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'cc_tools:',
        '  - read',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['claude-code'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.warnings).toBeGreaterThan(0);
    expect(summary.errors).toBe(0);
    expect(summary.success).toBe(true);
  });

  it('a warning-severity result fails a strict build', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'cc_tools:',
        '  - read',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['claude-code'],
      check: true,
      strict: true,
    };

    await expect(build(config)).rejects.toThrow(/strict mode/i);
  });

  it('BuildSummary.issues (index-level) is folded into strictFailures and counted as an error', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'targets: []', // empty targets array -> resolvePersonaTargets error
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.issues).toHaveLength(1);
    expect(summary.strictFailures).toContainEqual(summary.issues[0]);
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.success).toBe(false);
  });

  it('errors/warnings counts match the number of error/warning findings across results and issues', async () => {
    const base = makeTempDir();
    // Two independent errors: an unknown subagent slug (per-result) and an
    // empty targets array (index-level issue).
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'subagents:',
        '  - nonexistent-slug',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });
    await writeFile(
      path.join(suite.srcDir, 'meta', 'broken.yaml'),
      'slug: broken\nname: Broken\ndescription: Test.\ntargets: []\nvs_file_name: broken.agent.md\ncc_file_name: broken.md\n',
    );
    await writeFile(path.join(suite.srcDir, 'content', 'broken.md'), '# {{name}}\n');

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const perResultErrors = summary.results.flatMap((r) => r.validationResults).filter((v) => v.severity === 'error');
    const indexErrors = summary.issues.filter((v) => v.severity === 'error');
    expect(summary.errors).toBe(perResultErrors.length + indexErrors.length);
  });

  it('does not throw in non-strict mode even with errors present', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, { personaYaml: UNKNOWN_SUBAGENT_YAML, contentMd: '# {{name}}\n' });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    await expect(build(config)).resolves.toBeDefined();
  });
});
