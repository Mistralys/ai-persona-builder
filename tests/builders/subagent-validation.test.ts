/**
 * tests/builders/subagent-validation.test.ts
 *
 * Tests for the subagent slug validation feature added to buildPersona().
 *
 * Covers acceptance criteria from WP-005 (2026-04-14-pm-subagent-reliability):
 *   1. Persona with subagents referencing an existing summary slug → passes silently
 *   2. Persona with an unknown subagent slug → error-severity ValidationResult
 *   3. Persona without a subagents field → passes silently
 *   4. strict mode with an invalid slug → build throws
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildPersona, build } from '../../src/builders/persona-builder.js';
import type { BuildConfig, BuildSummary } from '../../src/builders/types.js';
import type { SuiteConfig } from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `subagent-val-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Workspace builder helpers
// ---------------------------------------------------------------------------

/**
 * Create a two-suite workspace:
 *   - 'main' suite: one persona that declares subagents
 *   - 'standalone' suite: one persona that can serve as a valid subagent target
 *
 * `mainSubagents` is written verbatim as the YAML list value for the `subagents` key.
 * Pass `undefined` to omit the field entirely.
 */
async function createTwoSuiteWorkspace(
  baseDir: string,
  opts: {
    mainSubagents?: string[];
    standaloneSlug?: string;
  } = {},
): Promise<{
  mainSuiteConfig: SuiteConfig;
  standaloneSuiteConfig: SuiteConfig;
  mainPersonaYamlPath: string;
  config: BuildConfig;
}> {
  const mainSuiteDir = path.join(baseDir, 'main');
  const standaloneSuiteDir = path.join(baseDir, 'standalone');
  const outDir = path.join(baseDir, 'out');
  const standaloneSlug = opts.standaloneSlug ?? 'helper-agent';

  // ── main suite ────────────────────────────────────────────────────────────
  await mkdir(path.join(mainSuiteDir, 'meta'), { recursive: true });
  await mkdir(path.join(mainSuiteDir, 'content'), { recursive: true });

  await writeFile(
    path.join(mainSuiteDir, 'meta', '_shared.yaml'),
    `default_version: '1.0.0'\n`,
  );

  let mainYaml = `name: Main Persona\ndescription: The main persona.\nvs_file_name: main-persona.agent.md\ncc_file_name: main-persona.md\n`;
  if (opts.mainSubagents !== undefined) {
    mainYaml += `subagents:\n${opts.mainSubagents.map((s) => `  - ${s}`).join('\n')}\n`;
  }
  await writeFile(path.join(mainSuiteDir, 'meta', 'main-persona.yaml'), mainYaml);
  await writeFile(
    path.join(mainSuiteDir, 'content', 'main-persona.md'),
    '# {{name}}\n\n{{description}}\n',
  );

  // ── standalone suite ──────────────────────────────────────────────────────
  await mkdir(path.join(standaloneSuiteDir, 'meta'), { recursive: true });
  await mkdir(path.join(standaloneSuiteDir, 'content'), { recursive: true });

  await writeFile(
    path.join(standaloneSuiteDir, 'meta', '_shared.yaml'),
    `default_version: '1.0.0'\n`,
  );
  await writeFile(
    path.join(standaloneSuiteDir, 'meta', `${standaloneSlug}.yaml`),
    `name: Helper Agent\nslug: ${standaloneSlug}\ndescription: A helper.\nvs_file_name: ${standaloneSlug}.agent.md\ncc_file_name: ${standaloneSlug}.md\n`,
  );
  await writeFile(
    path.join(standaloneSuiteDir, 'content', `${standaloneSlug}.md`),
    '# {{name}}\n',
  );

  const mainSuiteConfig: SuiteConfig = {
    srcDir: mainSuiteDir,
    outputDirs: {
      vscode: path.join(outDir, 'main', 'vscode'),
      'claude-code': path.join(outDir, 'main', 'cc'),
    },
  };

  const standaloneSuiteConfig: SuiteConfig = {
    srcDir: standaloneSuiteDir,
    outputDirs: {
      vscode: path.join(outDir, 'standalone', 'vscode'),
      'claude-code': path.join(outDir, 'standalone', 'cc'),
    },
  };

  const config: BuildConfig = {
    suites: {
      main: mainSuiteConfig,
      standalone: standaloneSuiteConfig,
    },
    targets: ['vscode'],
    check: true,
  };

  return {
    mainSuiteConfig,
    standaloneSuiteConfig,
    mainPersonaYamlPath: path.join(mainSuiteDir, 'meta', 'main-persona.yaml'),
    config,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subagent slug validation — buildPersona()', () => {
  it('passes silently when persona has no subagents field', async () => {
    const { mainSuiteConfig, mainPersonaYamlPath, config } =
      await createTwoSuiteWorkspace(testTmpDir);

    // Provide an agentMap with an unrelated key — no subagents declared
    const agentMap: Record<string, string> = {
      agent_slug_helper_agent: 'helper-agent',
    };

    const result = await buildPersona(
      mainPersonaYamlPath,
      'main',
      mainSuiteConfig,
      { default_version: '1.0.0' },
      {},
      config,
      [],
      'vscode',
      agentMap,
    );

    const subagentErrors = result.validationResults.filter((r) => r.severity === 'error');
    expect(subagentErrors).toHaveLength(0);
  });

  it('passes silently when all declared subagent slugs exist in the agent map', async () => {
    const { mainSuiteConfig, mainPersonaYamlPath, config } =
      await createTwoSuiteWorkspace(testTmpDir, {
        mainSubagents: ['helper-agent'],
        standaloneSlug: 'helper-agent',
      });

    const agentMap: Record<string, string> = {
      agent_slug_helper_agent: 'helper-agent',
    };

    const result = await buildPersona(
      mainPersonaYamlPath,
      'main',
      mainSuiteConfig,
      { default_version: '1.0.0' },
      {},
      config,
      [],
      'vscode',
      agentMap,
    );

    const subagentErrors = result.validationResults.filter((r) => r.severity === 'error');
    expect(subagentErrors).toHaveLength(0);
  });

  it('produces an error ValidationResult for an unknown subagent slug', async () => {
    const { mainSuiteConfig, mainPersonaYamlPath, config } =
      await createTwoSuiteWorkspace(testTmpDir, {
        mainSubagents: ['nonexistent-slug'],
      });

    // agentMap does NOT contain 'agent_slug_nonexistent_slug'
    const agentMap: Record<string, string> = {
      agent_slug_helper_agent: 'helper-agent',
    };

    const result = await buildPersona(
      mainPersonaYamlPath,
      'main',
      mainSuiteConfig,
      { default_version: '1.0.0' },
      {},
      config,
      [],
      'vscode',
      agentMap,
    );

    const subagentErrors = result.validationResults.filter((r) => r.severity === 'error');
    expect(subagentErrors).toHaveLength(1);
    expect(subagentErrors[0].message).toContain('nonexistent-slug');
    expect(subagentErrors[0].message).toContain('Main Persona');
  });

  it('produces one error per unknown slug when multiple are declared', async () => {
    const { mainSuiteConfig, mainPersonaYamlPath, config } =
      await createTwoSuiteWorkspace(testTmpDir, {
        mainSubagents: ['missing-one', 'missing-two', 'helper-agent'],
        standaloneSlug: 'helper-agent',
      });

    const agentMap: Record<string, string> = {
      // Only helper-agent exists — the other two are unknown
      agent_slug_helper_agent: 'helper-agent',
    };

    const result = await buildPersona(
      mainPersonaYamlPath,
      'main',
      mainSuiteConfig,
      { default_version: '1.0.0' },
      {},
      config,
      [],
      'vscode',
      agentMap,
    );

    const subagentErrors = result.validationResults.filter((r) => r.severity === 'error');
    expect(subagentErrors).toHaveLength(2);
    const messages = subagentErrors.map((r) => r.message);
    expect(messages.some((m) => m.includes('missing-one'))).toBe(true);
    expect(messages.some((m) => m.includes('missing-two'))).toBe(true);
  });

  it('slug validation handles underscores in key lookup (hyphens → underscores)', async () => {
    const { mainSuiteConfig, mainPersonaYamlPath, config } =
      await createTwoSuiteWorkspace(testTmpDir, {
        mainSubagents: ['multi-word-slug'],
      });

    // Key in agentMap uses underscores
    const agentMap: Record<string, string> = {
      agent_slug_multi_word_slug: 'multi-word-slug',
    };

    const result = await buildPersona(
      mainPersonaYamlPath,
      'main',
      mainSuiteConfig,
      { default_version: '1.0.0' },
      {},
      config,
      [],
      'vscode',
      agentMap,
    );

    const subagentErrors = result.validationResults.filter((r) => r.severity === 'error');
    expect(subagentErrors).toHaveLength(0);
  });
});

describe('subagent slug validation — strict mode', () => {
  it('build() throws in strict mode when a persona declares an unknown subagent slug', async () => {
    const { config } = await createTwoSuiteWorkspace(testTmpDir, {
      mainSubagents: ['this-does-not-exist'],
    });

    const strictConfig: BuildConfig = { ...config, strict: true };

    await expect(build(strictConfig)).rejects.toThrow(/strict mode/i);
  });

  it('build() succeeds in strict mode when all declared subagent slugs are valid', async () => {
    const { config } = await createTwoSuiteWorkspace(testTmpDir, {
      mainSubagents: ['helper-agent'],
      standaloneSlug: 'helper-agent',
    });

    const strictConfig: BuildConfig = { ...config, strict: true };

    const summary: BuildSummary = await build(strictConfig);
    expect(summary.success).toBe(true);
  });
});
