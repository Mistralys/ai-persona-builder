/**
 * tests/utils/changelog.test.ts
 *
 * Unit tests for src/utils/changelog.ts — resolveChangelogMeta()
 *
 * Covers: well-formed input (with date), version-only input, multi-line
 * changelogs, empty/non-string/unparseable input, and whitespace/CRLF edge cases.
 */

import { describe, it, expect } from 'vitest';
import { resolveChangelogMeta } from '../../src/utils/changelog.js';

// ---------------------------------------------------------------------------
// Well-formed input — version with date
// ---------------------------------------------------------------------------

describe('resolveChangelogMeta() — version with date', () => {
  it('extracts version and date from a standard entry', () => {
    const result = resolveChangelogMeta('1.5.0 (2026-06-13): Added feature');
    expect(result).toEqual({ version: '1.5.0', date: '2026-06-13' });
  });

  it('handles version with no space before parenthesis', () => {
    const result = resolveChangelogMeta('2.0.0(2025-01-01): Breaking change');
    expect(result).toEqual({ version: '2.0.0', date: '2025-01-01' });
  });

  it('handles extra whitespace between version and parenthesis', () => {
    const result = resolveChangelogMeta('1.2.3   (2024-12-31): Some note');
    expect(result).toEqual({ version: '1.2.3', date: '2024-12-31' });
  });

  it('handles extra whitespace between closing parenthesis and colon', () => {
    const result = resolveChangelogMeta('1.0.0 (2023-07-04)   : Initial release');
    expect(result).toEqual({ version: '1.0.0', date: '2023-07-04' });
  });

  it('handles trailing whitespace after the colon', () => {
    const result = resolveChangelogMeta('1.0.1 (2023-08-01):   Fixed bug');
    expect(result).toEqual({ version: '1.0.1', date: '2023-08-01' });
  });

  it('handles patch version 0.0.1', () => {
    const result = resolveChangelogMeta('0.0.1 (2020-01-01): First prerelease');
    expect(result).toEqual({ version: '0.0.1', date: '2020-01-01' });
  });
});

// ---------------------------------------------------------------------------
// Version-only input (no date)
// ---------------------------------------------------------------------------

describe('resolveChangelogMeta() — version only (no date)', () => {
  it('returns empty date string for version-only entry', () => {
    const result = resolveChangelogMeta('1.5.0: Added feature');
    expect(result).toEqual({ version: '1.5.0', date: '' });
  });

  it('handles extra whitespace before colon', () => {
    const result = resolveChangelogMeta('3.0.0   : Major rewrite');
    expect(result).toEqual({ version: '3.0.0', date: '' });
  });
});

// ---------------------------------------------------------------------------
// Multi-line changelog
// ---------------------------------------------------------------------------

describe('resolveChangelogMeta() — multi-line changelog', () => {
  it('extracts the first entry when multiple lines are present', () => {
    const changelog = `1.5.0 (2026-06-13): Added feature
- Bullet point one
- Bullet point two

1.4.0 (2026-05-01): Previous release
- Old feature`;
    const result = resolveChangelogMeta(changelog);
    expect(result).toEqual({ version: '1.5.0', date: '2026-06-13' });
  });

  it('handles multi-line input with version-only first line', () => {
    const changelog = `2.1.0: New minor version
- Item A
- Item B

2.0.0 (2026-01-01): Major release`;
    const result = resolveChangelogMeta(changelog);
    expect(result).toEqual({ version: '2.1.0', date: '' });
  });

  it('handles CRLF line endings (Windows)', () => {
    const changelog = '1.3.0 (2025-03-15): Windows entry\r\n- Some change\r\n1.2.0: Older';
    const result = resolveChangelogMeta(changelog);
    expect(result).toEqual({ version: '1.3.0', date: '2025-03-15' });
  });

  it('handles leading blank lines before the first version entry', () => {
    const changelog = '\n\n1.0.0 (2024-04-01): After blank lines';
    const result = resolveChangelogMeta(changelog);
    expect(result).toEqual({ version: '1.0.0', date: '2024-04-01' });
  });

  it('falls back to the first matching line even if a later line has a date', () => {
    const changelog = `1.0.0: No date here
1.1.0 (2026-01-01): Has date`;
    const result = resolveChangelogMeta(changelog);
    expect(result).toEqual({ version: '1.0.0', date: '' });
  });
});

// ---------------------------------------------------------------------------
// Invalid / unparseable input — must return undefined
// ---------------------------------------------------------------------------

describe('resolveChangelogMeta() — undefined for invalid input', () => {
  it('returns undefined for undefined', () => {
    expect(resolveChangelogMeta(undefined)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(resolveChangelogMeta(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(resolveChangelogMeta('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(resolveChangelogMeta('   ')).toBeUndefined();
  });

  it('returns undefined for a number', () => {
    expect(resolveChangelogMeta(42)).toBeUndefined();
  });

  it('returns undefined for a boolean', () => {
    expect(resolveChangelogMeta(true)).toBeUndefined();
  });

  it('returns undefined for an object', () => {
    expect(resolveChangelogMeta({ version: '1.0.0' })).toBeUndefined();
  });

  it('returns undefined for an array', () => {
    expect(resolveChangelogMeta(['1.0.0'])).toBeUndefined();
  });

  it('returns undefined for plain prose with no version', () => {
    expect(resolveChangelogMeta('no version here')).toBeUndefined();
  });

  it('returns undefined for a version number without a colon', () => {
    expect(resolveChangelogMeta('1.5.0 Added feature')).toBeUndefined();
  });

  it('returns undefined for a pre-release version (out of scope)', () => {
    // Pre-release suffixes like -alpha, -beta are explicitly out of scope
    expect(resolveChangelogMeta('1.5.0-alpha: Added feature')).toBeUndefined();
  });

  it('returns undefined for a version with only two components', () => {
    expect(resolveChangelogMeta('1.5: Added feature')).toBeUndefined();
  });
});
