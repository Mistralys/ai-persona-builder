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
