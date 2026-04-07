/**
 * tests/plugins/plugin-runner.test.ts
 *
 * Unit tests for the plugin runner — src/plugins/runner.ts
 *
 * Covers all four hook functions (runSuiteInit, runBuildContext,
 * runPostRender, runValidate) with three plugin-count scenarios:
 *   - 0 plugins: runner handles empty list gracefully
 *   - 1 plugin: single hook invocation works correctly
 *   - 3 plugins: hooks are invoked in registration order and
 *                context/output accumulation across plugins is verified
 *
 * Also covers edge cases: plugins without the relevant hook are skipped,
 * and hook chaining is correct (each plugin receives previous plugin's output).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runSuiteInit,
  runBuildContext,
  runPostRender,
  runValidate,
} from '../../src/plugins/runner.js';
import type {
  PersonaBuildPlugin,
  PersonaMetadata,
  SuiteConfig,
  ValidationResult,
} from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal SuiteConfig for testing purposes */
const suite: SuiteConfig = {
  srcDir: '/fixtures/sample-suite',
  outVscode: '/out/vscode',
  outClaudeCode: '/out/claude-code',
};

/** Minimal PersonaMetadata for testing purposes */
const persona: PersonaMetadata = {
  name: 'test-persona',
  displayName: 'Test Persona',
  version: '1.0.0',
};

// ---------------------------------------------------------------------------
// runSuiteInit
// ---------------------------------------------------------------------------

