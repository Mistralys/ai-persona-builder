/**
 * tests/builders/persona-index.test.ts
 *
 * Unit / integration tests for `scanPersonas()` and `agentNameMapFromIndex()`
 * in src/builders/persona-index.ts.
 *
 * Coverage:
 *   - scanPersonas() indexes every persona across suites, in scan order,
 *     with slug/name/version/targets/declaredTargets/toolParityExceptions
 *   - Persona-level target declarations and tool_parity_exceptions are
 *     carried into the index entries
 *   - Index-level `issues` collects resolvePersonaTargets() errors
 *   - `bySlug` resolves each persona by slug
 *   - agentNameMapFromIndex(index) equals the historical buildAgentNameMap()
 *     output byte-for-byte on the same fixture (AC-2)
 *   - build() consumes the index/agent map with no change to rendered output
 *     (regression coverage for the pre-scan swap)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { scanPersonas, agentNameMapFromIndex } from '../../src/builders/persona-index.js';
import { build } from '../../src/builders/persona-builder.js';
import { defaultRegistry } from '../../src/targets/built-in.js';
import type { BuildConfig } from '../../src/builders/types.js';

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `persona-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createSuite(
  baseDir: string,
  name: string,
  opts: {
    sharedYaml?: string;
    personas: Array<{
      filename: string;
      yaml: string;
      content: string;
    }>;
  },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, name, 'src');
  const outVscode = path.join(baseDir, name, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, name, 'out', 'claude-code');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });

  await writeFile(
    path.join(srcDir, 'meta', '_shared.yaml'),
    opts.sharedYaml ?? "default_version: '1.0.0'\n",
  );

  for (const p of opts.personas) {
    await writeFile(path.join(srcDir, 'meta', p.filename), p.yaml);
    const contentName = p.filename.replace('.yaml', '.md');
    await writeFile(path.join(srcDir, 'content', contentName), p.content);
  }

  return { srcDir, outVscode, outClaudeCode };
}

// ---------------------------------------------------------------------------
// scanPersonas()
// ---------------------------------------------------------------------------

describe('scanPersonas', () => {
  it('indexes every persona across suites with slug, name, version, targets and toolParityExceptions', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml:
            "slug: consumer\nname: Consumer\ndescription: Test persona\n" +
            "targets: ['vscode']\ntool_parity_exceptions: ['dispatch']\n" +
            "vs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "default_version: '2.0.0'\n",
      personas: [
        {
          filename: 'helper.yaml',
          // No slug, no targets, no tool_parity_exceptions declared
          yaml: 'name: Helper\ndescription: Test persona\nvs_file_name: helper.agent.md\ncc_file_name: helper.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': { srcDir: suiteA.srcDir, outVscode: suiteA.outVscode, outClaudeCode: suiteA.outClaudeCode },
        'suite-b': { srcDir: suiteB.srcDir, outVscode: suiteB.outVscode, outClaudeCode: suiteB.outClaudeCode },
      },
    };

    const index = await scanPersonas(config, defaultRegistry);

    expect(index.entries).toHaveLength(2);

    const consumer = index.bySlug.get('consumer');
    expect(consumer).toBeDefined();
    expect(consumer!.suite).toBe('suite-a');
    expect(consumer!.name).toBe('Consumer');
    expect(consumer!.version).toBe('1.0.0');
    expect(consumer!.targets).toEqual(['vscode']);
    expect(consumer!.declaredTargets).toEqual(['vscode']);
    expect(consumer!.toolParityExceptions).toEqual(['dispatch']);

    // No slug declared → falls back to filename stem
    const helper = index.bySlug.get('helper');
    expect(helper).toBeDefined();
    expect(helper!.suite).toBe('suite-b');
    expect(helper!.name).toBe('Helper');
    expect(helper!.version).toBe('2.0.0');
    // Absent `targets` → every registered target
    expect(helper!.targets).toEqual(defaultRegistry.names());
    expect(helper!.declaredTargets).toBeUndefined();
    expect(helper!.toolParityExceptions).toEqual([]);

    expect(index.issues).toEqual([]);
  });

  it('collects resolvePersonaTargets() errors into index.issues', async () => {
    const base = makeTempDir();

    const suite = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'broken.yaml',
          yaml:
            "slug: broken\nname: Broken\ndescription: Test persona\ntargets: []\n" +
            'vs_file_name: broken.agent.md\ncc_file_name: broken.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode },
      },
    };

    const index = await scanPersonas(config, defaultRegistry);

    expect(index.issues).toHaveLength(1);
    expect(index.issues[0].severity).toBe('error');
    expect(index.issues[0].message).toContain('broken.yaml');

    const broken = index.bySlug.get('broken');
    expect(broken!.targets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// agentNameMapFromIndex() — byte-identical to the historical buildAgentNameMap()
// ---------------------------------------------------------------------------

describe('agentNameMapFromIndex', () => {
  it('reproduces the historical agent map shape: agent_<slug> and agent_slug_<slug>', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "default_version: '2.0.0'\n",
      personas: [
        {
          filename: 'my-great-agent.yaml',
          yaml:
            "slug: my-great-agent\nname: My Great Agent\ndescription: Test persona\n" +
            'changelog: "3.0.0 (2026-01-01): Initial version"\n' +
            'vs_file_name: my-great-agent.agent.md\ncc_file_name: my-great-agent.md\n',
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': { srcDir: suiteA.srcDir, outVscode: suiteA.outVscode, outClaudeCode: suiteA.outClaudeCode },
        'suite-b': { srcDir: suiteB.srcDir, outVscode: suiteB.outVscode, outClaudeCode: suiteB.outClaudeCode },
      },
    };

    const index = await scanPersonas(config, defaultRegistry);
    const agentMap = agentNameMapFromIndex(index);

    expect(agentMap).toEqual({
      agent_consumer: 'Consumer v1.0.0',
      agent_slug_consumer: 'consumer',
      agent_my_great_agent: 'My Great Agent v3.0.0',
      agent_slug_my_great_agent: 'my-great-agent',
    });
  });
});

// ---------------------------------------------------------------------------
// build() integration — pre-scan swap produces identical rendered output
// ---------------------------------------------------------------------------

describe('build() with the persona-index pre-scan', () => {
  it('still resolves {{agent_*}} cross-suite references (regression for the buildAgentNameMap swap)', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nInvoke {{agent_helper}} for help.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "default_version: '2.0.0'\n",
      personas: [
        {
          filename: 'helper.yaml',
          yaml: "slug: helper\nname: Helper\ndescription: Test persona\nvs_file_name: helper.agent.md\ncc_file_name: helper.md\n",
          content: '# {{name}}\n\nI am the helper.\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': { srcDir: suiteA.srcDir, outVscode: suiteA.outVscode, outClaudeCode: suiteA.outClaudeCode },
        'suite-b': { srcDir: suiteB.srcDir, outVscode: suiteB.outVscode, outClaudeCode: suiteB.outClaudeCode },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.success).toBe(true);

    const consumerResult = summary.results.find(
      (r) => r.suite === 'suite-a' && path.basename(r.outputPath) === 'consumer.agent.md',
    );
    expect(consumerResult).toBeDefined();
    expect(consumerResult!.content).toContain('Invoke Helper v2.0.0 for help.');
  });
});
