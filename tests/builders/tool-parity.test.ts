/**
 * tests/builders/tool-parity.test.ts
 *
 * Integration tests for the WP-009 capability-parity post-pass in build():
 *   - grouping BuildResults by personaYamlPath
 *   - only targets with a capability map and a defined effectiveTools take part
 *   - a persona excluded from a target via `targets` is not parity-checked
 *     against it
 *   - unknown tool_parity_exceptions names surface as warnings in
 *     BuildSummary.issues
 *
 * Unit coverage for validateToolParity() itself lives in
 * tests/validators/tool-parity-validator.test.ts.
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
    `tool-parity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string; outDeepAgents: string }> {
  const srcDir = path.join(baseDir, 'src');
  const outVscode = path.join(baseDir, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, 'out', 'claude-code');
  const outDeepAgents = path.join(baseDir, 'out', 'deep-agents');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });
  await mkdir(outDeepAgents, { recursive: true });

  await writeFile(path.join(srcDir, 'meta', '_shared.yaml'), "default_version: '1.0.0'\n");
  await writeFile(path.join(srcDir, 'meta', 'persona.yaml'), opts.personaYaml);
  await writeFile(path.join(srcDir, 'content', 'persona.md'), opts.contentMd);

  return { srcDir, outVscode, outClaudeCode, outDeepAgents };
}

function findResult(summary: Awaited<ReturnType<typeof build>>, target: string) {
  return summary.results.find((r) => r.target === target);
}

describe('build() — capability parity post-pass', () => {
  it('a persona granting execute on vscode but not on claude-code gets a parity error on the claude-code result', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'tools:',
        '  - execute',
        '  - read',
        'cc_tools:',
        '  - Read',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: { vscode: suite.outVscode, 'claude-code': suite.outClaudeCode },
        },
      },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    const vscodeErrors = findResult(summary, 'vscode')!.validationResults.filter((r) => r.severity === 'error');
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) => r.severity === 'error');

    expect(vscodeErrors).toHaveLength(0);
    expect(ccErrors).toHaveLength(1);
    expect(ccErrors[0].message).toContain('execute');
  });

  it('a tool_parity_exceptions entry suppresses the corresponding finding', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'tool_parity_exceptions:',
        '  - execute',
        'tools:',
        '  - execute',
        '  - read',
        'cc_tools:',
        '  - Read',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: { vscode: suite.outVscode, 'claude-code': suite.outClaudeCode },
        },
      },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) => r.severity === 'error');
    expect(ccErrors).toHaveLength(0);
  });

  it('deep-agents results never take part (no capability map) even when it grants nothing', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'tools:',
        '  - execute',
        'cc_tools:',
        '  - Bash',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
        'da_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: {
            vscode: suite.outVscode,
            'claude-code': suite.outClaudeCode,
            'deep-agents': suite.outDeepAgents,
          },
        },
      },
      targets: ['vscode', 'claude-code', 'deep-agents'],
      check: true,
    };

    const summary = await build(config);

    // vscode and claude-code both grant execute — no mismatch between them.
    const vscodeErrors = findResult(summary, 'vscode')!.validationResults.filter((r) => r.severity === 'error');
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) => r.severity === 'error');
    const daErrors = findResult(summary, 'deep-agents')!.validationResults.filter((r) => r.severity === 'error');

    expect(vscodeErrors).toHaveLength(0);
    expect(ccErrors).toHaveLength(0);
    expect(daErrors).toHaveLength(0);
  });

  it('a persona excluded from vscode via targets is not parity-checked against it', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        "targets: ['claude-code']", // vscode is never built for this persona
        'cc_tools:',
        '  - Bash',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: { vscode: suite.outVscode, 'claude-code': suite.outClaudeCode },
        },
      },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    // No vscode BuildResult exists for this persona (it was skipped), so
    // there is nothing to compare against on the claude-code side either —
    // a single participating target produces no parity finding.
    expect(summary.results.find((r) => r.target === 'vscode')).toBeUndefined();
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) => r.severity === 'error');
    expect(ccErrors.filter((e) => e.message.includes('grants capability'))).toHaveLength(0);
  });

  it('an unknown tool_parity_exceptions name surfaces as a warning in BuildSummary.issues', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'tool_parity_exceptions:',
        '  - not-a-real-capability',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: { vscode: suite.outVscode, 'claude-code': suite.outClaudeCode },
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0].severity).toBe('warning');
    expect(summary.issues[0].message).toContain('not-a-real-capability');
  });

  it('an mcp:<server> exception name does not surface a warning', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'tool_parity_exceptions:',
        '  - mcp:my-server',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: {
        test: {
          srcDir: suite.srcDir,
          outputDirs: { vscode: suite.outVscode, 'claude-code': suite.outClaudeCode },
        },
      },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(summary.issues).toEqual([]);
  });
});
