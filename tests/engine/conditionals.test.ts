/**
 * tests/engine/conditionals.test.ts
 *
 * Unit tests for src/engine/conditionals.ts — resolveConditionals()
 *
 * Covers: truthy/falsy flags, {{else}} branch, no-else removal, unknown flags,
 * multiline content, empty inputs, nested structure.
 */

import { describe, it, expect } from 'vitest';
import { resolveConditionals } from '../../src/engine/conditionals.js';

describe('resolveConditionals()', () => {
  // ---------------------------------------------------------------------------
  // Basic truthy/falsy resolution
  // ---------------------------------------------------------------------------

  it('keeps {{#if}} content and removes {{else}} content when flag is truthy', () => {
    const text = '{{#if show}}visible{{else}}hidden{{/if}}';
    const result = resolveConditionals(text, { show: true });
    expect(result).toContain('visible');
    expect(result).not.toContain('hidden');
  });

  it('keeps {{else}} content and removes {{#if}} content when flag is falsy', () => {
    const text = '{{#if show}}visible{{else}}hidden{{/if}}';
    const result = resolveConditionals(text, { show: false });
    expect(result).toContain('hidden');
    expect(result).not.toContain('visible');
  });

  it('keeps inner content when flag is truthy and no {{else}} branch exists', () => {
    const text = '{{#if show}}only-content{{/if}}';
    const result = resolveConditionals(text, { show: true });
    expect(result).toContain('only-content');
  });

  it('removes entire block when flag is falsy and no {{else}} branch exists', () => {
    const text = 'before{{#if show}}never-shown{{/if}}after';
    const result = resolveConditionals(text, { show: false });
    expect(result).not.toContain('never-shown');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  // ---------------------------------------------------------------------------
  // Unknown / absent flags
  // ---------------------------------------------------------------------------

  it('treats unknown flag as falsy (removes block when flag absent from context)', () => {
    const text = '{{#if unknownFlag}}should-not-appear{{/if}}';
    const result = resolveConditionals(text, {});
    expect(result).not.toContain('should-not-appear');
  });

  it('treats explicitly falsy values as falsy', () => {
    const text = '{{#if flag}}content{{/if}}';
    expect(resolveConditionals(text, { flag: false })).not.toContain('content');
    expect(resolveConditionals(text, { flag: 0 })).not.toContain('content');
    expect(resolveConditionals(text, { flag: null })).not.toContain('content');
    expect(resolveConditionals(text, { flag: '' })).not.toContain('content');
  });

  it('treats truthy non-boolean values as truthy', () => {
    const text = '{{#if flag}}content{{/if}}';
    expect(resolveConditionals(text, { flag: 1 })).toContain('content');
    expect(resolveConditionals(text, { flag: 'yes' })).toContain('content');
    expect(resolveConditionals(text, { flag: {} })).toContain('content');
  });

  // ---------------------------------------------------------------------------
  // Multiline content
  // ---------------------------------------------------------------------------

  it('handles multiline truthy content correctly', () => {
    const text = '{{#if show}}\nline1\nline2\n{{/if}}';
    const result = resolveConditionals(text, { show: true });
    expect(result).toContain('line1');
    expect(result).toContain('line2');
  });

  it('handles multiline else content correctly', () => {
    const text = '{{#if show}}\ntruthy-line\n{{else}}\nfalsy-line\n{{/if}}';
    const result = resolveConditionals(text, { show: false });
    expect(result).toContain('falsy-line');
    expect(result).not.toContain('truthy-line');
  });

  // ---------------------------------------------------------------------------
  // Multiple blocks in one string
  // ---------------------------------------------------------------------------

  it('resolves multiple independent conditional blocks', () => {
    const text = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}';
    const result = resolveConditionals(text, { a: true, b: false });
    expect(result).toContain('A');
    expect(result).not.toContain('B');
  });

  // ---------------------------------------------------------------------------
  // Nested conditionals (innermost-first resolution)
  // ---------------------------------------------------------------------------

  it('resolves two-level nesting: outer-falsy → inner-truthy', () => {
    // {{#if outer}}VS{{else}}{{#if inner}}DA{{else}}CC{{/if}}{{/if}}
    const text =
      '{{#if outer}}VS{{else}}{{#if inner}}DA{{else}}CC{{/if}}{{/if}}';
    const result = resolveConditionals(text, { outer: false, inner: true });
    expect(result.trim()).toBe('DA');
  });

  it('resolves two-level nesting: outer-falsy → inner-falsy (else-else)', () => {
    const text =
      '{{#if outer}}VS{{else}}{{#if inner}}DA{{else}}CC{{/if}}{{/if}}';
    const result = resolveConditionals(text, { outer: false, inner: false });
    expect(result.trim()).toBe('CC');
  });

  it('resolves two-level nesting: outer-truthy (inner not evaluated)', () => {
    const text =
      '{{#if outer}}VS{{else}}{{#if inner}}DA{{else}}CC{{/if}}{{/if}}';
    const result = resolveConditionals(text, { outer: true, inner: false });
    expect(result.trim()).toBe('VS');
  });

  it('resolves nesting with multiline content across all three branches', () => {
    const text = [
      '{{#if vscode}}',
      'run_subagent()',
      '{{else}}',
      '{{#if deep_agents}}',
      'task(subagent)',
      '{{else}}',
      'Task tool',
      '{{/if}}',
      '{{/if}}',
    ].join('\n');

    const vscodeResult = resolveConditionals(text, { vscode: true });
    expect(vscodeResult).toContain('run_subagent()');
    expect(vscodeResult).not.toContain('task(subagent)');
    expect(vscodeResult).not.toContain('Task tool');

    const daResult = resolveConditionals(text, { deep_agents: true });
    expect(daResult).toContain('task(subagent)');
    expect(daResult).not.toContain('run_subagent()');
    expect(daResult).not.toContain('Task tool');

    const ccResult = resolveConditionals(text, {});
    expect(ccResult).toContain('Task tool');
    expect(ccResult).not.toContain('run_subagent()');
    expect(ccResult).not.toContain('task(subagent)');
  });

  it('preserves whitespace symmetry: nested else output equals flat else output', () => {
    // Nested: {{#if a}}TRUTHY{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}
    // Flat:   {{#if a}}TRUTHY{{else}}C{{/if}}
    // When a=false, b=false → both should return '\nC\n'
    const nested =
      '{{#if a}}TRUTHY{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}';
    const flat = '{{#if a}}TRUTHY{{else}}C{{/if}}';
    const nestedResult = resolveConditionals(nested, { a: false, b: false });
    const flatResult = resolveConditionals(flat, { a: false });
    expect(nestedResult).toBe(flatResult);
  });

  it('resolves three-level nesting across all truth-table combinations', () => {
    const text =
      '{{#if a}}A{{else}}{{#if b}}B{{else}}{{#if c}}C{{else}}D{{/if}}{{/if}}{{/if}}';

    expect(resolveConditionals(text, { a: true }).trim()).toBe('A');
    expect(resolveConditionals(text, { a: false, b: true }).trim()).toBe('B');
    expect(resolveConditionals(text, { a: false, b: false, c: true }).trim()).toBe('C');
    expect(resolveConditionals(text, { a: false, b: false, c: false }).trim()).toBe('D');
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns empty string unchanged', () => {
    expect(resolveConditionals('', {})).toBe('');
  });

  it('returns text with no conditional markers unchanged', () => {
    const text = 'plain text without conditionals';
    expect(resolveConditionals(text, {})).toBe(text);
  });

  it('does not alter {{> partial}} or {{variable}} markers', () => {
    const text = '{{> partial}} and {{variable}}';
    const result = resolveConditionals(text, {});
    expect(result).toBe(text);
  });
});
