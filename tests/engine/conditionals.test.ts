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
  describe('basic truthy/falsy resolution', () => {
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
  });

  describe('unknown / absent flags', () => {
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
  });

  describe('multiline content', () => {
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
  });

  describe('multiple blocks in one string', () => {
    it('resolves multiple independent conditional blocks', () => {
      const text = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}';
      const result = resolveConditionals(text, { a: true, b: false });
      expect(result).toContain('A');
      expect(result).not.toContain('B');
    });
  });

  describe('nested conditionals', () => {
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
  });

  describe('edge cases', () => {
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
});

describe('resolveConditionals() — {{else if}} chains', () => {
  // AC#1: basic truth-table (3 branches)

  it('resolves to truthy branch when first flag is true (a=true, b=true → A)', () => {
    const text = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}';
    expect(resolveConditionals(text, { a: true, b: true }).trim()).toBe('A');
  });

  it('resolves to {{else if}} branch when first flag is false (a=false, b=true → B)', () => {
    const text = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}';
    expect(resolveConditionals(text, { a: false, b: true }).trim()).toBe('B');
  });

  it('resolves to {{else}} branch when all flags are false (a=false, b=false → C)', () => {
    const text = '{{#if a}}A{{else if b}}B{{else}}C{{/if}}';
    expect(resolveConditionals(text, { a: false, b: false }).trim()).toBe('C');
  });

  // AC#2: multi-level chains

  it('resolves multi-level chain to the first truthy branch', () => {
    const text = '{{#if a}}A{{else if b}}B{{else if c}}C{{else if d}}D{{/if}}';
    expect(resolveConditionals(text, { a: true }).trim()).toBe('A');
    expect(resolveConditionals(text, { b: true }).trim()).toBe('B');
    expect(resolveConditionals(text, { c: true }).trim()).toBe('C');
    expect(resolveConditionals(text, { d: true }).trim()).toBe('D');
  });

  it('resolves three-branch chain with final {{else}}', () => {
    const text = '{{#if a}}A{{else if b}}B{{else if c}}C{{else}}D{{/if}}';
    expect(resolveConditionals(text, { a: true }).trim()).toBe('A');
    expect(resolveConditionals(text, { b: true }).trim()).toBe('B');
    expect(resolveConditionals(text, { c: true }).trim()).toBe('C');
    expect(resolveConditionals(text, {}).trim()).toBe('D');
  });

  // AC#3: no final {{else}}, all falsy → block removed

  it('removes block when no final {{else}} and all branches are falsy', () => {
    const text = 'before{{#if a}}A{{else if b}}B{{/if}}after';
    const result = resolveConditionals(text, { a: false, b: false });
    expect(result).not.toContain('A');
    expect(result).not.toContain('B');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  // AC#4: {{else if}} nested inside an outer {{#if}}…{{else}}…{{/if}}

  it('resolves {{else if}} nested inside outer {{#if}}…{{else}}…{{/if}}', () => {
    const text =
      '{{#if outer}}outer-content{{else}}{{#if a}}A{{else if b}}B{{else}}C{{/if}}{{/if}}';

    // outer=true → first branch, inner chain not evaluated
    expect(resolveConditionals(text, { outer: true }).trim()).toBe(
      'outer-content',
    );
    // outer=false, a=false, b=true → B
    expect(
      resolveConditionals(text, { outer: false, a: false, b: true }).trim(),
    ).toBe('B');
    // outer=false, all inner flags false → C
    expect(resolveConditionals(text, { outer: false }).trim()).toBe('C');
  });

  // AC#5: mixed {{else if}} chains and traditional nested {{#if}} blocks

  it('handles mixed {{else if}} and traditional nested {{#if}} in the same template', () => {
    const template = [
      '{{#if a}}A{{else if b}}B{{/if}}',
      '---',
      '{{#if c}}C{{else}}{{#if d}}D{{else}}E{{/if}}{{/if}}',
    ].join('\n');

    const result = resolveConditionals(template, {
      a: false,
      b: true,
      c: false,
      d: false,
    });
    expect(result).toContain('B');
    expect(result).toContain('E');
    expect(result).not.toContain('A');
    expect(result).not.toContain('C');
    expect(result).not.toContain('D');
  });

  // AC#6: multiline content in each branch

  it('preserves multiline content in each branch of an {{else if}} chain', () => {
    const text = [
      '{{#if a}}',
      'line-a1',
      'line-a2',
      '{{else if b}}',
      'line-b1',
      'line-b2',
      '{{else}}',
      'line-c1',
      'line-c2',
      '{{/if}}',
    ].join('\n');

    const aResult = resolveConditionals(text, { a: true });
    expect(aResult).toContain('line-a1');
    expect(aResult).toContain('line-a2');
    expect(aResult).not.toContain('line-b1');
    expect(aResult).not.toContain('line-c1');

    const bResult = resolveConditionals(text, { b: true });
    expect(bResult).toContain('line-b1');
    expect(bResult).toContain('line-b2');
    expect(bResult).not.toContain('line-a1');
    expect(bResult).not.toContain('line-c1');

    const cResult = resolveConditionals(text, {});
    expect(cResult).toContain('line-c1');
    expect(cResult).toContain('line-c2');
    expect(cResult).not.toContain('line-a1');
    expect(cResult).not.toContain('line-b1');
  });

  // Additional: two independent {{else if}} chains in the same template

  it('resolves two independent {{else if}} chains in the same template', () => {
    const text =
      '{{#if a}}A{{else if b}}B{{/if}} and {{#if c}}C{{else if d}}D{{/if}}';
    const result = resolveConditionals(text, { a: false, b: true, c: true });
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).not.toContain('A');
    expect(result).not.toContain('D');
  });
});
