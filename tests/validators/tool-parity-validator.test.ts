/**
 * tests/validators/tool-parity-validator.test.ts
 *
 * Unit tests for validateToolParity() in src/validators/tool-parity-validator.ts.
 */

import { describe, it, expect } from 'vitest';

import { validateToolParity } from '../../src/validators/tool-parity-validator.js';
import type { TargetCapabilitySet } from '../../src/validators/tool-parity-validator.js';

const VSCODE_CAPABILITIES: Record<string, string[]> = {
  execute: ['execute'],
  read: ['read'],
  todo: ['todo'],
};

const CLAUDE_CODE_CAPABILITIES: Record<string, string[]> = {
  execute: ['Bash'],
  read: ['Read'],
  todo: ['TodoWrite', 'TodoRead'],
};

function vscode(capabilities: Record<string, string>): TargetCapabilitySet {
  return {
    target: 'vscode',
    capabilities: new Map(Object.entries(capabilities)),
    toolCapabilities: VSCODE_CAPABILITIES,
  };
}

function claudeCode(capabilities: Record<string, string>): TargetCapabilitySet {
  return {
    target: 'claude-code',
    capabilities: new Map(Object.entries(capabilities)),
    toolCapabilities: CLAUDE_CODE_CAPABILITIES,
  };
}

describe('validateToolParity', () => {
  it('vscode [execute, read] vs claude-code [Read] yields one execute error on claude-code naming Bash as the equivalent tool', () => {
    const findings = validateToolParity(
      'My Persona',
      [vscode({ execute: 'execute', read: 'read' }), claudeCode({ read: 'Read' })],
      [],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.target).toBe('claude-code');
    expect(findings[0]!.result.severity).toBe('error');
    expect(findings[0]!.result.message).toContain('execute');
    expect(findings[0]!.result.message).toContain('vscode');
    expect(findings[0]!.result.message).toContain('Bash');
  });

  it('a capability listed in tool_parity_exceptions produces no error for that capability', () => {
    const findings = validateToolParity(
      'My Persona',
      [vscode({ execute: 'execute', read: 'read' }), claudeCode({ read: 'Read' })],
      ['execute'],
    );
    expect(findings).toEqual([]);
  });

  it('an mcp:<server> mismatch still yields an error (not implicitly exempted)', () => {
    const findings = validateToolParity(
      'My Persona',
      [
        {
          target: 'vscode',
          capabilities: new Map([['mcp:my-server', 'my-server/tool']]),
          toolCapabilities: VSCODE_CAPABILITIES,
        },
        {
          target: 'claude-code',
          capabilities: new Map(),
          toolCapabilities: CLAUDE_CODE_CAPABILITIES,
        },
      ],
      [], // mcp:my-server NOT listed as an exception
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.target).toBe('claude-code');
    expect(findings[0]!.result.message).toContain('mcp:my-server');
  });

  it('an mcp:<server> mismatch listed as an exception produces no error', () => {
    const findings = validateToolParity(
      'My Persona',
      [
        {
          target: 'vscode',
          capabilities: new Map([['mcp:my-server', 'my-server/tool']]),
          toolCapabilities: VSCODE_CAPABILITIES,
        },
        {
          target: 'claude-code',
          capabilities: new Map(),
          toolCapabilities: CLAUDE_CODE_CAPABILITIES,
        },
      ],
      ['mcp:my-server'],
    );
    expect(findings).toEqual([]);
  });

  it('a single mapped target yields no parity results', () => {
    const findings = validateToolParity('My Persona', [vscode({ execute: 'execute' })], []);
    expect(findings).toEqual([]);
  });

  it('yields no results for an empty perTarget list', () => {
    expect(validateToolParity('My Persona', [], [])).toEqual([]);
  });

  it('browser-only differences yield none (browser is not a mapped capability anywhere)', () => {
    // 'browser' never appears as a key in either target's resolved
    // capabilities map (it isn't part of toolCapabilities), so there is
    // nothing for validateToolParity to compare — it only ever sees mapped
    // capability keys, which is exactly what keeps unmapped tools ignored.
    const findings = validateToolParity(
      'My Persona',
      [vscode({ read: 'read' }), claudeCode({ read: 'Read' })],
      [],
    );
    expect(findings).toEqual([]);
  });

  it('a todo difference yields an error', () => {
    const findings = validateToolParity(
      'My Persona',
      [vscode({ todo: 'todo', read: 'read' }), claudeCode({ read: 'Read' })],
      [],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.target).toBe('claude-code');
    expect(findings[0]!.result.message).toContain('todo');
  });

  it('grants everywhere among the participating targets produces no finding', () => {
    const findings = validateToolParity(
      'My Persona',
      [vscode({ read: 'read' }), claudeCode({ read: 'Read' })],
      [],
    );
    expect(findings).toEqual([]);
  });

  it('a capability missing everywhere never appears as a finding (only granted capabilities are compared)', () => {
    // Neither target grants 'execute' — there's nothing to compare, so no
    // finding is produced even though both "lack" it.
    const findings = validateToolParity(
      'My Persona',
      [vscode({ read: 'read' }), claudeCode({ read: 'Read' })],
      [],
    );
    expect(findings.some((f) => f.result.message.includes('execute'))).toBe(false);
  });

  it('names every granting target when three or more targets participate', () => {
    const deepAgentsLike: TargetCapabilitySet = {
      target: 'third-target',
      capabilities: new Map([['execute', 'run']]),
      toolCapabilities: { execute: ['run'] },
    };
    const findings = validateToolParity(
      'My Persona',
      [vscode({ execute: 'execute' }), claudeCode({}), deepAgentsLike],
      [],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.target).toBe('claude-code');
    expect(findings[0]!.result.message).toContain('vscode');
    expect(findings[0]!.result.message).toContain('third-target');
  });

  it('reports "(no known tool name)" when the lacking target has no equivalent tool names for the capability', () => {
    const findings = validateToolParity(
      'My Persona',
      [
        vscode({ execute: 'execute' }),
        { target: 'claude-code', capabilities: new Map(), toolCapabilities: {} },
      ],
      [],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.result.message).toContain('no known tool name');
  });
});
