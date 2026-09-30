/**
 * tests/builders/persona-targets.test.ts
 *
 * Unit tests for `resolvePersonaTargets()` in src/builders/persona-index.ts,
 * plus (WP-005) integration tests for the per-persona target *skip
 * behaviour* it drives in `buildSuite()` / `build()`.
 *
 * Rule coverage (plan §B):
 *   - Absent `targets` → every registered target
 *   - A declared subset of valid names → kept as-is (order preserved)
 *   - An unknown target name → error, and the name is dropped
 *   - A non-string entry → error, and the entry is dropped
 *   - An empty array → error, resolves to no targets
 *   - A non-array declared value → error, resolves to no targets
 *   - Duplicate entries → silently removed, no error
 *   - Error messages name the persona YAML path
 *
 * Skip-behaviour coverage (WP-005):
 *   - A persona declaring `targets: ['claude-code']` produces no vscode
 *     BuildResult, is recorded in BuildSummary.skipped, and writes no file
 *   - buildSuite() called without a personaIndex still filters correctly
 *     (self-scans its own suite)
 *   - buildPersona() ignores `targets` entirely (explicit single build)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolvePersonaTargets, scanPersonas } from '../../src/builders/persona-index.js';
import { build, buildSuite, buildPersona } from '../../src/builders/persona-builder.js';
import { defaultRegistry } from '../../src/targets/built-in.js';
import { TargetRegistry } from '../../src/targets/registry.js';
import type { BuildConfig } from '../../src/builders/types.js';

const YAML_PATH = '/suites/example/meta/some-persona.yaml';

let registry: TargetRegistry;

beforeEach(() => {
  registry = new TargetRegistry();
  registry.register({
    name: 'vscode',
    outputDirKey: 'vscode',
    defaultFrontmatter: '---\n---',
  });
  registry.register({
    name: 'claude-code',
    outputDirKey: 'claude-code',
    defaultFrontmatter: '---\n---',
  });
  registry.register({
    name: 'deep-agents',
    outputDirKey: 'deep-agents',
    defaultFrontmatter: '---\n---',
  });
});

describe('resolvePersonaTargets', () => {
  it('resolves an absent value to every registered target, with no issues', () => {
    const result = resolvePersonaTargets(undefined, registry, YAML_PATH);
    expect(result.targets).toEqual(['vscode', 'claude-code', 'deep-agents']);
    expect(result.issues).toEqual([]);
  });

  it('keeps a declared subset of valid target names, in declared order', () => {
    const result = resolvePersonaTargets(['claude-code', 'vscode'], registry, YAML_PATH);
    expect(result.targets).toEqual(['claude-code', 'vscode']);
    expect(result.issues).toEqual([]);
  });

  it('drops an unknown target name and reports one error naming the YAML path', () => {
    const result = resolvePersonaTargets(['vscode', 'not-a-target'], registry, YAML_PATH);
    expect(result.targets).toEqual(['vscode']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toContain(YAML_PATH);
    expect(result.issues[0].message).toContain('not-a-target');
  });

  it('drops a non-string entry and reports one error', () => {
    const result = resolvePersonaTargets(['vscode', 42, null], registry, YAML_PATH);
    expect(result.targets).toEqual(['vscode']);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((i) => i.severity === 'error')).toBe(true);
    expect(result.issues[0].message).toContain(YAML_PATH);
  });

  it('resolves an empty array to no targets, with one error', () => {
    const result = resolvePersonaTargets([], registry, YAML_PATH);
    expect(result.targets).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toContain(YAML_PATH);
  });

  it('resolves a non-array value (string) to no targets, with one error', () => {
    const result = resolvePersonaTargets('vscode', registry, YAML_PATH);
    expect(result.targets).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toContain(YAML_PATH);
  });

  it('resolves a non-array value (object) to no targets, with one error', () => {
    const result = resolvePersonaTargets({ vscode: true }, registry, YAML_PATH);
    expect(result.targets).toEqual([]);
    expect(result.issues).toHaveLength(1);
  });

  it('removes duplicate entries silently, without an error', () => {
    const result = resolvePersonaTargets(['vscode', 'vscode', 'claude-code'], registry, YAML_PATH);
    expect(result.targets).toEqual(['vscode', 'claude-code']);
    expect(result.issues).toEqual([]);
  });

  it('mixes valid, duplicate, unknown, and non-string entries in one declaration', () => {
    const result = resolvePersonaTargets(['vscode', 'vscode', 'bogus', 7, 'claude-code'], registry, YAML_PATH);
    expect(result.targets).toEqual(['vscode', 'claude-code']);
    expect(result.issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// WP-005: per-persona target skip behaviour (buildSuite / build)
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `persona-target-skip-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  opts: {
    personas: Array<{ filename: string; yaml: string; content: string }>;
  },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, 'src');
  const outVscode = path.join(baseDir, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, 'out', 'claude-code');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });

  await writeFile(path.join(srcDir, 'meta', '_shared.yaml'), "default_version: '1.0.0'\n");

  for (const p of opts.personas) {
    await writeFile(path.join(srcDir, 'meta', p.filename), p.yaml);
    const contentName = p.filename.replace('.yaml', '.md');
    await writeFile(path.join(srcDir, 'content', contentName), p.content);
  }

  return { srcDir, outVscode, outClaudeCode };
}

describe('build() — per-persona target skip behaviour', () => {
  it('a persona declaring targets: [claude-code] produces no vscode BuildResult, is recorded in skipped, and writes no vscode file', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'cc-only.yaml',
          yaml:
            "slug: cc-only\nname: CC Only\ndescription: Test.\ntargets: ['claude-code']\n" +
            'vs_file_name: cc-only.agent.md\ncc_file_name: cc-only.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    const vscodeResult = summary.results.find((r) => r.target === 'vscode');
    const ccResult = summary.results.find((r) => r.target === 'claude-code');
    expect(vscodeResult).toBeUndefined();
    expect(ccResult).toBeDefined();

    expect(summary.skipped).toContainEqual({
      suite: 'test',
      target: 'vscode',
      personaYamlPath: path.join(suite.srcDir, 'meta', 'cc-only.yaml'),
    });
    // Not skipped for claude-code — it was built for that target.
    expect(summary.skipped.some((s) => s.target === 'claude-code')).toBe(false);
  });

  it('writes no vscode file to disk for an excluded persona (non-check build)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'cc-only.yaml',
          yaml:
            "slug: cc-only\nname: CC Only\ndescription: Test.\ntargets: ['claude-code']\n" +
            'vs_file_name: cc-only.agent.md\ncc_file_name: cc-only.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode', 'claude-code'],
    };

    const summary = await build(config);
    expect(summary.totalWritten).toBe(1);

    const { existsSync } = await import('node:fs');
    expect(existsSync(path.join(suite.outVscode, 'cc-only.agent.md'))).toBe(false);
    expect(existsSync(path.join(suite.outClaudeCode, 'cc-only.md'))).toBe(true);
  });

  it("a persona's resolved targets intersect with the build's active config.targets — built for the overlap only", async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'vs-and-cc.yaml',
          yaml:
            "slug: vs-and-cc\nname: VS and CC\ndescription: Test.\ntargets: ['vscode', 'claude-code']\n" +
            'vs_file_name: vs-and-cc.agent.md\ncc_file_name: vs-and-cc.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    // Active build targets are a narrower set than the persona declares.
    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]!.target).toBe('vscode');
    expect(summary.skipped).toEqual([]);
  });

  it('buildSuite() called without a personaIndex still skips excluded personas (self-scans its own suite)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'cc-only.yaml',
          yaml:
            "slug: cc-only\nname: CC Only\ndescription: Test.\ntargets: ['claude-code']\n" +
            'vs_file_name: cc-only.agent.md\ncc_file_name: cc-only.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      check: true,
    };

    // Direct buildSuite() call — no personaIndex argument.
    const vscodeResults = await buildSuite(
      'test',
      config.suites.test,
      config,
      [],
      'vscode',
      {},
      defaultRegistry,
    );
    expect(vscodeResults).toEqual([]);

    const ccResults = await buildSuite(
      'test',
      config.suites.test,
      config,
      [],
      'claude-code',
      {},
      defaultRegistry,
    );
    expect(ccResults).toHaveLength(1);
  });

  it('buildSuite() given a personaIndex uses it instead of self-scanning (no extra targets field needed)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'cc-only.yaml',
          yaml:
            "slug: cc-only\nname: CC Only\ndescription: Test.\ntargets: ['claude-code']\n" +
            'vs_file_name: cc-only.agent.md\ncc_file_name: cc-only.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      check: true,
    };

    const index = await scanPersonas(config, defaultRegistry);
    const vscodeResults = await buildSuite('test', config.suites.test, config, [], 'vscode', {}, defaultRegistry, index);
    expect(vscodeResults).toEqual([]);
  });

  it('buildPersona() ignores targets entirely — an explicit single build is never skipped', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'cc-only.yaml',
          yaml:
            "slug: cc-only\nname: CC Only\ndescription: Test.\ntargets: ['claude-code']\n" +
            'vs_file_name: cc-only.agent.md\ncc_file_name: cc-only.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      check: true,
    };

    // Direct buildPersona() call for the target the persona explicitly excludes.
    const result = await buildPersona(
      path.join(suite.srcDir, 'meta', 'cc-only.yaml'),
      'test',
      config.suites.test,
      {},
      {},
      config,
      [],
      'vscode',
    );
    expect(result).toBeDefined();
    expect(result.target).toBe('vscode');
  });

  it('BuildSummary.issues surfaces resolvePersonaTargets() errors from the pre-scan', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personas: [
        {
          filename: 'broken.yaml',
          yaml: 'slug: broken\nname: Broken\ndescription: Test.\ntargets: []\nvs_file_name: broken.agent.md\ncc_file_name: broken.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0].severity).toBe('error');
    expect(summary.issues[0].message).toContain('broken.yaml');
    // An empty resolved targets list means the persona is skipped for every active target.
    expect(summary.results).toHaveLength(0);
    expect(summary.skipped).toContainEqual({
      suite: 'test',
      target: 'vscode',
      personaYamlPath: path.join(suite.srcDir, 'meta', 'broken.yaml'),
    });
  });
});
