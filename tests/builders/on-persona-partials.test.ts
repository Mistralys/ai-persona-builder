/**
 * tests/builders/on-persona-partials.test.ts
 *
 * Tests for WP-005 — onPersonaPartials Hook Wiring in buildPersona()
 *
 * Verifies all 7 Acceptance Criteria:
 *   AC-1: An onPersonaPartials plugin can inject a partial resolvable as {{> partialName}}
 *   AC-2: An onPersonaPartials plugin can override a suite-level partial for a single persona
 *   AC-3: Persona-level partial overrides do not leak to other personas (shallow copy isolation)
 *   AC-4: The hook receives the post-onBuildContext context (persona metadata is accessible)
 *   AC-5: The hook receives the current target value
 *   AC-6: Project compiles without errors (verified by build step)
 *   AC-7: All existing tests continue to pass unchanged (verified by running full suite)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildSuite } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin, SuiteConfig } from '../../src/plugins/types.js';
import { createMinimalSuite } from '../helpers/suite-fixture.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `wp005-persona-partials-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Local helper: two-persona suite (thin wrapper over the shared fixture)
//
// The shared createMinimalSuite() creates one persona. Tests that need two
// personas build on top of it: the suite directory from the first call is
// reused, and persona-b YAML + content files are added manually.
// ---------------------------------------------------------------------------

interface TwoPersonaFixture {
  suiteDir: string;
  outDir: string;
  suiteConfig: SuiteConfig;
}

async function createTwoPersonaSuite(opts: {
  contentA?: string;
  contentB?: string;
  suitePartials?: Record<string, string>;
}): Promise<TwoPersonaFixture> {
  // Use createMinimalSuite for the base structure and persona-a
  const fixture = await createMinimalSuite(testTmpDir, {
    personaName: 'agent-a',
    personaYaml: 'name: Agent A\nvs_file_name: agent-a.agent.md\ncc_file_name: agent-a.md\ndescription: ""\n',
    contentMd: opts.contentA ?? '# Agent A\n',
    suitePartials: opts.suitePartials,
  });

  // Add persona-b into the same suite directory
  await writeFile(
    path.join(fixture.suiteDir, 'meta', 'agent-b.yaml'),
    'name: Agent B\nvs_file_name: agent-b.agent.md\ncc_file_name: agent-b.md\ndescription: ""\n',
  );
  await writeFile(
    path.join(fixture.suiteDir, 'content', 'agent-b.md'),
    opts.contentB ?? '# Agent B\n',
  );

  return { suiteDir: fixture.suiteDir, outDir: fixture.outDir, suiteConfig: fixture.suiteConfig };
}

// ---------------------------------------------------------------------------
// AC-1: onPersonaPartials plugin can inject a new partial resolvable in the template
// ---------------------------------------------------------------------------

describe('AC-1 — onPersonaPartials plugin can inject a new partial', () => {
  it('a plugin-injected partial is resolved in the persona content template', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'persona-partial-injector',
      onPersonaPartials(partialsMap) {
        return { ...partialsMap, 'persona-greeting': 'Hello from persona partial.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> persona-greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Hello from persona partial.');
  });

  it('multiple plugins accumulate — later plugin receives and can extend earlier output', async () => {
    const firstPlugin: PersonaBuildPlugin = {
      name: 'first',
      onPersonaPartials(partialsMap) {
        return { ...partialsMap, part1: 'Part 1 content.' };
      },
    };

    const secondPlugin: PersonaBuildPlugin = {
      name: 'second',
      onPersonaPartials(partialsMap) {
        // Should already have part1 from firstPlugin
        expect(partialsMap['part1']).toBe('Part 1 content.');
        return { ...partialsMap, part2: 'Part 2 content.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> part1}}\n{{> part2}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [firstPlugin, secondPlugin], 'vscode');

    expect(results[0].content).toContain('Part 1 content.');
    expect(results[0].content).toContain('Part 2 content.');
  });

  it('plugins without onPersonaPartials are skipped gracefully', async () => {
    const noHookPlugin: PersonaBuildPlugin = {
      name: 'no-hook',
      // No onPersonaPartials
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Suite greeting.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [noHookPlugin], 'vscode');

    expect(results[0].content).toContain('Suite greeting.');
  });
});

// ---------------------------------------------------------------------------
// AC-2: onPersonaPartials plugin can override a suite-level partial for one persona
// ---------------------------------------------------------------------------

describe('AC-2 — onPersonaPartials can override a suite-level partial', () => {
  it('persona-level override wins over the suite-level partial of the same name', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'suite-overrider',
      onPersonaPartials(partialsMap) {
        return { ...partialsMap, greeting: 'Persona-level greeting.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Suite-level greeting.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results[0].content).toContain('Persona-level greeting.');
    expect(results[0].content).not.toContain('Suite-level greeting.');
  });

  it('persona-level override wins over a config.partials entry of the same name', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'config-overrider',
      onPersonaPartials(partialsMap) {
        return { ...partialsMap, note: 'Note overridden at persona level.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> note}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { note: 'Config-level note.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results[0].content).toContain('Note overridden at persona level.');
    expect(results[0].content).not.toContain('Config-level note.');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Persona-level partial overrides do not leak to other personas
// ---------------------------------------------------------------------------

describe('AC-3 — persona-level partial overrides do not leak across personas', () => {
  it('override applied for persona-a is not visible when rendering persona-b', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'conditional-overrider',
      onPersonaPartials(partialsMap, persona) {
        // Only override for agent-a
        if (persona.name === 'Agent A') {
          return { ...partialsMap, greeting: 'Greeting for Agent A only.' };
        }
        return partialsMap;
      },
    };

    const { suiteConfig } = await createTwoPersonaSuite({
      suitePartials: { greeting: 'Suite greeting.' },
      contentA: '{{> greeting}}\n',
      contentB: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    // Sort results by persona YAML path for stable ordering
    const agentA = results.find((r) => r.personaYamlPath.includes('agent-a'))!;
    const agentB = results.find((r) => r.personaYamlPath.includes('agent-b'))!;

    expect(agentA).toBeDefined();
    expect(agentB).toBeDefined();

    // Agent A should use the persona-level override
    expect(agentA.content).toContain('Greeting for Agent A only.');
    expect(agentA.content).not.toContain('Suite greeting.');

    // Agent B should fall back to the suite-level partial — no leakage
    expect(agentB.content).toContain('Suite greeting.');
    expect(agentB.content).not.toContain('Greeting for Agent A only.');
  });

  it('a plugin that unconditionally injects a new partial does not corrupt the suite map for subsequent personas', async () => {
    // Track which partials map each persona sees (post-hook)
    const capturedMaps: Record<string, string>[] = [];

    const capturingPlugin: PersonaBuildPlugin = {
      name: 'map-capturer',
      onPersonaPartials(partialsMap) {
        // Inject a new key — should NOT appear in the next persona's BASE map
        const extended = { ...partialsMap, injected: 'Injected content.' };
        capturedMaps.push(extended);
        return extended;
      },
    };

    const { suiteConfig } = await createTwoPersonaSuite({
      contentA: '{{> injected}}\n',
      contentB: '{{> injected}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    // Both renders succeed (injected key available in each persona's local copy)
    const results = await buildSuite('test-suite', suiteConfig, config, [capturingPlugin], 'vscode');

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.content).toContain('Injected content.');
    }

    // Two invocations — each persona got its own map snapshot
    expect(capturedMaps).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// AC-4: The hook receives the post-onBuildContext context
// ---------------------------------------------------------------------------

describe('AC-4 — onPersonaPartials receives the post-onBuildContext context', () => {
  it('persona metadata fields are accessible in the context argument', async () => {
    let capturedContext: Record<string, unknown> | null = null;

    const plugin: PersonaBuildPlugin = {
      name: 'context-capturer',
      onPersonaPartials(partialsMap, _persona, context) {
        capturedContext = { ...context };
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: 'name: Test Agent\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\ncustom_field: my-value\n',
      contentMd: '# Test\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(capturedContext).not.toBeNull();
    // The context must contain the persona name and custom field from the YAML
    expect(capturedContext!['name']).toBe('Test Agent');
    expect(capturedContext!['custom_field']).toBe('my-value');
  });

  it('a context key injected by an onBuildContext plugin is visible in onPersonaPartials', async () => {
    let contextKeyInPartials: unknown = undefined;

    const buildContextPlugin: PersonaBuildPlugin = {
      name: 'context-injector',
      onBuildContext(ctx) {
        return { ...ctx, injected_by_build_context: 'build-context-value' };
      },
    };

    const personaPartialsPlugin: PersonaBuildPlugin = {
      name: 'context-reader',
      onPersonaPartials(partialsMap, _persona, context) {
        contextKeyInPartials = context['injected_by_build_context'];
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, { contentMd: '# Test\n' });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('test-suite', suiteConfig, config, [buildContextPlugin, personaPartialsPlugin], 'vscode');

    expect(contextKeyInPartials).toBe('build-context-value');
  });

  it('onPersonaPartials can use context fields to produce dynamic partial content', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'dynamic-partial-builder',
      onPersonaPartials(partialsMap, _persona, context) {
        const agentName = typeof context['name'] === 'string' ? context['name'] : 'Unknown';
        return { ...partialsMap, 'dynamic-greeting': `Hello, ${agentName}!` };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: 'name: Aria\nvs_file_name: agent.agent.md\ncc_file_name: agent.md\n',
      contentMd: '{{> dynamic-greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results[0].content).toContain('Hello, Aria!');
  });
});

// ---------------------------------------------------------------------------
// AC-5: The hook receives the current target value
// ---------------------------------------------------------------------------

describe('AC-5 — onPersonaPartials receives the current target', () => {
  it('target is passed to the plugin hook', async () => {
    let capturedTarget: string | undefined = undefined;

    const plugin: PersonaBuildPlugin = {
      name: 'target-capturer',
      onPersonaPartials(partialsMap, _persona, _context, _suite, target) {
        capturedTarget = target;
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, { contentMd: '# Test\n' });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(capturedTarget).toBe('vscode');
  });

  it('target-conditional partial injection produces different output per target', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'target-conditional',
      onPersonaPartials(partialsMap, _persona, _context, _suite, target) {
        if (target === 'vscode') {
          return { ...partialsMap, 'target-note': 'VS Code output.' };
        }
        if (target === 'claude-code') {
          return { ...partialsMap, 'target-note': 'Claude Code output.' };
        }
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, { contentMd: '{{> target-note}}\n' });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode', 'claude-code'],
    };

    const vscodeResults = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');
    const ccResults = await buildSuite('test-suite', suiteConfig, config, [plugin], 'claude-code');

    expect(vscodeResults[0].content).toContain('VS Code output.');
    expect(ccResults[0].content).toContain('Claude Code output.');
  });
});
