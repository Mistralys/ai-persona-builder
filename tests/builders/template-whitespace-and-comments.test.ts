/**
 * tests/builders/template-whitespace-and-comments.test.ts
 *
 * Builder-level integration tests for WP-006 — comment-inertness at every
 * point a template passes through the builder. Unit coverage for the
 * underlying tokenizer contract (`resolveConditionals()` / `stripComments()`
 * themselves) lives in tests/engine/conditionals.test.ts; these tests prove
 * each of the three strip points independently, with no backstop inside
 * `resolveConditionals()`:
 *
 *   1. The loaded body template (`buildPersona()` step 6)
 *   2. The final per-persona partials map (`buildPersona()` step 4)
 *   3. The frontmatter template (`renderFrontmatter()`)
 *
 * A commented-out `{{> partial}}` must neither expand, nor warn, nor trigger
 * a `ToolRequirement` `partial` trigger; a commented-out `{{variable}}` must
 * produce no unresolved-variable warning; `{{else}}{{!-- … --}}` must
 * resolve as a standalone `{{else}}`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin } from '../../src/plugins/types.js';
import type { ToolRequirement } from '../../src/validators/tool-requirements-validator.js';
import { createMinimalSuite } from '../helpers/suite-fixture.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let testTmpDir: string;

beforeEach(async () => {
  testTmpDir = path.join(
    tmpdir(),
    `wp006-comment-stripping-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testTmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(testTmpDir, { recursive: true, force: true });
});

function findResult(summary: Awaited<ReturnType<typeof build>>, target: string) {
  return summary.results.find((r) => r.target === target);
}

// ---------------------------------------------------------------------------
// Strip point 1 — the loaded body template
// ---------------------------------------------------------------------------

describe('stripComments — loaded body template', () => {
  it('a commented-out {{> partial}} neither expands nor warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{!-- {{> missing}} --}}\nAfter.\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('{{>');
    expect(content).not.toContain('missing');
    // resolvePartials() warns on an unresolved partial reference — the
    // commented-out reference must never reach it.
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('missing'))).toBe(false);

    warnSpy.mockRestore();
  });

  it('a commented-out {{variable}} produces no unresolved-variable warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{!-- {{totally_unknown_variable}} --}}\nAfter.\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('totally_unknown_variable');
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes('totally_unknown_variable')),
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it('a commented-out {{> partial}} reference does not trigger a ToolRequirement partial trigger', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'cc_tools:',
        '  - Read',
        'vs_file_name: agent.agent.md',
        'cc_file_name: agent.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n\n{{!-- {{> handoff}} --}}\n',
      suitePartials: { handoff: 'Hand off to a sub-agent.' },
    });

    const requirement: ToolRequirement = {
      id: 'handoff-partial',
      when: { partial: 'handoff' },
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      targets: ['claude-code'],
      toolRequirements: [requirement],
      check: true,
    };

    const summary = await build(config);
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) =>
      r.message.includes('handoff-partial'),
    );

    // The requirement's `when.partial: 'handoff'` trigger must not fire —
    // the only reference to it is inside a comment, and commenting it out
    // must behave exactly as if the reference were never written at all.
    expect(ccErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Strip point 2 — the final per-persona partials map
// ---------------------------------------------------------------------------

describe('stripComments — final per-persona partials map', () => {
  it('strips a comment inside a suite-local partial before it is inlined', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{> greeting}}\n',
      suitePartials: {
        greeting: 'Hello.{{!-- internal note, never shipped --}}\nWelcome.',
      },
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('internal note');
    expect(content).toContain('Hello.');
    expect(content).toContain('Welcome.');
  });

  it('strips a comment inside a shared partial before it is inlined', async () => {
    const { suiteConfig, sharedPartialsDir } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{> greeting}}\n',
      sharedPartials: {
        greeting: 'Hello.{{!-- internal note, never shipped --}}\nWelcome.',
      },
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      sharedPartialsDir,
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('internal note');
    expect(content).toContain('Hello.');
    expect(content).toContain('Welcome.');
  });

  it('strips a comment inside a config-injected partial (BuildConfig.partials)', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{> greeting}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      partials: { greeting: 'Hello.{{!-- internal note, never shipped --}}\nWelcome.' },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('internal note');
    expect(content).toContain('Hello.');
    expect(content).toContain('Welcome.');
  });

  it('strips a comment inside a plugin-injected partial (onPersonaPartials)', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n\n{{> greeting}}\n',
    });

    const injectPlugin: PersonaBuildPlugin = {
      name: 'inject-greeting',
      onPersonaPartials(partials) {
        return { ...partials, greeting: 'Hello.{{!-- injected, never shipped --}}\nWelcome.' };
      },
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      plugins: [injectPlugin],
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('injected, never shipped');
    expect(content).toContain('Hello.');
    expect(content).toContain('Welcome.');
  });
});

// ---------------------------------------------------------------------------
// Strip point 3 — the frontmatter template
// ---------------------------------------------------------------------------

describe('stripComments — frontmatter template', () => {
  it('strips a comment inside a plugin-registered frontmatter template', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd: '# {{name}}\n',
    });

    const frontmatterPlugin: PersonaBuildPlugin = {
      name: 'custom-frontmatter',
      frontmatterTemplates: {
        vscode:
          "---\nname: '{{name}}'\n{{!-- do not ship this note --}}\ndescription: '{{description}}'\n---",
      },
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      plugins: [frontmatterPlugin],
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('do not ship this note');
    expect(content).toContain("name: 'Test Agent'");
  });
});

// ---------------------------------------------------------------------------
// {{else}}{{!-- … --}} resolves as a standalone {{else}}
// ---------------------------------------------------------------------------

describe('conditional {{else}} followed by an inline comment', () => {
  it('resolves {{else}}{{!-- note --}} as a standalone {{else}}, taking the else branch', async () => {
    const { suiteConfig } = await createMinimalSuite(testTmpDir, {
      contentMd:
        '# {{name}}\n\n{{#if never_set}}\nHidden.\n{{else}}{{!-- fallback note --}}\nVisible.\n{{/if}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suiteConfig.srcDir, outVscode: suiteConfig.outVscode, outClaudeCode: suiteConfig.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    const content = findResult(summary, 'vscode')!.content;

    expect(content).not.toContain('Hidden.');
    expect(content).not.toContain('fallback note');
    expect(content).toContain('Visible.');
  });
});
