/**
 * tests/builders/da-computed-fields.test.ts
 *
 * Unit tests for the da_* computed convenience fields added to buildContext().
 *
 * Acceptance criteria:
 *   AC-1: da_file_name_stem equals da_file_name with .md stripped
 *   AC-2: da_tools_list uses da_tools when present, falls back to tools
 *   AC-3: Manually set da_file_name_stem in YAML is not overwritten
 *   AC-4: Fields are absent when da_file_name is not set
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
    `da-fields-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  name: string,
  opts: {
    sharedYaml?: string;
    personaYaml: string;
    contentMd: string;
    personaName?: string;
  },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const pName = opts.personaName ?? 'my-persona';
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
  await writeFile(path.join(srcDir, 'meta', `${pName}.yaml`), opts.personaYaml);
  await writeFile(path.join(srcDir, 'content', `${pName}.md`), opts.contentMd);

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
// AC-1: da_file_name_stem derived from da_file_name
// ---------------------------------------------------------------------------

describe('AC-1: da_file_name_stem derived from da_file_name', () => {
  it('strips .md extension from da_file_name', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'da_file_name: my-persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\nStem: {{da_file_name_stem}}\n',
    });

    const summary = await build(makeConfig(suite));
    expect(summary.success).toBe(true);

    const result = summary.results[0];
    expect(result!.content).toContain('Stem: my-persona');
    expect(result!.content).not.toContain('{{da_file_name_stem}}');
  });

  it('handles da_file_name without .md extension gracefully (no double-stripping)', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'da_file_name: my-persona',   // no .md
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\nStem: {{da_file_name_stem}}\n',
    });

    const summary = await build(makeConfig(suite));
    const result = summary.results[0];
    expect(result!.content).toContain('Stem: my-persona');
  });
});

// ---------------------------------------------------------------------------
// AC-2: da_tools_list / da_tools_json — da_tools takes precedence over tools
// ---------------------------------------------------------------------------

describe('AC-2: da_tools_list and da_tools_json', () => {
  it('uses da_tools when present', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
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
      contentMd: '# {{name}}\n\nDA tools: {{da_tools_list}}\n',
    });

    const summary = await build(makeConfig(suite));
    const result = summary.results[0];
    // da_tools_list should reflect da_tools (read, execute), not tools (read, edit)
    expect(result!.content).toContain('read');
    expect(result!.content).toContain('execute');
    expect(result!.content).not.toContain('{{da_tools_list}}');
  });

  it('falls back to tools when da_tools is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
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
      contentMd: '# {{name}}\n\nDA tools: {{da_tools_list}}\n',
    });

    const summary = await build(makeConfig(suite));
    const result = summary.results[0];
    // Falls back to tools list
    expect(result!.content).toContain('read');
    expect(result!.content).toContain('search');
    expect(result!.content).not.toContain('{{da_tools_list}}');
  });

  it('da_tools_list and da_tools_json are absent when da_file_name is not set', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        // No da_file_name
        'tools:',
        '  - read',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\nDA tools: {{da_tools_list}}\n',
    });

    const summary = await build(makeConfig(suite));
    // da_tools_list should remain unresolved since da_file_name is absent
    const result = summary.results[0];
    expect(result!.content).toContain('{{da_tools_list}}');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Manually set da_file_name_stem in YAML is not overwritten
// ---------------------------------------------------------------------------

describe('AC-3: explicit da_file_name_stem in YAML takes precedence', () => {
  it('does not overwrite a manually set da_file_name_stem', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        'da_file_name: my-persona.md',
        'da_file_name_stem: custom-stem',   // explicit override
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\nStem: {{da_file_name_stem}}\n',
    });

    const summary = await build(makeConfig(suite));
    const result = summary.results[0];
    expect(result!.content).toContain('Stem: custom-stem');
    expect(result!.content).not.toContain('my-persona');
  });
});

// ---------------------------------------------------------------------------
// AC-4: da_* fields absent when da_file_name is not set
// ---------------------------------------------------------------------------

describe('AC-4: da_* fields absent when da_file_name is not set', () => {
  it('da_file_name_stem is not injected when da_file_name is absent', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, 'test', {
      personaYaml: [
        'slug: my-persona',
        'name: My Persona',
        'description: Test.',
        'vs_file_name: my-persona.agent.md',
        'cc_file_name: my-persona.md',
        // No da_file_name
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\nStem: {{da_file_name_stem}}\n',
    });

    const summary = await build(makeConfig(suite));
    const result = summary.results[0];
    // Variable should remain unresolved
    expect(result!.content).toContain('{{da_file_name_stem}}');
  });
});