describe('runSuiteInit()', () => {
  // 0-plugin scenario
  it('does nothing when the plugin list is empty', () => {
    const sharedMeta: Record<string, unknown> = { key: 'original' };
    // Should not throw and should leave sharedMeta unchanged
    expect(() => runSuiteInit([], suite, sharedMeta)).not.toThrow();
    expect(sharedMeta.key).toBe('original');
  });

  // 1-plugin scenario
  it('calls onSuiteInit on a single plugin', () => {
    const onSuiteInit = vi.fn();
    const plugin: PersonaBuildPlugin = { name: 'plugin-a', onSuiteInit };
    const sharedMeta: Record<string, unknown> = {};
    runSuiteInit([plugin], suite, sharedMeta);
    expect(onSuiteInit).toHaveBeenCalledOnce();
    expect(onSuiteInit).toHaveBeenCalledWith(suite, sharedMeta);
  });

  // 1-plugin: mutation
  it('allows a plugin to mutate sharedMeta', () => {
    const plugin: PersonaBuildPlugin = {
      name: 'mutator',
      onSuiteInit(_, meta) {
        meta['injected'] = 'hello';
      },
    };
    const sharedMeta: Record<string, unknown> = {};
    runSuiteInit([plugin], suite, sharedMeta);
    expect(sharedMeta['injected']).toBe('hello');
  });

  // 3-plugin scenario: invocation order
  it('calls onSuiteInit on 3 plugins in registration order', () => {
    const callOrder: string[] = [];
    const makePlugin = (name: string): PersonaBuildPlugin => ({
      name,
      onSuiteInit() {
        callOrder.push(name);
      },
    });
    const plugins = [makePlugin('first'), makePlugin('second'), makePlugin('third')];
    runSuiteInit(plugins, suite, {});
    expect(callOrder).toEqual(['first', 'second', 'third']);
  });

  // 3-plugin scenario: mutation accumulates
  it('passes the same sharedMeta reference to all plugins — mutations accumulate', () => {
    const plugins: PersonaBuildPlugin[] = [
      {
        name: 'p1',
        onSuiteInit(_, meta) {
          meta['p1'] = true;
        },
      },
      {
        name: 'p2',
        onSuiteInit(_, meta) {
          meta['p2'] = true;
        },
      },
      {
        name: 'p3',
        onSuiteInit(_, meta) {
          meta['p3'] = true;
        },
      },
    ];
    const sharedMeta: Record<string, unknown> = {};
    runSuiteInit(plugins, suite, sharedMeta);
    expect(sharedMeta).toEqual({ p1: true, p2: true, p3: true });
  });

  // Skips plugin without the hook
  it('skips plugins that do not implement onSuiteInit', () => {
    const onSuiteInit = vi.fn();
    const plugins: PersonaBuildPlugin[] = [
      { name: 'no-hook' },
      { name: 'with-hook', onSuiteInit },
      { name: 'also-no-hook' },
    ];
    runSuiteInit(plugins, suite, {});
    expect(onSuiteInit).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// runBuildContext
// ---------------------------------------------------------------------------

describe('runBuildContext()', () => {
  // 0-plugin scenario
  it('returns the initial context unchanged when the plugin list is empty', () => {
    const initial = { foo: 'bar' };
    const result = runBuildContext([], initial, persona, suite);
    expect(result).toEqual({ foo: 'bar' });
  });

  // 1-plugin scenario
  it('calls onBuildContext on a single plugin and returns its result', () => {
    const plugin: PersonaBuildPlugin = {
      name: 'ctx-plugin',
      onBuildContext(ctx) {
        return { ...ctx, added: 'value' };
      },
    };
    const result = runBuildContext([plugin], { base: 1 }, persona, suite);
    expect(result).toEqual({ base: 1, added: 'value' });
  });

  // 1-plugin: receives correct arguments
  it('passes context, persona, and suite to the plugin hook', () => {
    const onBuildContext = vi.fn((ctx: Record<string, unknown>) => ctx);
    const plugin: PersonaBuildPlugin = { name: 'arg-check', onBuildContext };
    const ctx = { x: 1 };
    runBuildContext([plugin], ctx, persona, suite);
    expect(onBuildContext).toHaveBeenCalledWith(ctx, persona, suite, undefined);
  });

  // 3-plugin scenario: each plugin receives previous output
  it('accumulates context across 3 plugins — each receives the previous plugin\'s output', () => {
    const plugins: PersonaBuildPlugin[] = [
      {
        name: 'p1',
        onBuildContext(ctx) {
          return { ...ctx, step1: 'done' };
        },
      },
      {
        name: 'p2',
        onBuildContext(ctx) {
          // ctx at this point must include step1 from p1
          return { ...ctx, step2: typeof ctx['step1'] === 'string' ? 'has-step1' : 'missing-step1' };
        },
      },
      {
        name: 'p3',
        onBuildContext(ctx) {
          // ctx must include both step1 and step2
          const hasBoth = typeof ctx['step1'] === 'string' && typeof ctx['step2'] === 'string';
          return { ...ctx, step3: hasBoth ? 'has-both' : 'missing' };
        },
      },
    ];
    const result = runBuildContext(plugins, {}, persona, suite);
    expect(result['step1']).toBe('done');
    expect(result['step2']).toBe('has-step1');
    expect(result['step3']).toBe('has-both');
  });

  // 3-plugin scenario: invocation order verified
  it('invokes onBuildContext on 3 plugins in registration order', () => {
    const callOrder: string[] = [];
    const makePlugin = (name: string): PersonaBuildPlugin => ({
      name,
      onBuildContext(ctx) {
        callOrder.push(name);
        return ctx;
      },
    });
    runBuildContext(
      [makePlugin('first'), makePlugin('second'), makePlugin('third')],
      {},
      persona,
      suite,
    );
    expect(callOrder).toEqual(['first', 'second', 'third']);
  });

  // Skips plugin without the hook
  it('skips plugins that do not implement onBuildContext', () => {
    const plugins: PersonaBuildPlugin[] = [
      { name: 'no-hook' },
      {
        name: 'with-hook',
        onBuildContext(ctx) {
          return { ...ctx, touched: true };
        },
      },
      { name: 'also-no-hook' },
    ];
    const result = runBuildContext(plugins, { original: true }, persona, suite);
    expect(result).toEqual({ original: true, touched: true });
  });
});

// ---------------------------------------------------------------------------
// runPostRender
// ---------------------------------------------------------------------------

describe('runPostRender()', () => {
  // 0-plugin scenario
  it('returns the initial rendered string unchanged when the plugin list is empty', () => {
    const result = runPostRender([], 'original content', persona, 'vscode');
    expect(result).toBe('original content');
  });

  // 1-plugin scenario
  it('calls onPostRender on a single plugin and returns its result', () => {
    const plugin: PersonaBuildPlugin = {
      name: 'render-plugin',
      onPostRender(output) {
        return output + '\n<!-- rendered -->';
      },
    };
    const result = runPostRender([plugin], 'body', persona, 'vscode');
    expect(result).toBe('body\n<!-- rendered -->');
  });

  // 1-plugin: receives correct arguments
  it('passes output, persona, and target to the plugin hook', () => {
    const onPostRender = vi.fn((output: string) => output);
    const plugin: PersonaBuildPlugin = { name: 'arg-check', onPostRender };
    runPostRender([plugin], 'text', persona, 'claude-code');
    expect(onPostRender).toHaveBeenCalledWith('text', persona, 'claude-code');
  });

  // 3-plugin scenario: chaining — each plugin receives previous output
  it('chains output across 3 plugins — each plugin receives the previous plugin\'s return value', () => {
    const plugins: PersonaBuildPlugin[] = [
      {
        name: 'p1',
        onPostRender(output) {
          return output + '[p1]';
        },
      },
      {
        name: 'p2',
        onPostRender(output) {
          return output + '[p2]';
        },
      },
      {
        name: 'p3',
        onPostRender(output) {
          return output + '[p3]';
        },
      },
    ];
    const result = runPostRender(plugins, 'start', persona, 'vscode');
    expect(result).toBe('start[p1][p2][p3]');
  });

  // 3-plugin scenario: invocation order verified
  it('invokes onPostRender on 3 plugins in registration order', () => {
    const callOrder: string[] = [];
    const makePlugin = (name: string): PersonaBuildPlugin => ({
      name,
      onPostRender(output) {
        callOrder.push(name);
        return output;
      },
    });
    runPostRender(
      [makePlugin('first'), makePlugin('second'), makePlugin('third')],
      '',
      persona,
      'vscode',
    );
    expect(callOrder).toEqual(['first', 'second', 'third']);
  });

  // Skips plugin without the hook
  it('skips plugins that do not implement onPostRender', () => {
    const plugins: PersonaBuildPlugin[] = [
      { name: 'no-hook' },
      {
        name: 'with-hook',
        onPostRender(output) {
          return output + '[touched]';
        },
      },
      { name: 'also-no-hook' },
    ];
    const result = runPostRender(plugins, 'base', persona, 'vscode');
    expect(result).toBe('base[touched]');
  });

  // Target is passed through to each plugin
  it('passes the target type to every plugin', () => {
    const targets: string[] = [];
    const plugin: PersonaBuildPlugin = {
      name: 'target-capture',
      onPostRender(output, _p, target) {
        targets.push(target);
        return output;
      },
    };
    runPostRender([plugin, plugin], 'x', persona, 'claude-code');
    expect(targets).toEqual(['claude-code', 'claude-code']);
  });
});

// ---------------------------------------------------------------------------
// runValidate
// ---------------------------------------------------------------------------

describe('runValidate()', () => {
  // 0-plugin scenario
  it('returns an empty array when the plugin list is empty', () => {
    const result = runValidate([], persona, suite);
    expect(result).toEqual([]);
  });

  // 1-plugin scenario: returns results
  it('returns validation results from a single plugin', () => {
    const expected: ValidationResult[] = [
      { severity: 'error', message: 'Missing required field' },
    ];
    const plugin: PersonaBuildPlugin = {
      name: 'validator',
      onValidate() {
        return expected;
      },
    };
    const result = runValidate([plugin], persona, suite);
    expect(result).toEqual(expected);
  });

  // 1-plugin scenario: receives correct arguments
  it('passes persona, suite, and target to the plugin hook', () => {
    const onValidate = vi.fn(() => [] as ValidationResult[]);
    const plugin: PersonaBuildPlugin = { name: 'arg-check', onValidate };
    runValidate([plugin], persona, suite, 'vscode');
    expect(onValidate).toHaveBeenCalledWith(persona, suite, 'vscode');
  });

  // 1-plugin scenario: target is forwarded as undefined when not supplied
  it('forwards undefined target when no target argument is provided', () => {
    const onValidate = vi.fn(() => [] as ValidationResult[]);
    const plugin: PersonaBuildPlugin = { name: 'no-target', onValidate };
    runValidate([plugin], persona, suite);
    expect(onValidate).toHaveBeenCalledWith(persona, suite, undefined);
  });

  // 1-plugin: returns empty array from plugin
  it('returns empty array when plugin\'s onValidate returns []', () => {
    const plugin: PersonaBuildPlugin = {
      name: 'no-issues',
      onValidate() {
        return [];
      },
    };
    expect(runValidate([plugin], persona, suite)).toEqual([]);
  });

  // 3-plugin scenario: flattens results from all plugins
  it('collects and flattens ValidationResult from 3 plugins', () => {
    const plugins: PersonaBuildPlugin[] = [
      {
        name: 'p1',
        onValidate() {
          return [{ severity: 'error', message: 'P1 error' }];
        },
      },
      {
        name: 'p2',
        onValidate() {
          return [
            { severity: 'warning', message: 'P2 warning' },
            { severity: 'info', message: 'P2 info' },
          ];
        },
      },
      {
        name: 'p3',
        onValidate() {
          return [{ severity: 'error', message: 'P3 error' }];
        },
      },
    ];
    const result = runValidate(plugins, persona, suite);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ severity: 'error', message: 'P1 error' });
    expect(result[1]).toEqual({ severity: 'warning', message: 'P2 warning' });
    expect(result[2]).toEqual({ severity: 'info', message: 'P2 info' });
    expect(result[3]).toEqual({ severity: 'error', message: 'P3 error' });
  });

  // 3-plugin scenario: invocation order verified
  it('invokes onValidate on 3 plugins in registration order', () => {
    const callOrder: string[] = [];
    const makePlugin = (name: string): PersonaBuildPlugin => ({
      name,
      onValidate() {
        callOrder.push(name);
        return [];
      },
    });
    runValidate([makePlugin('first'), makePlugin('second'), makePlugin('third')], persona, suite);
    expect(callOrder).toEqual(['first', 'second', 'third']);
  });

  // 3-plugin scenario: mixed — some with hook, some without
  it('skips plugins that do not implement onValidate and collects from the rest', () => {
    const plugins: PersonaBuildPlugin[] = [
      { name: 'no-validate-1' },
      {
        name: 'validator',
        onValidate() {
          return [{ severity: 'warning', message: 'check this' }];
        },
      },
      { name: 'no-validate-2' },
    ];
    const result = runValidate(plugins, persona, suite);
    expect(result).toEqual([{ severity: 'warning', message: 'check this' }]);
  });

  // All 3 severities are preserved
  it('preserves all severity levels (error, warning, info)', () => {
    const plugin: PersonaBuildPlugin = {
      name: 'all-severities',
      onValidate() {
        return [
          { severity: 'error', message: 'an error' },
          { severity: 'warning', message: 'a warning' },
          { severity: 'info', message: 'an info' },
        ];
      },
    };
    const result = runValidate([plugin], persona, suite);
    const severities = result.map((r) => r.severity);
    expect(severities).toContain('error');
    expect(severities).toContain('warning');
    expect(severities).toContain('info');
  });
});
