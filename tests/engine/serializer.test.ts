/**
 * tests/engine/serializer.test.ts
 *
 * Unit tests for src/engine/serializer.ts
 *
 * Covers: serializeTools (with outer brackets), serializeToolsList (without
 * outer brackets), single element, multiple elements, empty arrays.
 */

import { describe, it, expect } from 'vitest';
import { serializeTools, serializeToolsList } from '../../src/engine/serializer.js';

// ---------------------------------------------------------------------------
// serializeTools()
// ---------------------------------------------------------------------------

describe('serializeTools()', () => {
  it('serializes a single tool with outer brackets', () => {
    expect(serializeTools(['Bash'])).toBe("['Bash']");
  });

  it('serializes multiple tools with outer brackets', () => {
    expect(serializeTools(['Bash', 'Read'])).toBe("['Bash', 'Read']");
  });

  it('serializes three or more tools', () => {
    expect(serializeTools(['Bash', 'Read', 'Edit', 'Write'])).toBe(
      "['Bash', 'Read', 'Edit', 'Write']",
    );
  });

  it('serializes an empty array to "[]"', () => {
    expect(serializeTools([])).toBe('[]');
  });

  it('wraps each tool name in single quotes', () => {
    const result = serializeTools(['MyTool']);
    expect(result).toContain("'MyTool'");
  });

  it('separates tools with ", " (comma space)', () => {
    const result = serializeTools(['A', 'B']);
    expect(result).toBe("['A', 'B']");
  });
});

// ---------------------------------------------------------------------------
// serializeToolsList()
// ---------------------------------------------------------------------------

describe('serializeToolsList()', () => {
  it('serializes a single tool without outer brackets', () => {
    expect(serializeToolsList(['Bash'])).toBe("'Bash'");
  });

  it('serializes multiple tools without outer brackets', () => {
    expect(serializeToolsList(['Bash', 'Read'])).toBe("'Bash', 'Read'");
  });

  it('serializes three or more tools without outer brackets', () => {
    expect(serializeToolsList(['Bash', 'Read', 'Edit', 'Write'])).toBe(
      "'Bash', 'Read', 'Edit', 'Write'",
    );
  });

  it('serializes an empty array to an empty string', () => {
    expect(serializeToolsList([])).toBe('');
  });

  it('does not include square brackets', () => {
    const result = serializeToolsList(['Tool']);
    expect(result).not.toContain('[');
    expect(result).not.toContain(']');
  });

  it('separates tools with ", " (comma space)', () => {
    const result = serializeToolsList(['A', 'B']);
    expect(result).toBe("'A', 'B'");
  });
});

// ---------------------------------------------------------------------------
// Relationship between the two functions
// ---------------------------------------------------------------------------

describe('serializeTools vs serializeToolsList', () => {
  it('serializeTools wraps serializeToolsList result in brackets', () => {
    const tools = ['X', 'Y', 'Z'];
    const withBrackets = serializeTools(tools);
    const withoutBrackets = serializeToolsList(tools);
    expect(withBrackets).toBe('[' + withoutBrackets + ']');
  });

  it('both produce same single-tool content, differing only in outer brackets', () => {
    const tools = ['OneTool'];
    expect(serializeTools(tools)).toBe("['OneTool']");
    expect(serializeToolsList(tools)).toBe("'OneTool'");
  });
});
