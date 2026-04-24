/**
 * tests/builders/tools-block-fields.test.ts
 *
 * Unit tests for the tools_block, cc_tools_block, and da_tools_block context
 * fields derived in buildContext().
 *
 * Acceptance criteria:
 *   AC-1: tools_block produces a YAML block sequence from the `tools` array
 *   AC-2: tools_block is ` []` (empty block) when `tools` is absent or empty
 *   AC-3: cc_tools_block uses `cc_tools` when present, falls back to `tools`
 *   AC-4: da_tools_block uses `da_tools` when present (requires da_file_name)
 *   AC-5: da_tools_block is absent when da_file_name is not set
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
    `tools-block-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
// Helper
// ---------------------------------------------------------------------------

async function createSuite(
  baseDir: string,
  opts: {
    personaYaml: string;
    contentMd: string;
  },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, 'src');
  const outVscode = path.join(baseDir, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, 'out', 'claude-code');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });

  await writeFile(
    path.join(srcDir, 'meta', '_shared.yaml'),
    "default_version: '1.0.0'\n",
  );
  await writeFile(path.join(srcDir, 'meta', 'my-persona.yaml'), opts.personaYaml);
  await writeFile(path.join(srcDir, 'content', 'my-persona.md'), opts.contentMd);

  return { srcDir, outVscode, outClaudeCode };
}

function makeConfig(suite: { srcDir: string; outVscode: string; outClaudeCode: string }): BuildConfig {
  return {
    suites: {
      test: {
        srcDir: suite.srcDir,
        outVscode: suite.outVscode,
        outClaudeCode: suite.outClaudeCode,
      },
    },
    targets: ['vscode'],
    check: true,
  };
}

// ---------------------------------------------------------------------------
// AC-1: tools_block from tools array
// ---------------------------------------------------------------------------

describe('AC-1: tools_block from tools array', () => {
  it('produces a YAML block sequence for each tool', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'tools:',
        '  - read',
        '  - edit',
        '  - search',
      ].join('\n') + '\n',
      contentMd: 'tools:{{tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    expect(content).toContain('  - read');
    expect(content).toContain('  - edit');
    expect(content).toContain('  - search');
    expect(content).not.toContain('{{tools_block}}');
  });
});

// ---------------------------------------------------------------------------
// AC-2: tools_block is empty block when tools absent or empty
// ---------------------------------------------------------------------------

describe('AC-2: tools_block when tools is absent or empty', () => {
  it('renders " []" when tools array is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
      ].join('\n') + '\n',
      contentMd: 'tools:{{tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    expect(content).toContain('tools: []');
    expect(content).not.toContain('{{tools_block}}');
  });

  it('renders " []" when tools array is explicitly empty', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'tools: []',
      ].join('\n') + '\n',
      contentMd: 'tools:{{tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    expect(content).toContain('tools: []');
    expect(content).not.toContain('{{tools_block}}');
  });
});

// ---------------------------------------------------------------------------
// AC-3: cc_tools_block uses cc_tools when present, falls back to tools
// ---------------------------------------------------------------------------

describe('AC-3: cc_tools_block source resolution', () => {
  it('uses cc_tools when present', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'tools:',
        '  - read',
        '  - edit',
        'cc_tools:',
        '  - read',
        '  - search',
      ].join('\n') + '\n',
      contentMd: 'tools:{{cc_tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    // cc_tools list: read, search — not edit
    expect(content).toContain('  - read');
    expect(content).toContain('  - search');
    expect(content).not.toContain('  - edit');
    expect(content).not.toContain('{{cc_tools_block}}');
  });

  it('falls back to tools when cc_tools is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'tools:',
        '  - read',
        '  - edit',
      ].join('\n') + '\n',
      contentMd: 'tools:{{cc_tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    expect(content).toContain('  - read');
    expect(content).toContain('  - edit');
    expect(content).not.toContain('{{cc_tools_block}}');
  });
});

// ---------------------------------------------------------------------------
// AC-4: da_tools_block uses da_tools when present (requires da_file_name)
// ---------------------------------------------------------------------------

describe('AC-4: da_tools_block uses da_tools when present', () => {
  it('uses da_tools over tools when da_file_name is set', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'da_file_name: my-persona.md',
        'tools:',
        '  - read',
        '  - edit',
        'da_tools:',
        '  - read',
        '  - execute',
      ].join('\n') + '\n',
      contentMd: 'tools:{{da_tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    // da_tools: read, execute — not edit
    expect(content).toContain('  - read');
    expect(content).toContain('  - execute');
    expect(content).not.toContain('  - edit');
    expect(content).not.toContain('{{da_tools_block}}');
  });

  it('falls back to tools when da_tools is absent but da_file_name is set', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'da_file_name: my-persona.md',
        'tools:',
        '  - read',
        '  - search',
      ].join('\n') + '\n',
      contentMd: 'tools:{{da_tools_block}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    expect(content).toContain('  - read');
    expect(content).toContain('  - search');
    expect(content).not.toContain('{{da_tools_block}}');
  });
});

// ---------------------------------------------------------------------------
// AC-5: da_tools_block is absent when da_file_name is not set
// ---------------------------------------------------------------------------

describe('AC-5: da_tools_block absent when da_file_name not set', () => {
  it('leaves {{da_tools_block}} unresolved when da_file_name is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        // no da_file_name
        'tools:',
        '  - read',
      ].join('\n') + '\n',
      // Use an {{#if}} conditional so the block is removed when the field is absent
      contentMd: '{{#if da_tools_block}}da:{{da_tools_block}}{{/if}}no-da\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const content = summary.results[0]!.content;
    // da_tools_block is not in context — conditional block should not render
    expect(content).toContain('no-da');
    expect(content).not.toContain('da:');
    expect(content).not.toContain('{{da_tools_block}}');
  });
});
