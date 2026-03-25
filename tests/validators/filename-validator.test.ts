/**
 * tests/validators/filename-validator.test.ts
 *
 * Unit tests for validateFileName() — src/validators/filename-validator.ts
 *
 * Covers:
 *   - Conforming filenames (expect empty ValidationResult[])
 *   - Non-conforming filenames (expect non-empty ValidationResult[])
 *   - Path input (only basename is evaluated)
 *   - Severity is always 'error' for non-conforming cases
 *   - Messages are descriptive and reference the filename
 */

import { describe, it, expect } from 'vitest';
import { validateFileName } from '../../src/validators/filename-validator.js';

// ---------------------------------------------------------------------------
// Conforming filenames — should return []
// ---------------------------------------------------------------------------

describe('validateFileName() — conforming filenames', () => {
  it('returns [] for a simple kebab-case name with extension', () => {
    expect(validateFileName('my-persona.md')).toEqual([]);
  });

  it('returns [] for a single-word lowercase name', () => {
    expect(validateFileName('developer.md')).toEqual([]);
  });

  it('returns [] for a multi-segment kebab-case name', () => {
    expect(validateFileName('1-developer.agent.md')).toEqual([]);
  });

  it('returns [] for a name with digits', () => {
    expect(validateFileName('3-qa-agent.md')).toEqual([]);
  });

  it('returns [] for a name with only digits and hyphens in stem', () => {
    expect(validateFileName('1-2-3.md')).toEqual([]);
  });

  it('returns [] for a name with no extension (bare kebab stem)', () => {
    expect(validateFileName('my-persona')).toEqual([]);
  });

  it('returns [] when passed a full path — only the basename is checked', () => {
    expect(validateFileName('/absolute/path/to/my-persona.md')).toEqual([]);
  });

  it('returns [] when passed a relative path', () => {
    expect(validateFileName('output/vscode/1-developer.agent.md')).toEqual([]);
  });

  it('returns [] for a Windows-style path', () => {
    expect(validateFileName('output\\vscode\\my-persona.md')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Non-conforming filenames — should return non-empty ValidationResult[]
// ---------------------------------------------------------------------------

describe('validateFileName() — non-conforming filenames', () => {
  it('returns non-empty array for a name with uppercase letters', () => {
    const results = validateFileName('MyPersona.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns error severity for an uppercase violation', () => {
    const results = validateFileName('MyPersona.md');
    for (const result of results) {
      expect(result.severity).toBe('error');
    }
  });

  it('error message mentions the offending filename for uppercase violation', () => {
    const results = validateFileName('MyPersona.md');
    const messages = results.map((r) => r.message);
    expect(messages.some((m) => m.includes('MyPersona.md'))).toBe(true);
  });

  it('returns non-empty array for a name with spaces', () => {
    const results = validateFileName('my persona.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns error severity for a space violation', () => {
    const results = validateFileName('my persona.md');
    for (const result of results) {
      expect(result.severity).toBe('error');
    }
  });

  it('error message mentions the offending filename for space violation', () => {
    const results = validateFileName('my persona.md');
    const messages = results.map((r) => r.message);
    expect(messages.some((m) => m.includes('my persona.md'))).toBe(true);
  });

  it('returns non-empty array for a name with special characters (underscore)', () => {
    const results = validateFileName('my_persona.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with special characters (camelCase)', () => {
    const results = validateFileName('myPersona.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with an uppercase extension', () => {
    const results = validateFileName('my-persona.MD');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with multiple violations (uppercase + spaces)', () => {
    const results = validateFileName('My Persona.md');
    // Expect at least two violations — uppercase AND space rules
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns non-empty array when passed a path whose basename is non-conforming', () => {
    const results = validateFileName('/absolute/path/MyPersona.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with a leading hyphen in stem', () => {
    const results = validateFileName('-invalid.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with a trailing hyphen in stem', () => {
    const results = validateFileName('invalid-.md');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns non-empty array for a name with consecutive hyphens', () => {
    const results = validateFileName('my--persona.md');
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Return type shape
// ---------------------------------------------------------------------------

describe('validateFileName() — return value shape', () => {
  it('always returns an array (never null / undefined)', () => {
    expect(Array.isArray(validateFileName('good-name.md'))).toBe(true);
    expect(Array.isArray(validateFileName('BAD NAME.md'))).toBe(true);
  });

  it('each entry has severity and message string fields', () => {
    const results = validateFileName('BAD_NAME.md');
    for (const result of results) {
      expect(typeof result.severity).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
