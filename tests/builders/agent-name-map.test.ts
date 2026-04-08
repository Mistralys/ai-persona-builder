/**
 * tests/builders/agent-name-map.test.ts
 *
 * Unit tests for the cross-suite agent name map feature.
 *
 * Validates that `build()` pre-scans all suites and injects `agent_*`
 * context variables into every persona's rendering context, enabling
 * cross-suite references like `{{agent_wp_decomposer}}` → "WP Decomposer v1.0.0".
 *
 * Test coverage:
 *   - Agent map keys are correctly derived from persona slugs
 *   - Hyphens in slugs are replaced with underscores
 *   - Slug fallback to filename stem when `slug` field is absent
 *   - Version fallback to `default_version` when `version` field is absent
 *   - Double fallback (neither persona version nor default_version → '0.0.0')
 *   - Cross-suite variable resolution in rendered output
 *   - Self-suite variable resolution
 *   - Explicit YAML field takes precedence over computed agent map entry
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `agent-map-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
// Tests: Agent name map construction
// ---------------------------------------------------------------------------

describe('cross-suite agent name map', () => {
  it('resolves {{agent_*}} variables across suites', async () => {
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
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
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
    expect(consumerResult!.content).not.toContain('{{agent_helper}}');
  });

  it('resolves slug with hyphens → underscored key', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_my_great_agent}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'my-great-agent.yaml',
          yaml: "slug: my-great-agent\nname: My Great Agent\ndescription: Test persona\nversion: '3.0.0'\nvs_file_name: my-great-agent.agent.md\ncc_file_name: my-great-agent.md\n",
          content: '# {{name}}\n\nGreat!\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    expect(consumerResult!.content).toContain('Use My Great Agent v3.0.0 here.');
  });

  it('falls back to filename stem when slug field is absent', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "name: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_some_helper}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'some-helper.yaml',
          // No slug field — should fall back to filename stem "some-helper"
          yaml: "name: Some Helper\ndescription: Test persona\nversion: '1.5.0'\nvs_file_name: some-helper.agent.md\ncc_file_name: some-helper.md\n",
          content: '# {{name}}\n\nHelping!\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    expect(consumerResult!.content).toContain('Use Some Helper v1.5.0 here.');
  });

  it('falls back to default_version when persona version is absent', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_provider}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "default_version: '4.2.0'\n",
      personas: [
        {
          filename: 'provider.yaml',
          // No version field — should fall back to default_version "4.2.0"
          yaml: "slug: provider\nname: Provider\ndescription: Test persona\nvs_file_name: provider.agent.md\ncc_file_name: provider.md\n",
          content: '# {{name}}\n\nProviding!\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    expect(consumerResult!.content).toContain('Use Provider v4.2.0 here.');
  });

  it('falls back to 0.0.0 when neither persona version nor default_version exist', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      sharedYaml: "author: test\n", // No default_version
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_fallback}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "author: test\n", // No default_version
      personas: [
        {
          filename: 'fallback.yaml',
          // No version, no default_version → should fall back to "0.0.0"
          yaml: "slug: fallback\nname: Fallback Agent\ndescription: Test persona\nvs_file_name: fallback.agent.md\ncc_file_name: fallback.md\n",
          content: '# {{name}}\n\nFallback!\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    expect(consumerResult!.content).toContain('Use Fallback Agent v0.0.0 here.');
  });

  it('self-suite resolution works (persona references another in the same suite)', async () => {
    const base = makeTempDir();

    const suite = await createSuite(base, 'single', {
      personas: [
        {
          filename: 'alpha.yaml',
          yaml: "slug: alpha\nname: Alpha Agent\ndescription: Test persona\nvs_file_name: alpha.agent.md\ncc_file_name: alpha.md\n",
          content: '# {{name}}\n\nPartner: {{agent_beta}}\n',
        },
        {
          filename: 'beta.yaml',
          yaml: "slug: beta\nname: Beta Agent\ndescription: Test persona\nvs_file_name: beta.agent.md\ncc_file_name: beta.md\n",
          content: '# {{name}}\n\nPartner: {{agent_alpha}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        single: {
          srcDir: suite.srcDir,
          outVscode: suite.outVscode,
          outClaudeCode: suite.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);

    const alphaResult = summary.results.find(
      (r) => path.basename(r.outputPath) === 'alpha.agent.md',
    );
    const betaResult = summary.results.find(
      (r) => path.basename(r.outputPath) === 'beta.agent.md',
    );

    expect(alphaResult!.content).toContain('Partner: Beta Agent v1.0.0');
    expect(betaResult!.content).toContain('Partner: Alpha Agent v1.0.0');
  });

  it('explicit YAML field takes precedence over computed agent map entry', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          // Explicitly defines agent_helper as a YAML field
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nagent_helper: Custom Override\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nInvoke {{agent_helper}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'helper.yaml',
          yaml: "slug: helper\nname: Helper\ndescription: Test persona\nversion: '2.0.0'\nvs_file_name: helper.agent.md\ncc_file_name: helper.md\n",
          content: '# {{name}}\n\nHelping!\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    // The explicit YAML field should win, not the computed "Helper v2.0.0"
    expect(consumerResult!.content).toContain('Invoke Custom Override here.');
    expect(consumerResult!.content).not.toContain('Helper v2.0.0');
  });
});

// ---------------------------------------------------------------------------
// Tests: Slug keys (agent_slug_*)
// ---------------------------------------------------------------------------

describe('agent_slug_* keys', () => {
  it('emits agent_slug_<underscored_slug> alongside agent_<underscored_slug>', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nInvoke {{agent_slug_helper}} subagent.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'helper.yaml',
          yaml: "slug: helper\nname: Helper\ndescription: Test persona\nversion: '2.0.0'\nvs_file_name: helper.agent.md\ncc_file_name: helper.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.success).toBe(true);

    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    expect(consumerResult).toBeDefined();
    // Slug key resolves to the raw slug string (no version suffix)
    expect(consumerResult!.content).toContain('Invoke helper subagent.');
    expect(consumerResult!.content).not.toContain('{{agent_slug_helper}}');
  });

  it('slug key value preserves hyphens for hyphenated persona slugs', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test persona\nvs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nSubagent: {{agent_slug_my_great_agent}}\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'my-great-agent.yaml',
          yaml: "slug: my-great-agent\nname: My Great Agent\ndescription: Test persona\nversion: '3.0.0'\nvs_file_name: my-great-agent.agent.md\ncc_file_name: my-great-agent.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        'suite-a': {
          srcDir: suiteA.srcDir,
          outVscode: suiteA.outVscode,
          outClaudeCode: suiteA.outClaudeCode,
        },
        'suite-b': {
          srcDir: suiteB.srcDir,
          outVscode: suiteB.outVscode,
          outClaudeCode: suiteB.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const consumerResult = summary.results.find((r) => r.suite === 'suite-a');
    // Value preserves the raw hyphenated slug
    expect(consumerResult!.content).toContain('Subagent: my-great-agent');
    // Display-name key is unaffected and still resolves to the versioned name
    expect(consumerResult!.content).not.toContain('My Great Agent');
  });

  it('display-name key (agent_*) and slug key (agent_slug_*) coexist for the same persona', async () => {
    const base = makeTempDir();

    const suite = await createSuite(base, 'single', {
      personas: [
        {
          filename: 'alpha.yaml',
          yaml: "slug: alpha\nname: Alpha Agent\ndescription: Test persona\nvs_file_name: alpha.agent.md\ncc_file_name: alpha.md\n",
          content: '# {{name}}\n\nDisplay: {{agent_beta}}\nSlug: {{agent_slug_beta}}\n',
        },
        {
          filename: 'beta.yaml',
          yaml: "slug: beta\nname: Beta Agent\ndescription: Test persona\nversion: '5.0.0'\nvs_file_name: beta.agent.md\ncc_file_name: beta.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const config: BuildConfig = {
      suites: {
        single: {
          srcDir: suite.srcDir,
          outVscode: suite.outVscode,
          outClaudeCode: suite.outClaudeCode,
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const alphaResult = summary.results.find(
      (r) => path.basename(r.outputPath) === 'alpha.agent.md',
    );
    expect(alphaResult!.content).toContain('Display: Beta Agent v5.0.0');
    expect(alphaResult!.content).toContain('Slug: beta');
  });
});
