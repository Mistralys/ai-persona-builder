/**
 * tests/engine/variables.test.ts
 *
 * Unit tests for src/engine/variables.ts — resolveVariables()
 *
 * Covers: string substitution, numeric/boolean coercion, missing variables
 * (warn + preserve), undefined values, empty inputs, multiple markers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveVariables } from '../../src/engine/variables.js';

describe('resolveVariables()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Normal substitution
  // ---------------------------------------------------------------------------

  it('replaces a single variable marker with its string value', () => {
    const result = resolveVariables('Hello {{name}}!', { name: 'World' }, 'test.md');
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple different variable markers', () => {
    const result = resolveVariables(
      '{{greeting}}, {{name}}!',
      { greeting: 'Hi', name: 'Alice' },
      'test.md',
    );
    expect(result).toBe('Hi, Alice!');
  });

  it('replaces the same marker appearing multiple times', () => {
    const result = resolveVariables(
      '{{x}} and {{x}} again',
      { x: 'foo' },
      'test.md',
    );
    expect(result).toBe('foo and foo again');
  });

  // ---------------------------------------------------------------------------
  // Type coercion via String()
  // ---------------------------------------------------------------------------

  it('converts a numeric value to its string representation', () => {
    const result = resolveVariables('version: {{ver}}', { ver: 42 }, 'test.md');
    expect(result).toBe('version: 42');
  });

  it('converts a boolean true to "true"', () => {
    const result = resolveVariables('{{flag}}', { flag: true }, 'test.md');
    expect(result).toBe('true');
  });

  it('converts a boolean false to "false"', () => {
    const result = resolveVariables('{{flag}}', { flag: false }, 'test.md');
    expect(result).toBe('false');
  });

  it('converts a zero to "0"', () => {
    const result = resolveVariables('{{num}}', { num: 0 }, 'test.md');
    expect(result).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // Missing / undefined variables — warn and preserve
  // ---------------------------------------------------------------------------

  it('preserves marker and warns when variable is not in context', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolveVariables('{{missing}}', {}, 'persona.md');
    expect(result).toBe('{{missing}}');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('{{missing}}');
  });

  it('includes the filename in the warning message', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveVariables('{{x}}', {}, 'my-persona.md');
    expect(warnSpy.mock.calls[0][0]).toContain('my-persona.md');
  });

  it('preserves marker and warns when value is explicitly undefined', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolveVariables(
      '{{x}}',
      { x: undefined },
      'test.md',
    );
    expect(result).toBe('{{x}}');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('resolves known variables while preserving unknown ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolveVariables(
      '{{known}} {{unknown}}',
      { known: 'OK' },
      'test.md',
    );
    expect(result).toContain('OK');
    expect(result).toContain('{{unknown}}');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns an empty string unchanged', () => {
    expect(resolveVariables('', {}, 'test.md')).toBe('');
  });

  it('returns text with no markers unchanged', () => {
    const text = 'no markers here';
    expect(resolveVariables(text, { x: 'v' }, 'test.md')).toBe(text);
  });

  it('does not substitute {{> partial}} markers (non-word character after {{)', () => {
    const text = '{{> partial}}';
    const result = resolveVariables(text, {}, 'test.md');
    // The regex /{{(\w+)}}/ does not match {{> partial}} because > is not \w
    expect(result).toBe(text);
  });

  it('does not alter {{#if}} or {{/if}} markers', () => {
    // resolveConditionals should run before resolveVariables in normal usage,
    // but these markers should be left alone by resolveVariables anyway.
    const text = '{{#if flag}}body{{/if}}';
    // resolveVariables only touches {{word}} where word is \w+
    // {{#if}} and {{/if}} contain non-word chars; the regex won't match them
    const result = resolveVariables(text, { flag: 'yes' }, 'test.md');
    expect(result).toBe(text);
  });
});
