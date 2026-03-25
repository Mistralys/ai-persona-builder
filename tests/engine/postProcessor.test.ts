/**
 * tests/engine/postProcessor.test.ts
 *
 * Unit tests for src/engine/postProcessor.ts
 *
 * Covers: collapseBlankLines, ensureBlankLineBeforeHeadings, normalizeNewlines
 */

import { describe, it, expect } from 'vitest';
import {
  collapseBlankLines,
  ensureBlankLineBeforeHeadings,
  normalizeNewlines,
} from '../../src/engine/postProcessor.js';

// ---------------------------------------------------------------------------
// collapseBlankLines()
// ---------------------------------------------------------------------------

describe('collapseBlankLines()', () => {
  it('collapses 4 consecutive newlines (3 blank lines) into 3 newlines (2 blank lines)', () => {
    const input = 'para1\n\n\n\npara2';
    const result = collapseBlankLines(input);
    expect(result).toBe('para1\n\n\npara2');
  });

  it('collapses 5 or more consecutive newlines into 3 newlines', () => {
    expect(collapseBlankLines('a\n\n\n\n\nb')).toBe('a\n\n\nb');
    expect(collapseBlankLines('a\n\n\n\n\n\n\nb')).toBe('a\n\n\nb');
  });

  it('leaves exactly 3 newlines (2 blank lines) unchanged', () => {
    const input = 'a\n\n\nb';
    expect(collapseBlankLines(input)).toBe(input);
  });

  it('leaves 2 newlines (1 blank line) unchanged', () => {
    const input = 'a\n\nb';
    expect(collapseBlankLines(input)).toBe(input);
  });

  it('leaves 1 newline unchanged', () => {
    const input = 'a\nb';
    expect(collapseBlankLines(input)).toBe(input);
  });

  it('returns an empty string unchanged', () => {
    expect(collapseBlankLines('')).toBe('');
  });

  it('returns text without any newlines unchanged', () => {
    const text = 'no newlines here';
    expect(collapseBlankLines(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// ensureBlankLineBeforeHeadings()
// ---------------------------------------------------------------------------

describe('ensureBlankLineBeforeHeadings()', () => {
  it('inserts a blank line before an h1 heading that directly follows text', () => {
    const input = 'paragraph\n# Heading';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toBe('paragraph\n\n# Heading');
  });

  it('inserts a blank line before an h2 heading', () => {
    const input = 'text\n## Sub-heading';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toBe('text\n\n## Sub-heading');
  });

  it('inserts a blank line before an h6 heading', () => {
    const input = 'text\n###### Deep';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toBe('text\n\n###### Deep');
  });

  it('does not duplicate blank line when one already exists before heading', () => {
    const input = 'text\n\n# Heading';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toBe('text\n\n# Heading');
  });

  it('inserts blank line before horizontal rule directly following text', () => {
    const input = 'text\n---\nnext';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toContain('text\n\n---');
  });

  it('inserts blank line after horizontal rule directly preceding text', () => {
    const input = 'text\n---\nnext';
    const result = ensureBlankLineBeforeHeadings(input);
    expect(result).toContain('---\n\nnext');
  });

  it('returns empty string unchanged', () => {
    expect(ensureBlankLineBeforeHeadings('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalizeNewlines()
// ---------------------------------------------------------------------------

describe('normalizeNewlines()', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeNewlines('hello\r\nworld')).toBe('hello\nworld');
  });

  it('converts mixed CRLF and LF to all LF', () => {
    expect(normalizeNewlines('a\r\nb\nc\r\nd')).toBe('a\nb\nc\nd');
  });

  it('converts standalone CR to LF', () => {
    expect(normalizeNewlines('a\rb')).toBe('a\nb');
  });

  it('leaves already-normalized LF-only text unchanged', () => {
    const text = 'line1\nline2\nline3';
    expect(normalizeNewlines(text)).toBe(text);
  });

  it('returns an empty string unchanged', () => {
    expect(normalizeNewlines('')).toBe('');
  });

  it('handles a string with only newlines', () => {
    expect(normalizeNewlines('\r\n\r\n')).toBe('\n\n');
    expect(normalizeNewlines('\r\r')).toBe('\n\n');
  });
});
