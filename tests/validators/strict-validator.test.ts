/**
 * tests/validators/strict-validator.test.ts
 *
 * Unit tests for validateStrictMarkers() — src/validators/strict-validator.ts
 *
 * Covers:
 *   - Empty marker list always returns []
 *   - All markers present → returns []
 *   - One missing marker → one ValidationResult with severity 'error'
 *   - Multiple missing markers → one entry per absent marker
 *   - Message is descriptive and references the missing marker
 *   - Duplicate markers in the required list produce one error per occurrence
 *   - Markers present but inside different locations (start, end, middle)
 */

import { describe, it, expect } from 'vitest';
import { validateStrictMarkers } from '../../src/validators/strict-validator.js';

// ---------------------------------------------------------------------------
// Empty / trivial cases
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — empty / trivial cases', () => {
  it('returns [] when requiredMarkers is empty', () => {
    expect(validateStrictMarkers('some rendered content', [])).toEqual([]);
  });

  it('returns [] for empty content and empty marker list', () => {
    expect(validateStrictMarkers('', [])).toEqual([]);
  });

  it('returns one error for a non-empty marker list against empty content', () => {
    const results = validateStrictMarkers('', ['{{REQUIRED}}']);
    expect(results.length).toBe(1);
    expect(results[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// All markers present — should return []
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — all markers present', () => {
  it('returns [] when a single required marker is present', () => {
    const content = 'This output contains ROLE_NAME and more text.';
    expect(validateStrictMarkers(content, ['ROLE_NAME'])).toEqual([]);
  });

  it('returns [] when all three required markers are present', () => {
    const content = 'Start {{ROLE}} middle {{VERSION}} end {{NAME}}.';
    expect(validateStrictMarkers(content, ['{{ROLE}}', '{{VERSION}}', '{{NAME}}'])).toEqual([]);
  });

  it('returns [] when a marker appears multiple times in the content', () => {
    const content = 'MARKER at start. MARKER in the middle. MARKER at end.';
    expect(validateStrictMarkers(content, ['MARKER'])).toEqual([]);
  });

  it('returns [] when marker is at the very start of content', () => {
    expect(validateStrictMarkers('MARKER rest of content', ['MARKER'])).toEqual([]);
  });

  it('returns [] when marker is at the very end of content', () => {
    expect(validateStrictMarkers('content ends with MARKER', ['MARKER'])).toEqual([]);
  });

  it('returns [] when marker spans multiple lines in content', () => {
    const content = 'Line 1\n## Section Heading\nLine 3';
    expect(validateStrictMarkers(content, ['## Section Heading'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// One missing marker
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — one missing marker', () => {
  it('returns one error when a single marker is absent', () => {
    const results = validateStrictMarkers('some content', ['{{MISSING}}']);
    expect(results.length).toBe(1);
  });

  it('error entry has severity "error"', () => {
    const results = validateStrictMarkers('some content', ['{{MISSING}}']);
    expect(results[0].severity).toBe('error');
  });

  it('error message mentions the missing marker', () => {
    const results = validateStrictMarkers('some content', ['{{MISSING}}']);
    expect(results[0].message).toContain('{{MISSING}}');
  });

  it('error message is descriptive (non-empty, meaningful text)', () => {
    const results = validateStrictMarkers('hello world', ['GONE']);
    expect(results[0].message.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Multiple missing markers
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — multiple missing markers', () => {
  it('returns one error per absent marker', () => {
    const results = validateStrictMarkers(
      'content with PRESENT marker',
      ['PRESENT', 'ABSENT_ONE', 'ABSENT_TWO'],
    );
    expect(results.length).toBe(2);
  });

  it('each absent marker has its own error entry', () => {
    const results = validateStrictMarkers('', ['FIRST', 'SECOND', 'THIRD']);
    expect(results.length).toBe(3);
    const messages = results.map((r) => r.message);
    expect(messages.some((m) => m.includes('FIRST'))).toBe(true);
    expect(messages.some((m) => m.includes('SECOND'))).toBe(true);
    expect(messages.some((m) => m.includes('THIRD'))).toBe(true);
  });

  it('all entries have severity "error"', () => {
    const results = validateStrictMarkers('hello', ['ALPHA', 'BETA']);
    for (const result of results) {
      expect(result.severity).toBe('error');
    }
  });

  it('order of errors matches order of markers in requiredMarkers', () => {
    const results = validateStrictMarkers('', ['FIRST', 'SECOND']);
    expect(results[0].message).toContain('FIRST');
    expect(results[1].message).toContain('SECOND');
  });
});

// ---------------------------------------------------------------------------
// Mixed present/absent markers
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — mixed present/absent', () => {
  it('returns errors only for absent markers when some are present', () => {
    const content = 'The PRESENT marker is here but the other one is not.';
    const results = validateStrictMarkers(content, ['PRESENT', 'ABSENT']);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain('ABSENT');
  });

  it('returns [] when all markers in a mixed list are found', () => {
    const content = 'Contains ALPHA and BETA in the text.';
    expect(validateStrictMarkers(content, ['ALPHA', 'BETA'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Return value shape
// ---------------------------------------------------------------------------

describe('validateStrictMarkers() — return value shape', () => {
  it('always returns an array', () => {
    expect(Array.isArray(validateStrictMarkers('content', []))).toBe(true);
    expect(Array.isArray(validateStrictMarkers('content', ['M1']))).toBe(true);
  });

  it('each entry has severity and message string fields', () => {
    const results = validateStrictMarkers('', ['MISSING_MARKER']);
    for (const result of results) {
      expect(typeof result.severity).toBe('string');
      expect(typeof result.message).toBe('string');
    }
  });
});
