/**
 * tests/builders/target-variable-injection.test.ts
 *
 * Tests for target variable injection (target_vscode, target_claude_code)
 * introduced by the fix for the target conditional bug.
 *
 * Acceptance Criteria verified:
 *   AC-1: target_vscode is true when building for 'vscode', absent for 'claude-code'
 *   AC-2: target_claude_code is true when building for 'claude-code', absent for 'vscode'
 *   AC-3: {{#if target_vscode}} conditionals resolve correctly per target
 *   AC-4: Plugin onBuildContext receives the active target as its 4th argument
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildPersona } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin, SuiteConfig, TargetType } from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

// Shared metadata used in all buildPersona() calls — includes CC fields so
// the default Claude Code frontmatter template renders without warnings.
const SHARED_META = {
  default_version: '1.0.0',
  cc_permission_mode: 'default',
  cc_model: 'claude-opus-4-5',
  cc_memory: 'project',
};

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `target-injection-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal suite for target injection tests
// ---------------------------------------------------------------------------

async function createSuite(
  baseDir: string,
  contentMd: string,
): Promise<{ suiteDir: string; personaYamlPath: string; suiteConfig: SuiteConfig; config: BuildConfig }> {
  const suiteDir = path.join(baseDir, 'suite');
  const outDir = path.join(baseDir, 'out');

  await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
  await mkdir(path.join(suiteDir, 'content'), { recursive: true });

  await writeFile(
    path.join(suiteDir, 'meta', '_shared.yaml'),
    `default_version: '1.0.0'\ncc_permission_mode: default\ncc_model: claude-opus-4-5\ncc_memory: project\n`,
  );

  await writeFile(
    path.join(suiteDir, 'meta', 'agent.yaml'),
    `name: Test Agent\ndescription: A test agent.\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\ntools:\n  - read\n`,
  );

  await writeFile(path.join(suiteDir, 'content', 'agent.md'), contentMd);

  const suiteConfig: SuiteConfig = {
    srcDir: suiteDir,
    outVscode: path.join(outDir, 'vscode'),
    outClaudeCode: path.join(outDir, 'cc'),
  };

  const config: BuildConfig = {
    suites: { suite: suiteConfig },
    check: true,
  };

  return {
    suiteDir,
    personaYamlPath: path.join(suiteDir, 'meta', 'agent.yaml'),
    suiteConfig,
    config,
  };
}

// ---------------------------------------------------------------------------
// AC-1 & AC-2: target_* flag presence in context
// ---------------------------------------------------------------------------

describe('target flag injection — AC-1 & AC-2', () => {
  it('injects target_vscode=true when building for vscode', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '{{target_vscode}}\n',
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'vscode',
    );

    expect(result.content).toContain('true');
  });

  it('does not inject target_vscode when building for claude-code', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '{{target_vscode}}\n',
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'claude-code',
    );

    // variable should be unresolved (emits warning, leaves marker or empty) —
    // key point is it does NOT contain 'true'
    expect(result.content).not.toContain('true');
  });

  it('injects target_claude_code=true when building for claude-code', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '{{target_claude_code}}\n',
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'claude-code',
    );

    expect(result.content).toContain('true');
  });

  it('does not inject target_claude_code when building for vscode', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '{{target_claude_code}}\n',
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'vscode',
    );

    expect(result.content).not.toContain('true');
  });
});

// ---------------------------------------------------------------------------
// AC-3: conditional blocks resolve correctly per target
// ---------------------------------------------------------------------------

describe('target conditionals — AC-3', () => {
  it('resolves {{#if target_vscode}} block when building for vscode', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      `{{#if target_vscode}}VS Code content{{else}}Other content{{/if}}\n`,
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'vscode',
    );

    expect(result.content).toContain('VS Code content');
    expect(result.content).not.toContain('Other content');
  });

  it('resolves {{else}} branch of target_vscode when building for claude-code', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      `{{#if target_vscode}}VS Code content{{else}}Other content{{/if}}\n`,
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'claude-code',
    );

    expect(result.content).toContain('Other content');
    expect(result.content).not.toContain('VS Code content');
  });

  it('resolves {{#if target_claude_code}} block when building for claude-code', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      `{{#if target_claude_code}}CC content{{else}}Fallback content{{/if}}\n`,
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'claude-code',
    );

    expect(result.content).toContain('CC content');
    expect(result.content).not.toContain('Fallback content');
  });

  it('resolves {{else}} branch of target_claude_code when building for vscode', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      `{{#if target_claude_code}}CC content{{else}}Fallback content{{/if}}\n`,
    );

    const result = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [], 'vscode',
    );

    expect(result.content).toContain('Fallback content');
    expect(result.content).not.toContain('CC content');
  });

  it('produces different output per target when template uses target_vscode conditional', async () => {
    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      `{{#if target_vscode}}Use runSubagent{{else}}Use Task tool{{/if}}\n`,
    );

    const sharedMeta = SHARED_META;

    const vsResult = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, sharedMeta, {}, config, [], 'vscode',
    );
    const ccResult = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, sharedMeta, {}, config, [], 'claude-code',
    );

    expect(vsResult.content).toContain('Use runSubagent');
    expect(vsResult.content).not.toContain('Use Task tool');
    expect(ccResult.content).toContain('Use Task tool');
    expect(ccResult.content).not.toContain('Use runSubagent');
  });
});

// ---------------------------------------------------------------------------
// AC-4: Plugin onBuildContext receives target as 4th argument
// ---------------------------------------------------------------------------

describe('plugin onBuildContext receives target — AC-4', () => {
  it('passes the active target to the onBuildContext hook', async () => {
    const captured: (TargetType | undefined)[] = [];

    const plugin: PersonaBuildPlugin = {
      name: 'target-capture',
      onBuildContext(ctx, _persona, _suite, target) {
        captured.push(target);
        return ctx;
      },
    };

    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '# {{name}}\n',
    );

    await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [plugin], 'vscode',
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe('vscode');
  });

  it('passes claude-code target to the onBuildContext hook', async () => {
    const captured: (TargetType | undefined)[] = [];

    const plugin: PersonaBuildPlugin = {
      name: 'target-capture-cc',
      onBuildContext(ctx, _persona, _suite, target) {
        captured.push(target);
        return ctx;
      },
    };

    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '# {{name}}\n',
    );

    await buildPersona(
      personaYamlPath, 'suite', suiteConfig, SHARED_META, {}, config, [plugin], 'claude-code',
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe('claude-code');
  });

  it('allows a plugin to inject target-specific variables based on received target', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'target-aware-plugin',
      onBuildContext(ctx, _persona, _suite, target) {
        if (target === 'vscode') {
          return { ...ctx, plugin_greeting: 'Hello VS Code' };
        }
        return { ...ctx, plugin_greeting: 'Hello Claude Code' };
      },
    };

    const { personaYamlPath, suiteConfig, config } = await createSuite(
      testTmpDir,
      '{{plugin_greeting}}\n',
    );

    const sharedMeta = SHARED_META;

    const vsResult = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, sharedMeta, {}, config, [plugin], 'vscode',
    );
    const ccResult = await buildPersona(
      personaYamlPath, 'suite', suiteConfig, sharedMeta, {}, config, [plugin], 'claude-code',
    );

    expect(vsResult.content).toContain('Hello VS Code');
    expect(ccResult.content).toContain('Hello Claude Code');
  });
});
