/**
 * tests/builders/tool-requirements.test.ts
 *
 * Integration tests for the WP-008 wiring of `validateToolRequirements()`
 * into `buildPersona()` step 10:
 *   - Applied-requirements list (built-in + config, dedup by id)
 *   - `when.field` triggers against the post-`onBuildContext` context
 *   - `when.partial` triggers via `collectPartialReferences()`, target-scoped
 *   - `BuildResult.effectiveTools` recorded for every result
 *
 * Unit coverage for `validateToolRequirements()` itself lives in
 * tests/validators/tool-requirements-validator.test.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from '../../src/builders/persona-builder.js';
import type { BuildConfig } from '../../src/builders/types.js';
import type { PersonaBuildPlugin } from '../../src/plugins/types.js';
import type { ToolRequirement } from '../../src/validators/tool-requirements-validator.js';

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `tool-requirements-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  opts: { personaYaml: string; contentMd: string; partials?: Record<string, string> },
): Promise<{ srcDir: string; outVscode: string; outClaudeCode: string }> {
  const srcDir = path.join(baseDir, 'src');
  const outVscode = path.join(baseDir, 'out', 'vscode');
  const outClaudeCode = path.join(baseDir, 'out', 'claude-code');

  await mkdir(path.join(srcDir, 'meta'), { recursive: true });
  await mkdir(path.join(srcDir, 'content'), { recursive: true });
  await mkdir(outVscode, { recursive: true });
  await mkdir(outClaudeCode, { recursive: true });

  await writeFile(path.join(srcDir, 'meta', '_shared.yaml'), "default_version: '1.0.0'\n");
  await writeFile(path.join(srcDir, 'meta', 'persona.yaml'), opts.personaYaml);
  await writeFile(path.join(srcDir, 'content', 'persona.md'), opts.contentMd);

  if (opts.partials) {
    const partialsDir = path.join(srcDir, 'partials');
    await mkdir(partialsDir, { recursive: true });
    for (const [name, content] of Object.entries(opts.partials)) {
      await writeFile(path.join(partialsDir, `${name}.md`), content);
    }
  }

  return { srcDir, outVscode, outClaudeCode };
}

function findResult(summary: Awaited<ReturnType<typeof build>>, target: string) {
  return summary.results.find((r) => r.target === target);
}

// ---------------------------------------------------------------------------
// AC: subagents field trigger, per-target dispatch grant
// ---------------------------------------------------------------------------

describe('tool requirements — subagents field trigger (built-in requirement)', () => {
  it('a persona declaring subagents but lacking Task in claude-code tools errors only on the claude-code result', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: dispatcher',
        'name: Dispatcher',
        'description: Test.',
        'subagents:',
        '  - helper',
        'tools:',
        '  - agent',
        'cc_tools:',
        '  - Read',
        'vs_file_name: dispatcher.agent.md',
        'cc_file_name: dispatcher.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    const vscodeErrors = findResult(summary, 'vscode')!.validationResults.filter((r) => r.severity === 'error');
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) => r.severity === 'error');

    // vscode grants 'agent' → dispatch satisfied, no subagent-dispatch error.
    expect(vscodeErrors.filter((e) => e.message.includes('subagent-dispatch'))).toHaveLength(0);
    // claude-code grants only 'Read' → no dispatch tool → error.
    expect(ccErrors.filter((e) => e.message.includes('subagent-dispatch'))).toHaveLength(1);
  });

  it('lacking agent in vscode tools errors only on the vscode result', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: dispatcher',
        'name: Dispatcher',
        'description: Test.',
        'subagents:',
        '  - helper',
        'tools:',
        '  - read',
        'cc_tools:',
        '  - Task',
        'vs_file_name: dispatcher.agent.md',
        'cc_file_name: dispatcher.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode', 'claude-code'],
      check: true,
    };

    const summary = await build(config);

    const vscodeErrors = findResult(summary, 'vscode')!.validationResults.filter((r) =>
      r.message.includes('subagent-dispatch'),
    );
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) =>
      r.message.includes('subagent-dispatch'),
    );

    expect(vscodeErrors).toHaveLength(1);
    expect(ccErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC: config partial-trigger rule, target-scoped
// ---------------------------------------------------------------------------

describe('tool requirements — config partial trigger, target-scoped', () => {
  it("a config rule { partial: 'handoff', targets: ['claude-code'] } fires for a nested include and does not fire on vscode", async () => {
    const base = makeTempDir();
    // 'outer' partial includes 'handoff' one level deep — collectPartialReferences
    // must find it via its depth-1 nesting support.
    const suite = await createSuite(
      base,
      {
        personaYaml: [
          'slug: handoff-persona',
          'name: Handoff Persona',
          'description: Test.',
          'tools:',
          '  - read',
          'cc_tools:',
          '  - Read',
          'vs_file_name: handoff-persona.agent.md',
          'cc_file_name: handoff-persona.md',
        ].join('\n') + '\n',
        contentMd: '{{> outer}}\n',
        partials: {
          outer: '{{> handoff}}',
          handoff: 'Hand off to a sub-agent.',
        },
      },
    );

    const requirement: ToolRequirement = {
      id: 'handoff-partial',
      when: { partial: 'handoff' },
      targets: ['claude-code'],
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode', 'claude-code'],
      toolRequirements: [requirement],
      check: true,
    };

    const summary = await build(config);

    const vscodeErrors = findResult(summary, 'vscode')!.validationResults.filter((r) =>
      r.message.includes('handoff-partial'),
    );
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) =>
      r.message.includes('handoff-partial'),
    );

    // Restricted to claude-code — never applies to vscode regardless of grant.
    expect(vscodeErrors).toHaveLength(0);
    // claude-code grants only 'Read' (no dispatch tool) → the partial-triggered
    // requirement fires and is ungranted → one error.
    expect(ccErrors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC: onBuildContext-added dispatch tool clears the error
// ---------------------------------------------------------------------------

describe('tool requirements — validated against the post-onBuildContext context', () => {
  it("a plugin's onBuildContext adding the dispatch tool clears the error", async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: dispatcher',
        'name: Dispatcher',
        'description: Test.',
        'subagents:',
        '  - helper',
        'cc_tools:',
        '  - Read',
        'vs_file_name: dispatcher.agent.md',
        'cc_file_name: dispatcher.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const addTaskPlugin: PersonaBuildPlugin = {
      name: 'add-task',
      onBuildContext(context) {
        const ccTools = Array.isArray(context['cc_tools']) ? (context['cc_tools'] as string[]) : [];
        return { ...context, cc_tools: [...ccTools, 'Task'] };
      },
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['claude-code'],
      plugins: [addTaskPlugin],
      check: true,
    };

    const summary = await build(config);
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) =>
      r.message.includes('subagent-dispatch'),
    );
    expect(ccErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC: config requirement id replaces the built-in
// ---------------------------------------------------------------------------

describe('tool requirements — a config entry reusing the built-in id replaces it', () => {
  it('only one requirement applies when config declares the same id as SUBAGENT_DISPATCH_REQUIREMENT', async () => {
    const base = makeTempDir();
    // A persona with `subagents` declared, but the replacement requirement's
    // `when` triggers on a *different* field ('escalate') instead — proving
    // the built-in's own `subagents` trigger no longer applies once replaced.
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: dispatcher',
        'name: Dispatcher',
        'description: Test.',
        'subagents:',
        '  - helper',
        'cc_tools:',
        '  - Read',
        'vs_file_name: dispatcher.agent.md',
        'cc_file_name: dispatcher.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const replacement: ToolRequirement = {
      id: 'subagent-dispatch', // same id as SUBAGENT_DISPATCH_REQUIREMENT
      when: { field: 'escalate' }, // does not match this persona's metadata
    };

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['claude-code'],
      toolRequirements: [replacement],
      check: true,
    };

    const summary = await build(config);
    const ccErrors = findResult(summary, 'claude-code')!.validationResults.filter((r) =>
      r.message.includes('subagent-dispatch'),
    );
    // The built-in's `subagents` trigger has been replaced by one keyed on
    // `escalate` (absent here) — so despite declaring `subagents`, no
    // dispatch-grant error fires; only the replacement's trigger condition
    // (not present in this fixture) would have fired it.
    expect(ccErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC: BuildResult.effectiveTools recorded for every result
// ---------------------------------------------------------------------------

describe('BuildResult.effectiveTools', () => {
  it('is recorded (claude-code tool list) for a claude-code result', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'cc_tools:',
        '  - Read',
        '  - Edit',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['claude-code'],
      check: true,
    };

    const summary = await build(config);
    expect(findResult(summary, 'claude-code')!.effectiveTools).toEqual(['Read', 'Edit']);
  });

  it('is undefined when no tools/cc_tools field is present at all', async () => {
    const base = makeTempDir();
    const suite = await createSuite(base, {
      personaYaml: [
        'slug: persona',
        'name: Persona',
        'description: Test.',
        'vs_file_name: persona.agent.md',
        'cc_file_name: persona.md',
      ].join('\n') + '\n',
      contentMd: '# {{name}}\n',
    });

    const config: BuildConfig = {
      suites: { test: { srcDir: suite.srcDir, outVscode: suite.outVscode, outClaudeCode: suite.outClaudeCode } },
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);
    expect(findResult(summary, 'vscode')!.effectiveTools).toBeUndefined();
  });
});
