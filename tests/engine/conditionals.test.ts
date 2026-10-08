/**
 * tests/engine/conditionals.test.ts
 *
 * Unit tests for src/engine/conditionals.ts — resolveConditionals()
 *
 * Covers: truthy/falsy flags, {{else}} branch, no-else removal, unknown flags,
 * multiline content, empty inputs, nested structure, the tokenizer's
 * whitespace contract (standalone vs. inline tags, blank-run merging), and
 * literal pass-through of malformed tags.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { resolveConditionals, stripComments } from '../../src/engine/conditionals.js';

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

describe('resolveConditionals() — whitespace contract (tokenizer + block tree)', () => {
  it('keeps blank lines around a truthy block', () => {
    const text = 'Para one.\n\n{{#if a}}\nInside.\n{{/if}}\n\nPara two.';
    expect(resolveConditionals(text, { a: true })).toBe(
      'Para one.\n\nInside.\n\nPara two.',
    );
  });

  it('removed block between paragraphs leaves one paragraph break (no else)', () => {
    const text = 'Para one.\n\n{{#if a}}\nInside.\n{{/if}}\n\nPara two.';
    expect(resolveConditionals(text, { a: false })).toBe(
      'Para one.\n\nPara two.',
    );
  });

  it('keeps blank lines around a chosen else branch', () => {
    const text = 'Para one.\n\n{{#if a}}\nX\n{{else}}\nY\n{{/if}}\n\nPara two.';
    expect(resolveConditionals(text, { a: false })).toBe(
      'Para one.\n\nY\n\nPara two.',
    );
  });

  it('keeps blank lines around a chosen else-if branch', () => {
    const text =
      'Intro:\n\n{{#if a}}\nA\n{{else if b}}\nB\n{{else}}\nC\n{{/if}}\n\nOutro.';
    expect(resolveConditionals(text, { b: true })).toBe(
      'Intro:\n\nB\n\nOutro.',
    );
  });

  it('removed block between paragraphs leaves one paragraph break (all else-if falsy, final else)', () => {
    const text =
      'Intro:\n\n{{#if a}}\nA\n{{else if b}}\nB\n{{/if}}\n\nOutro.';
    expect(resolveConditionals(text, {})).toBe('Intro:\n\nOutro.');
  });

  it('source without blank lines around standalone tags renders without blank lines', () => {
    const text = 'Line one.\n{{#if a}}\nInside.\n{{/if}}\nLine two.';
    expect(resolveConditionals(text, { a: true })).toBe(
      'Line one.\nInside.\nLine two.',
    );
    expect(resolveConditionals(text, { a: false })).toBe(
      'Line one.\nLine two.',
    );
  });

  it('preserves whitespace symmetry: nested else output equals flat else output', () => {
    const nested = '{{#if a}}TRUTHY{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}';
    const flat = '{{#if a}}TRUTHY{{else}}C{{/if}}';
    expect(resolveConditionals(nested, { a: false, b: false })).toBe(
      resolveConditionals(flat, { a: false }),
    );
  });

  it('keeps blank lines inside an outer branch around a nested block', () => {
    const text =
      '{{#if o}}\nRO\n{{else}}\nIntro:\n\n{{#if t}}\nT\n{{/if}}\n\nAfter.\n{{/if}}';
    expect(resolveConditionals(text, { o: false, t: true })).toBe(
      'Intro:\n\nT\n\nAfter.\n',
    );
  });

  it('blank lines at the edges of a kept branch are emitted as written', () => {
    const text = 'A\n\n{{#if a}}\n\nX\n\n{{/if}}\n\nB';
    expect(resolveConditionals(text, { a: true })).toBe('A\n\n\nX\n\n\nB');
  });

  it('the same block emitting nothing merges the outer runs', () => {
    const text = 'A\n\n{{#if a}}\n\nX\n\n{{/if}}\n\nB';
    expect(resolveConditionals(text, { a: false })).toBe('A\n\nB');
  });

  it('inner block emitting nothing inside a kept outer branch merges its surrounding runs', () => {
    const text = '{{#if o}}\nP\n\n{{#if i}}\nI\n{{/if}}\n\nQ\n{{/if}}';
    expect(resolveConditionals(text, { o: true, i: false })).toBe('P\n\nQ\n');
  });

  it('inline conditional stays on its line', () => {
    const text = 'Use the {{#if a}}Task{{else}}task{{/if}} tool.';
    expect(resolveConditionals(text, { a: true })).toBe('Use the Task tool.');
    expect(resolveConditionals(text, { a: false })).toBe('Use the task tool.');
  });

  it('mixed inline/multi-line frontmatter shape renders tight', () => {
    const text = "description: 'd'\n{{#if model}}model: 'm'\n{{/if}}role: r";
    expect(resolveConditionals(text, { model: true })).toBe(
      "description: 'd'\nmodel: 'm'\nrole: r",
    );
    expect(resolveConditionals(text, { model: false })).toBe(
      "description: 'd'\nrole: r",
    );
  });

  it('tight source (table row + list) stays tight whether the block is kept or removed', () => {
    const text = [
      '| A | B |',
      '{{#if show}}',
      '| C | D |',
      '- item one',
      '- item two',
      '{{/if}}',
      '| E | F |',
    ].join('\n');

    expect(resolveConditionals(text, { show: true })).toBe(
      ['| A | B |', '| C | D |', '- item one', '- item two', '| E | F |'].join(
        '\n',
      ),
    );
    expect(resolveConditionals(text, { show: false })).toBe(
      ['| A | B |', '| E | F |'].join('\n'),
    );
  });

  it('standalone tag with surrounding spaces or tabs is removed with its line', () => {
    const text = 'A\n  {{#if a}}  \nInside\n\t{{/if}}\t\nB';
    expect(resolveConditionals(text, { a: true })).toBe('A\nInside\nB');
    expect(resolveConditionals(text, { a: false })).toBe('A\nB');
  });

  it('tag on the last line without a trailing newline keeps the preceding newline', () => {
    const text = 'Before\n{{#if a}}\nInside{{/if}}';
    expect(resolveConditionals(text, { a: true })).toBe('Before\nInside');
  });

  describe('malformed tags pass through literally', () => {
    it('a stray {{/if}} with no opener', () => {
      const text = 'before{{/if}}after';
      expect(resolveConditionals(text, {})).toBe(text);
    });

    it('an unclosed {{#if}} with a balanced inner block that still resolves', () => {
      const text = '{{#if a}}text{{#if b}}B{{/if}}more';
      expect(resolveConditionals(text, { b: true })).toBe(
        '{{#if a}}textBmore',
      );
      expect(resolveConditionals(text, { b: false })).toBe(
        '{{#if a}}textmore',
      );
    });

    it('an {{else}} outside a block', () => {
      const text = 'before{{else}}after';
      expect(resolveConditionals(text, {})).toBe(text);
    });

    it('an {{else if}} outside a block', () => {
      const text = 'before{{else if a}}after';
      expect(resolveConditionals(text, {})).toBe(text);
    });

    it('a second {{else}} in one block is kept as literal text of the final branch', () => {
      const text = '{{#if a}}A{{else}}B{{else}}C{{/if}}';
      expect(resolveConditionals(text, { a: false })).toBe('B{{else}}C');
    });

    it('a flag that does not match \\w+ leaves the tag as is', () => {
      const text = '{{#if a-b}}content{{/if}}';
      expect(resolveConditionals(text, {})).toBe(text);
    });

    it('does not recognise comment delimiters — comment syntax passes through as plain text', () => {
      const text = '{{! note }}X';
      expect(resolveConditionals(text, {})).toBe(text);
      expect(resolveConditionals(text, { note: true })).toBe(text);
    });
  });

  it('has no import statements in the module source', () => {
    const modulePath = fileURLToPath(
      new URL('../../src/engine/conditionals.ts', import.meta.url),
    );
    const source = readFileSync(modulePath, 'utf-8');
    expect(source).not.toMatch(/^\s*import\b/m);
  });
});

describe('adjacent removals', () => {
  it('two adjacent empty blocks between paragraphs leave one paragraph break (blank-separated)', () => {
    const text =
      'A\n\n{{#if a}}\nx\n{{/if}}\n\n{{#if b}}\ny\n{{/if}}\n\nB';
    expect(resolveConditionals(text, {})).toBe('A\n\nB');
  });

  it('two adjacent empty blocks between paragraphs leave one paragraph break (tight)', () => {
    const text = 'A\n\n{{#if a}}\nx\n{{/if}}\n{{#if b}}\ny\n{{/if}}\n\nB';
    expect(resolveConditionals(text, {})).toBe('A\n\nB');
  });

  it('three adjacent empty blocks', () => {
    const text =
      'A\n\n{{#if a}}\nx\n{{/if}}\n\n{{#if b}}\ny\n{{/if}}\n\n{{#if c}}\nz\n{{/if}}\n\nB';
    expect(resolveConditionals(text, {})).toBe('A\n\nB');
  });

  it('adjacent empty blocks in tight source stay tight', () => {
    const text = 'A\n{{#if a}}\nx\n{{/if}}\n{{#if b}}\ny\n{{/if}}\nB';
    expect(resolveConditionals(text, {})).toBe('A\nB');
  });

  it('a kept block between two empty blocks is not merged across', () => {
    const text =
      'A\n\n{{#if a}}\nx\n{{/if}}\n\n{{#if k}}\nK\n{{/if}}\n\n{{#if b}}\ny\n{{/if}}\n\nB';
    expect(resolveConditionals(text, { k: true })).toBe('A\n\nK\n\nB');
  });

  it('adjacent inline removals leave the line as before', () => {
    const text = 'x {{#if a}}y{{/if}}{{#if b}}z{{/if}} w';
    expect(resolveConditionals(text, {})).toBe('x  w');
  });

  it('Known Limitation 16: a literal NUL in source is dropped', () => {
    // The internal EMPTY_BLOCK_MARKER ('\0') and a literal NUL byte in
    // template source are indistinguishable to mergeMarkers() once a real
    // tag elsewhere in the text has caused it to run. A kept {{#if}} branch
    // is used here only to trigger that pass; the NUL sits inside the kept
    // branch's own content and still vanishes silently.
    const text = '{{#if x}}A\0B{{/if}}';
    expect(resolveConditionals(text, { x: true })).toBe('AB');
  });
});

describe('stripComments()', () => {
  it('removes a standalone long-form comment, including a multi-line one that contains }}', () => {
    const text = 'A\n\n{{!-- note\nspanning }} lines --}}\n\nB';
    expect(stripComments(text)).toBe('A\n\nB');
  });

  it('removes an inline short-form comment, leaving the rest of the line intact', () => {
    const text = 'Use {{! short }}this.';
    expect(stripComments(text)).toBe('Use this.');
  });

  it('leaves an {{else}} standalone once a trailing inline comment on its line is removed', () => {
    const text = '{{else}}{{!-- fallback --}}\nX';
    expect(stripComments(text)).toBe('{{else}}\nX');
  });

  it('removes a comment whose content is entirely other template syntax, inert', () => {
    const text = '{{!-- {{> p}} {{#if a}} {{v}} --}}';
    expect(stripComments(text)).toBe('');
  });

  it('leaves conditional tags and all other text untouched', () => {
    const text = 'before{{#if a}}A{{else}}B{{/if}}after {{> partial}} {{variable}}';
    expect(stripComments(text)).toBe(text);
  });

  it('returns text with no comment markers unchanged', () => {
    const text = 'plain text without comments';
    expect(stripComments(text)).toBe(text);
  });

  it('returns empty string unchanged', () => {
    expect(stripComments('')).toBe('');
  });

  it('removes a standalone short-form comment between paragraphs, merging the blank runs', () => {
    const text = 'Para one.\n\n{{! a note }}\n\nPara two.';
    expect(stripComments(text)).toBe('Para one.\n\nPara two.');
  });

  it('removes multiple independent comments in one string', () => {
    const text = '{{! first }}A{{!-- second --}}B';
    expect(stripComments(text)).toBe('AB');
  });

  it('a short-form comment ends at the first }}, even if the note keeps going', () => {
    // Documents the spec's asymmetry: only the long form tolerates a literal `}}`.
    const text = '{{! {{#if a}} }}';
    expect(stripComments(text)).toBe(' }}');
  });

  it('adjacent standalone comments with no blank line between them merge', () => {
    const text = 'A\n\n{{!-- a --}}\n{{!-- b --}}\n\nB';
    expect(stripComments(text)).toBe('A\n\nB');
  });

  it('adjacent standalone comments separated by a blank line merge', () => {
    const text = 'A\n\n{{!-- a --}}\n\n{{!-- b --}}\n\nB';
    expect(stripComments(text)).toBe('A\n\nB');
  });

  it('empty long-form and short-form comment bodies', () => {
    expect(stripComments('A\n{{!----}}\nB')).toBe('A\nB');
    expect(stripComments('A\n{{!}}\nB')).toBe('A\nB');
  });

  it('standalone comment at end of string without trailing newline', () => {
    const text = 'A\n{{!-- c --}}';
    expect(stripComments(text)).toBe('A\n');
  });

  it('a single standalone comment between paragraphs is unchanged', () => {
    const text = 'A\n\n{{!-- c --}}\n\nB';
    expect(stripComments(text)).toBe('A\n\nB');
  });

  describe('malformed / unterminated comments pass through literally', () => {
    it('an unterminated long-form comment (no closing --}})', () => {
      const text = 'before{{!-- never closed';
      expect(stripComments(text)).toBe(text);
    });

    it('an unterminated short-form comment (no closing }})', () => {
      const text = 'before{{! never closed';
      expect(stripComments(text)).toBe(text);
    });
  });
});

describe('line endings', () => {
  describe('stripComments()', () => {
    it('normalises a CRLF standalone comment to the LF result', () => {
      const text = 'A\r\n{{!-- c --}}\r\nB';
      const result = stripComments(text);
      expect(result).toBe('A\nB');
      expect(result).not.toContain('\r');
    });

    it('merges the blank-line run around a CRLF standalone comment', () => {
      const text = 'A\r\n\r\n{{!-- c --}}\r\n\r\nB';
      const result = stripComments(text);
      expect(result).toBe('A\n\nB');
      expect(result).not.toContain('\r');
    });

    it('normalises a lone-CR standalone comment (no LF at all) to the LF result', () => {
      const text = 'A\r{{!-- c --}}\rB';
      const result = stripComments(text);
      expect(result).toBe('A\nB');
      expect(result).not.toContain('\r');
    });
  });

  describe('resolveConditionals()', () => {
    it('removes a falsy CRLF standalone block to the LF result', () => {
      const text = 'A\r\n{{#if x}}\r\ny\r\n{{/if}}\r\nB';
      const result = resolveConditionals(text, {});
      expect(result).toBe('A\nB');
      expect(result).not.toContain('\r');
    });

    it('keeps a truthy CRLF standalone block, converted to the LF result', () => {
      const text = 'A\r\n{{#if x}}\r\ny\r\n{{/if}}\r\nB';
      const result = resolveConditionals(text, { x: true });
      expect(result).toBe('A\ny\nB');
      expect(result).not.toContain('\r');
    });

    it('merges the blank-line run around a falsy CRLF standalone block', () => {
      const text = 'A\r\n\r\n{{#if x}}\r\ny\r\n{{/if}}\r\n\r\nB';
      const result = resolveConditionals(text, {});
      expect(result).toBe('A\n\nB');
      expect(result).not.toContain('\r');
    });

    it('merges two adjacent emits-nothing CRLF blocks into one blank-line run', () => {
      const text =
        'A\r\n\r\n{{#if x}}\r\ny\r\n{{/if}}\r\n\r\n{{#if z}}\r\nq\r\n{{/if}}\r\n\r\nB';
      const result = resolveConditionals(text, {});
      expect(result).toBe('A\n\nB');
      expect(result).not.toContain('\r');
    });

    it('keeps an inline CRLF block on the same line, converted to the LF result', () => {
      const text = 'x {{#if a}}y{{/if}} w\r\nz';
      const result = resolveConditionals(text, {});
      expect(result).toBe('x  w\nz');
      expect(result).not.toContain('\r');
    });

    it('converts CRLF input with no tags to the LF result', () => {
      const text = 'A\r\nB';
      expect(resolveConditionals(text, {})).toBe('A\nB');
      expect(stripComments(text)).toBe('A\nB');
    });
  });
});
