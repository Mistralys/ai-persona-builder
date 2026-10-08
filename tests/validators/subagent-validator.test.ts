/**
 * tests/validators/subagent-validator.test.ts
 *
 * Unit tests for validateSubagentRefs() in src/validators/subagent-validator.ts.
 *
 * Covers:
 *   - Unknown-slug check: keyed on agentMap, skip-on-empty preserved
 *   - Target-aware check: runs only when both index and target are supplied;
 *     flags a slug that exists but isn't built for the target
 *   - A slug absent from the index is left to the unknown-slug check
 *   - Both checks can fire independently for the same slug
 */

import { describe, it, expect } from 'vitest';

import { validateSubagentRefs } from '../../src/validators/subagent-validator.js';
import type { PersonaMetadata } from '../../src/plugins/types.js';
import type { PersonaIndex, PersonaIndexEntry } from '../../src/builders/persona-index.js';

function makeEntry(overrides: Partial<PersonaIndexEntry> & { slug: string }): PersonaIndexEntry {
  return {
    suite: 'main',
    yamlPath: `/suites/main/meta/${overrides.slug}.yaml`,
    slug: overrides.slug,
    name: overrides.slug,
    version: '1.0.0',
    targets: ['vscode', 'claude-code'],
    toolParityExceptions: [],
    ...overrides,
  };
}

function makeIndex(entries: PersonaIndexEntry[]): PersonaIndex {
  const bySlug = new Map<string, PersonaIndexEntry>();
  for (const entry of entries) bySlug.set(entry.slug, entry);
  return { entries, bySlug, issues: [] };
}

function makePersona(subagents?: string[]): PersonaMetadata {
  return { name: 'Main Persona', ...(subagents !== undefined ? { subagents } : {}) };
}

describe('validateSubagentRefs — unknown-slug check', () => {
  it('passes silently with no subagents field', () => {
    expect(validateSubagentRefs(makePersona(), {})).toEqual([]);
  });

  it('passes silently with an empty subagents array', () => {
    expect(validateSubagentRefs(makePersona([]), {})).toEqual([]);
  });

  it('errors on an unknown slug (non-empty agentMap lacking the key)', () => {
    const results = validateSubagentRefs(makePersona(['ghost']), { agent_slug_other: 'other' });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('error');
    expect(results[0]!.message).toContain('ghost');
  });

  it('passes silently when the slug key exists in agentMap', () => {
    const results = validateSubagentRefs(makePersona(['helper']), { agent_slug_helper: 'helper' });
    expect(results).toEqual([]);
  });

  it('skip-on-empty is preserved: an empty agentMap does not flag a declared slug', () => {
    // An agentMap with zero entries (the default `{}`) is treated as "no
    // cross-suite agent data was computed for this call" — the unknown-slug
    // check is skipped entirely, not evaluated-and-always-failing.
    const results = validateSubagentRefs(makePersona(['helper']), {});
    expect(results).toEqual([]);
  });

  it('a non-empty agentMap that simply lacks the slug still flags it (not the same as "empty")', () => {
    const results = validateSubagentRefs(makePersona(['helper']), { agent_slug_other: 'other' });
    expect(results).toHaveLength(1);
  });
});

describe('validateSubagentRefs — target-aware check', () => {
  it('does nothing when index is supplied without a target', () => {
    const index = makeIndex([makeEntry({ slug: 'helper', targets: ['claude-code'] })]);
    const results = validateSubagentRefs(makePersona(['helper']), { agent_slug_helper: 'helper' }, index);
    expect(results).toEqual([]);
  });

  it('does nothing when target is supplied without an index', () => {
    const results = validateSubagentRefs(
      makePersona(['helper']),
      { agent_slug_helper: 'helper' },
      undefined,
      'vscode',
    );
    expect(results).toEqual([]);
  });

  it('flags a slug that exists but is not built for the current target', () => {
    const index = makeIndex([makeEntry({ slug: 'helper', targets: ['claude-code'] })]);
    const results = validateSubagentRefs(
      makePersona(['helper']),
      { agent_slug_helper: 'helper' },
      index,
      'vscode',
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('error');
    expect(results[0]!.message).toContain('helper');
    expect(results[0]!.message).toContain('vscode');
  });

  it('does not flag a slug built for the current target', () => {
    const index = makeIndex([makeEntry({ slug: 'helper', targets: ['vscode', 'claude-code'] })]);
    const results = validateSubagentRefs(
      makePersona(['helper']),
      { agent_slug_helper: 'helper' },
      index,
      'vscode',
    );
    expect(results).toEqual([]);
  });

  it('a slug absent from the index is left to the unknown-slug check (no target-aware error)', () => {
    const index = makeIndex([makeEntry({ slug: 'other-persona' })]);
    // 'helper' is known in agentMap (so the unknown-slug check passes) but
    // absent from the index — the target-aware check must not fire for it.
    const results = validateSubagentRefs(
      makePersona(['helper']),
      { agent_slug_helper: 'helper' },
      index,
      'vscode',
    );
    expect(results).toEqual([]);
  });

  it('both checks can fire independently for the same slug', () => {
    const index = makeIndex([makeEntry({ slug: 'helper', targets: ['claude-code'] })]);
    // A non-empty agentMap that does NOT contain 'agent_slug_helper' —
    // unknown-slug check fires (an empty {} would instead skip it entirely).
    // index has 'helper' but not built for 'vscode' — target-aware check also fires.
    const results = validateSubagentRefs(
      makePersona(['helper']),
      { agent_slug_unrelated: 'unrelated' },
      index,
      'vscode',
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.severity === 'error')).toBe(true);
  });

  it('reports one target-aware error per excluded slug when multiple are declared', () => {
    const index = makeIndex([
      makeEntry({ slug: 'a', targets: ['claude-code'] }),
      makeEntry({ slug: 'b', targets: ['vscode'] }),
      makeEntry({ slug: 'c', targets: ['claude-code'] }),
    ]);
    const agentMap = { agent_slug_a: 'a', agent_slug_b: 'b', agent_slug_c: 'c' };
    const results = validateSubagentRefs(makePersona(['a', 'b', 'c']), agentMap, index, 'vscode');
    expect(results).toHaveLength(2);
    const messages = results.map((r) => r.message);
    expect(messages.some((m) => m.includes("'a'"))).toBe(true);
    expect(messages.some((m) => m.includes("'c'"))).toBe(true);
    expect(messages.some((m) => m.includes("'b'"))).toBe(false);
  });
});
