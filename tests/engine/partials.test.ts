/**
 * tests/engine/partials.test.ts
 *
 * Unit tests for src/engine/partials.ts — resolvePartials()
 *
 * Covers: normal resolution, nested partials (depth 1), depth limit (>= 2),
 * missing partials (warn + preserve marker), empty inputs, multiple markers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolvePartials } from '../../src/engine/partials.js';

describe('resolvePartials()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Normal resolution
  // ---------------------------------------------------------------------------

  it('resolves a single partial marker', () => {
    const result = resolvePartials('{{> greeting}}', { greeting: 'Hello World' });
    expect(result).toBe('Hello World');
  });

  it('resolves multiple partial markers in one string', () => {
    const partials = { a: 'AAA', b: 'BBB' };
    const result = resolvePartials('{{> a}} and {{> b}}', partials);
    expect(result).toBe('AAA and BBB');
  });

  it('preserves surrounding text when resolving a partial', () => {
    const result = resolvePartials('before {{> greet}} after', { greet: 'HI' });
    expect(result).toBe('before HI after');
  });

  it('trims trailing whitespace from resolved partial content', () => {
    const result = resolvePartials('{{> block}}', { block: 'content  \n  ' });
    expect(result).toBe('content');
  });

  // ---------------------------------------------------------------------------
  // Nested partials (depth recursion)
  // ---------------------------------------------------------------------------

  it('resolves nested partials (depth 1 recursion)', () => {
    const partials = {
      outer: 'start {{> inner}} end',
      inner: 'INNER',
    };
    const result = resolvePartials('{{> outer}}', partials);
    expect(result).toBe('start INNER end');
  });

  it('stops recursion at depth 2 — leaves marker as-is for depth-3 chain', () => {
    // 3-level chain: root → a → b → c (c cannot be resolved at depth 2)
    const partials = { a: '{{> b}}', b: '{{> c}}', c: 'deep' };
    const result = resolvePartials('{{> a}}', partials);
    // At depth 2, {{> c}} is returned as-is (depth limit hit)
    expect(result).toBe('{{> c}}');
  });

  /**
   * CONSTRAINT: The nesting depth cap is fixed at 2 and is NOT configurable.
   *
   * Decision (2026-04-14): Evaluated making the cap configurable via a
   * `maxPartialDepth` option in BuildConfig. Decision: no change. Depth 2
   * supports the full "outer → inner → innermost" chain, which covers all
   * practical persona template patterns. Raising or making the cap configurable
   * adds API surface and complexity with no demonstrated need.
   *
   * This test documents the constraint explicitly. If you need to change the
   * depth cap in the future, this test is the contract to update first.
   */
  it('depth-2 cap is a fixed constraint — 2-level nesting resolves fully, 3-level leaves deepest marker', () => {
    // 2-level nesting resolves completely (depth 0 → 1 → 2: stops before resolving c)
    const two = { outer: '{{> inner}}', inner: 'resolved' };
    expect(resolvePartials('{{> outer}}', two)).toBe('resolved');

    // 3-level nesting: the third-level marker is left unresolved
    const three = { a: '{{> b}}', b: '{{> c}}', c: 'deep' };
    expect(resolvePartials('{{> a}}', three)).toBe('{{> c}}');
  });

  // ---------------------------------------------------------------------------
  // Missing partials
  // ---------------------------------------------------------------------------

  it('preserves the marker and warns when partial is not found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolvePartials('{{> missing}}', {});
    expect(result).toBe('{{> missing}}');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('{{> missing}}');
  });

  it('resolves known partials while preserving unknown ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = resolvePartials('{{> known}} {{> unknown}}', { known: 'OK' });
    expect(result).toContain('OK');
    expect(result).toContain('{{> unknown}}');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns an empty string unchanged', () => {
    expect(resolvePartials('', {})).toBe('');
  });

  it('returns text with no markers unchanged', () => {
    const text = 'no markers here';
    expect(resolvePartials(text, {})).toBe(text);
  });

  it('resolves a partial whose name contains a hyphen', () => {
    const result = resolvePartials('{{> my-block}}', { 'my-block': 'hyphen content' });
    expect(result).toBe('hyphen content');
  });

  it('does not resolve {{#if}} or {{variable}} as partials', () => {
    const text = '{{#if flag}}body{{/if}} {{variable}}';
    const result = resolvePartials(text, { flag: 'true', variable: 'val' });
    // Only {{> name}} markers should be touched
    expect(result).toBe(text);
  });
});
