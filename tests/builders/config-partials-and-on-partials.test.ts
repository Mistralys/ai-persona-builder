/**
 * tests/builders/config-partials-and-on-partials.test.ts
 *
 * Tests for WP-004 — Config Partials and onPartials Hook Wiring in buildSuite()
 *
 * Verifies all 8 Acceptance Criteria:
 *   AC-1: config.partials entries are present in the partials map passed to buildPersona()
 *   AC-2: File-based shared partials override config.partials entries with the same stem name
 *   AC-3: File-based suite-local partials override both shared and config.partials entries
 *   AC-4: onPartials plugin hooks are invoked after onSuiteInit and after file-based partials loading
 *   AC-5: An onPartials plugin can inject new partials and override file-based partials
 *   AC-6: The partials map returned by runPartials is used for all persona builds in the suite
 *   AC-7: Project compiles without errors (verified by build step)
 *   AC-8: All existing tests continue to pass unchanged (verified by running full suite)
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
    `wp004-partials-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});


// ---------------------------------------------------------------------------
// AC-1: config.partials entries appear in the rendered output
// ---------------------------------------------------------------------------

describe('AC-1 — config.partials entries reach buildPersona()', () => {
  it('renders a partial defined in config.partials when referenced in content', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { greeting: 'Hello from config partial.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Hello from config partial.');
  });

  it('renders multiple partials defined in config.partials', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> intro}}\n\n{{> outro}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: {
        intro: 'This is the intro.',
        outro: 'This is the outro.',
      },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('This is the intro.');
    expect(results[0].content).toContain('This is the outro.');
  });

  it('renders correctly when config.partials is absent (no-op, backward compat)', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Hello from suite partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      // No partials field
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Hello from suite partial.');
  });
});

// ---------------------------------------------------------------------------
// AC-2: File-based shared partials override config.partials (same stem name)
// ---------------------------------------------------------------------------

describe('AC-2 — shared file partials override config.partials', () => {
  it('shared partial wins over config.partials for the same key', async () => {
    const { suiteConfig, sharedPartialsDir } = await createMinimalSuite(testTmpDir, {
      sharedPartials: { greeting: 'Hello from shared file partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { greeting: 'Hello from config partial.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    // Shared file partial must win
    expect(results[0].content).toContain('Hello from shared file partial.');
    expect(results[0].content).not.toContain('Hello from config partial.');
  });

  it('config.partials key that has no file-based counterpart still appears', async () => {
    const { suiteConfig, sharedPartialsDir } = await createMinimalSuite(testTmpDir, {
      sharedPartials: { other: 'Other shared partial.' },
      contentMd: '{{> greeting}}\n{{> other}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { greeting: 'Config-only greeting.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Config-only greeting.');
    expect(results[0].content).toContain('Other shared partial.');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Suite-local file partials override both shared and config.partials
// ---------------------------------------------------------------------------

describe('AC-3 — suite-local file partials override shared and config.partials', () => {
  it('suite-local partial wins over config.partials for the same key', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Hello from suite-local partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { greeting: 'Hello from config partial.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Hello from suite-local partial.');
    expect(results[0].content).not.toContain('Hello from config partial.');
  });

  it('suite-local partial wins over shared file partial for the same key', async () => {
    const { suiteConfig, sharedPartialsDir } = await createMinimalSuite(testTmpDir, {
      sharedPartials: { greeting: 'Hello from shared file partial.' },
      suitePartials: { greeting: 'Hello from suite-local partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    expect(results[0].content).toContain('Hello from suite-local partial.');
    expect(results[0].content).not.toContain('Hello from shared file partial.');
  });

  it('full three-layer priority: suite-local > shared > config.partials', async () => {
    const { suiteConfig, sharedPartialsDir } = await createMinimalSuite(testTmpDir, {
      sharedPartials: { greeting: 'Hello from shared file partial.' },
      suitePartials: { greeting: 'Hello from suite-local partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      sharedPartialsDir,
      partials: { greeting: 'Hello from config partial.' },
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [], 'vscode');

    // Suite-local is highest — must win over both shared and config
    expect(results[0].content).toContain('Hello from suite-local partial.');
    expect(results[0].content).not.toContain('Hello from shared file partial.');
    expect(results[0].content).not.toContain('Hello from config partial.');
  });
});

// ---------------------------------------------------------------------------
// AC-4: onPartials hook is invoked after onSuiteInit and after file-based loading
// ---------------------------------------------------------------------------

describe('AC-4 — onPartials is invoked after onSuiteInit and after file-based partials', () => {
  it('onPartials fires after onSuiteInit (verified via call order recording)', async () => {
    const callOrder: string[] = [];

    const plugin: PersonaBuildPlugin = {
      name: 'call-order-tracker',
      onSuiteInit() {
        callOrder.push('onSuiteInit');
      },
      onPartials(partialsMap) {
        callOrder.push('onPartials');
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# Test\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    const suiteInitIndex = callOrder.indexOf('onSuiteInit');
    const onPartialsIndex = callOrder.indexOf('onPartials');

    expect(suiteInitIndex).toBeGreaterThanOrEqual(0);
    expect(onPartialsIndex).toBeGreaterThanOrEqual(0);
    expect(onPartialsIndex).toBeGreaterThan(suiteInitIndex);
  });

  it('onPartials receives the file-based partials already loaded (map includes file partial)', async () => {
    let receivedMap: Record<string, string> | null = null;

    const plugin: PersonaBuildPlugin = {
      name: 'map-capturer',
      onPartials(partialsMap) {
        receivedMap = { ...partialsMap };
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'File-based greeting.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    // The plugin should have received the map that already included file-based partials
    expect(receivedMap).not.toBeNull();
    expect(receivedMap!['greeting']).toBe('File-based greeting.');
  });

  it('onPartials also receives config.partials entries in the map (lowest layer merged first)', async () => {
    let receivedMap: Record<string, string> | null = null;

    const plugin: PersonaBuildPlugin = {
      name: 'map-capturer',
      onPartials(partialsMap) {
        receivedMap = { ...partialsMap };
        return partialsMap;
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# Test\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
      partials: { 'config-partial': 'Config partial content.' },
    };

    await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(receivedMap).not.toBeNull();
    expect(receivedMap!['config-partial']).toBe('Config partial content.');
  });
});

// ---------------------------------------------------------------------------
// AC-5: An onPartials plugin can inject new partials and override file-based ones
// ---------------------------------------------------------------------------

describe('AC-5 — onPartials plugin can inject and override partials', () => {
  it('plugin-injected partial (new key) is rendered in persona content', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'partial-injector',
      onPartials(partialsMap) {
        return { ...partialsMap, 'plugin-partial': 'Injected by plugin.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> plugin-partial}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results[0].content).toContain('Injected by plugin.');
  });

  it('plugin can override a file-based partial (plugin wins over file-based)', async () => {
    const plugin: PersonaBuildPlugin = {
      name: 'partial-overrider',
      onPartials(partialsMap) {
        return { ...partialsMap, greeting: 'Overridden by plugin.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      suitePartials: { greeting: 'Hello from suite-local partial.' },
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [plugin], 'vscode');

    // Plugin is highest priority and must win
    expect(results[0].content).toContain('Overridden by plugin.');
    expect(results[0].content).not.toContain('Hello from suite-local partial.');
  });

  it('multiple plugins accumulate — later plugin receives earlier plugin output', async () => {
    const firstPlugin: PersonaBuildPlugin = {
      name: 'first-plugin',
      onPartials(partialsMap) {
        return { ...partialsMap, greeting: 'From first plugin.' };
      },
    };

    const secondPlugin: PersonaBuildPlugin = {
      name: 'second-plugin',
      onPartials(partialsMap) {
        // Verify first plugin's value is visible
        expect(partialsMap['greeting']).toBe('From first plugin.');
        return { ...partialsMap, greeting: 'From second plugin.' };
      },
    };

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { 'test-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('test-suite', suiteConfig, config, [firstPlugin, secondPlugin], 'vscode');

    // Second (last) plugin wins
    expect(results[0].content).toContain('From second plugin.');
    expect(results[0].content).not.toContain('From first plugin.');
  });
});

// ---------------------------------------------------------------------------
// AC-6: The partials map from runPartials is used for ALL persona builds in the suite
// ---------------------------------------------------------------------------

describe('AC-6 — onPartials result is used for every persona in the suite', () => {
  it('a plugin-injected partial is available to all personas in the suite', async () => {
    // Create a suite with two persona files
    const suiteDir = path.join(testTmpDir, 'multi-persona-suite');
    const outDir = path.join(testTmpDir, 'out');

    await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
    await mkdir(path.join(suiteDir, 'content'), { recursive: true });
    await mkdir(path.join(suiteDir, 'partials'), { recursive: true });

    await writeFile(
      path.join(suiteDir, 'meta', '_shared.yaml'),
      'default_version: "1.0.0"\n',
    );

    // First persona
    await writeFile(
      path.join(suiteDir, 'meta', 'agent-a.yaml'),
      'name: Agent A\nvs_file_name: agent-a.agent.md\ncc_file_name: agent-a.md\n',
    );
    await writeFile(
      path.join(suiteDir, 'content', 'agent-a.md'),
      '{{> shared-info}}\n',
    );

    // Second persona
    await writeFile(
      path.join(suiteDir, 'meta', 'agent-b.yaml'),
      'name: Agent B\nvs_file_name: agent-b.agent.md\ncc_file_name: agent-b.md\n',
    );
    await writeFile(
      path.join(suiteDir, 'content', 'agent-b.md'),
      '{{> shared-info}}\n',
    );

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: outDir,
      outClaudeCode: outDir,
    };

    const plugin: PersonaBuildPlugin = {
      name: 'shared-info-injector',
      onPartials(partialsMap) {
        return { ...partialsMap, 'shared-info': 'Shared info from plugin.' };
      },
    };

    const config: BuildConfig = {
      suites: { 'multi-suite': suiteConfig },
      targets: ['vscode'],
    };

    const results = await buildSuite('multi-suite', suiteConfig, config, [plugin], 'vscode');

    expect(results).toHaveLength(2);
    // Both personas should have the plugin-injected partial resolved
    expect(results[0].content).toContain('Shared info from plugin.');
    expect(results[1].content).toContain('Shared info from plugin.');
  });

  it('onPartials is invoked exactly once per suite (not once per persona)', async () => {
    const onPartialsCalls: string[] = [];

    const plugin: PersonaBuildPlugin = {
      name: 'call-counter',
      onPartials(partialsMap, suiteName) {
        onPartialsCalls.push(suiteName);
        return partialsMap;
      },
    };

    // Create a suite with two persona files
    const suiteDir = path.join(testTmpDir, 'two-persona-suite');
    const outDir = path.join(testTmpDir, 'out');

    await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
    await mkdir(path.join(suiteDir, 'content'), { recursive: true });
    await mkdir(path.join(suiteDir, 'partials'), { recursive: true });

    await writeFile(path.join(suiteDir, 'meta', '_shared.yaml'), 'default_version: "1.0.0"\n');

    for (const slug of ['persona-x', 'persona-y']) {
      await writeFile(
        path.join(suiteDir, 'meta', `${slug}.yaml`),
        `name: ${slug}\nvs_file_name: ${slug}.agent.md\ncc_file_name: ${slug}.md\n`,
      );
      await writeFile(path.join(suiteDir, 'content', `${slug}.md`), `# ${slug}\n`);
    }

    const suiteConfig: SuiteConfig = {
      srcDir: suiteDir,
      outVscode: outDir,
      outClaudeCode: outDir,
    };

    const config: BuildConfig = {
      suites: { 'two-persona-suite': suiteConfig },
      targets: ['vscode'],
    };

    await buildSuite('two-persona-suite', suiteConfig, config, [plugin], 'vscode');

    // onPartials should have been called exactly once (once per suite, not once per persona)
    expect(onPartialsCalls).toHaveLength(1);
    expect(onPartialsCalls[0]).toBe('two-persona-suite');
  });
});
