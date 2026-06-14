/**
 * tests/builders/changelog-version.test.ts
 *
 * Integration tests for changelog-derived versioning.
 *
 * Validates that buildContext() and buildAgentNameMap() derive `version`
 * and `last_updated` from the per-persona YAML `changelog` block scalar,
 * and that appropriate fallbacks apply when `changelog` is absent.
 *
 * Acceptance Criteria verified:
 *   AC-1: buildContext() derives version from changelog field when no explicit version field
 *   AC-2: buildContext() derives last_updated from changelog date when no explicit last_updated
 *   AC-3: buildAgentNameMap() uses changelog-derived version in agent_* display strings
 *   AC-4: When changelog is absent, version falls back to default_version then '0.0.0'
 *   AC-5: When changelog is absent, last_updated falls back to ''
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `cl-version-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
// Fixture factory
// ---------------------------------------------------------------------------

interface PersonaSpec {
  filename: string;
  yaml: string;
  content: string;
}

async function createSuite(
  baseDir: string,
  suiteName: string,
  opts: { sharedYaml?: string; personas: PersonaSpec[] },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, suiteName, 'src');
  const outVscode = path.join(baseDir, suiteName, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, suiteName, 'out', 'claude-code');

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

function buildConfig(
  suites: Record<string, { srcDir: string; outVscode: string; outClaudeCode: string }>,
): BuildConfig {
  return {
    suites: Object.fromEntries(
      Object.entries(suites).map(([name, s]) => [
        name,
        { srcDir: s.srcDir, outVscode: s.outVscode, outClaudeCode: s.outClaudeCode },
      ]),
    ),
    targets: ['vscode'],
    check: true,
  };
}

// ---------------------------------------------------------------------------
// AC-1: buildContext() derives version from changelog
// ---------------------------------------------------------------------------

describe('AC-1: version derived from changelog field', () => {
  it('renders {{version}} from changelog when no explicit version field is present', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "changelog: \"2.3.0 (2026-06-01): Initial release\"\n",
          content: '# {{name}} v{{version}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('Test Agent v2.3.0');
  });

  it('renders {{version}} from changelog with version-only format (no date)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "changelog: \"1.7.2: Bug fix release\"\n",
          content: '# {{name}} v{{version}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('Test Agent v1.7.2');
  });

  it('uses first version line from multiline changelog block scalar', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      personas: [
        {
          filename: 'agent.yaml',
          // YAML block scalar with multiple version entries
          yaml:
            "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "changelog: |\n" +
            "  3.1.0 (2026-05-01): Latest release\n" +
            "  2.0.0 (2026-01-01): Previous release\n",
          content: '# {{name}} v{{version}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('Test Agent v3.1.0');
    expect(result!.content).not.toContain('v2.0.0');
  });
});

// ---------------------------------------------------------------------------
// AC-2: buildContext() derives last_updated from changelog date
// ---------------------------------------------------------------------------

describe('AC-2: last_updated derived from changelog date', () => {
  it('renders {{last_updated}} from changelog date when no explicit last_updated field', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "default_version: '1.0.0'\n", // no last_updated in shared
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "changelog: \"1.2.0 (2026-06-13): Feature update\"\n",
          content: '# {{name}}\nlast_updated: {{last_updated}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('last_updated: 2026-06-13');
  });

  it('explicit last_updated in YAML is preserved (not overridden by changelog)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "default_version: '1.0.0'\n",
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "last_updated: '2025-01-01'\n" +
            "changelog: \"1.2.0 (2026-06-13): Feature update\"\n",
          content: '# {{name}}\nlast_updated: {{last_updated}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    // Explicit YAML last_updated takes precedence over changelog date
    expect(result!.content).toContain('last_updated: 2025-01-01');
    expect(result!.content).not.toContain('2026-06-13');
  });

  it('last_updated is empty string when changelog has no date component', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "default_version: '1.0.0'\n",
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n" +
            "changelog: \"1.2.0: Feature update\"\n",
          content: '# {{name}}\nlast_updated: [{{last_updated}}]\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    // No date in changelog → last_updated renders as empty string
    expect(result!.content).toContain('last_updated: []');
  });
});

// ---------------------------------------------------------------------------
// AC-3: buildAgentNameMap() uses changelog-derived version
// ---------------------------------------------------------------------------

describe('AC-3: agent_* display strings use changelog-derived version', () => {
  it('agent_* key resolves to "<name> v<changelog-version>"', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test\n" +
            "vs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_provider}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      personas: [
        {
          filename: 'provider.yaml',
          yaml: "slug: provider\nname: Provider\ndescription: Test\n" +
            "vs_file_name: provider.agent.md\ncc_file_name: provider.md\n" +
            "changelog: \"4.1.0 (2026-06-01): New release\"\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ 'suite-a': suiteA, 'suite-b': suiteB }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite-a');
    expect(result!.content).toContain('Use Provider v4.1.0 here.');
  });
});

// ---------------------------------------------------------------------------
// AC-4: Fallback chain for version when changelog is absent
// ---------------------------------------------------------------------------

describe('AC-4: version fallback chain when changelog is absent', () => {
  it('falls back to default_version when changelog is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "default_version: '3.9.0'\n",
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n",
          // No changelog field
          content: '# {{name}} v{{version}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('Test Agent v3.9.0');
  });

  it('falls back to 0.0.0 when changelog and default_version are both absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "author: test\n", // No default_version
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n",
          // No changelog field
          content: '# {{name}} v{{version}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('Test Agent v0.0.0');
  });

  it('agent_* falls back to default_version when changelog is absent', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test\n" +
            "vs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_helper}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "default_version: '7.0.0'\n",
      personas: [
        {
          filename: 'helper.yaml',
          yaml: "slug: helper\nname: Helper\ndescription: Test\n" +
            "vs_file_name: helper.agent.md\ncc_file_name: helper.md\n",
          // No changelog → falls back to suite default_version
          content: '# {{name}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ 'suite-a': suiteA, 'suite-b': suiteB }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite-a');
    expect(result!.content).toContain('Use Helper v7.0.0 here.');
  });

  it('agent_* falls back to 0.0.0 when changelog and default_version are both absent', async () => {
    const base = makeTempDir();

    const suiteA = await createSuite(base, 'suite-a', {
      sharedYaml: "author: test\n",
      personas: [
        {
          filename: 'consumer.yaml',
          yaml: "slug: consumer\nname: Consumer\ndescription: Test\n" +
            "vs_file_name: consumer.agent.md\ncc_file_name: consumer.md\n",
          content: '# {{name}}\n\nUse {{agent_helper}} here.\n',
        },
      ],
    });

    const suiteB = await createSuite(base, 'suite-b', {
      sharedYaml: "author: test\n", // No default_version
      personas: [
        {
          filename: 'helper.yaml',
          yaml: "slug: helper\nname: Helper\ndescription: Test\n" +
            "vs_file_name: helper.agent.md\ncc_file_name: helper.md\n",
          content: '# {{name}}\n',
        },
      ],
    });

    const summary = await build(buildConfig({ 'suite-a': suiteA, 'suite-b': suiteB }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite-a');
    expect(result!.content).toContain('Use Helper v0.0.0 here.');
  });
});

// ---------------------------------------------------------------------------
// AC-5: last_updated fallback to '' when changelog is absent
// ---------------------------------------------------------------------------

describe('AC-5: last_updated falls back to empty string when changelog is absent', () => {
  it("last_updated is '' when changelog is absent and no explicit last_updated in YAML", async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'suite', {
      sharedYaml: "default_version: '1.0.0'\n", // no last_updated
      personas: [
        {
          filename: 'agent.yaml',
          yaml: "slug: agent\nname: Test Agent\ndescription: Test\n" +
            "vs_file_name: agent.agent.md\ncc_file_name: agent.md\n",
          // No changelog, no last_updated
          content: '# {{name}}\nlast_updated: [{{last_updated}}]\n',
        },
      ],
    });

    const summary = await build(buildConfig({ suite }));
    expect(summary.success).toBe(true);

    const result = summary.results.find((r) => r.suite === 'suite');
    expect(result!.content).toContain('last_updated: []');
  });
});
