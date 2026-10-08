/**
 * tests/validators/tool-requirements-validator.test.ts
 *
 * Unit tests for src/validators/tool-requirements-validator.ts:
 *   - validateToolRequirements() dispatch-grant checks
 *   - validateToolRequirements() foreign-notation checks
 *   - SUBAGENT_DISPATCH_REQUIREMENT shape
 */

import { describe, it, expect } from 'vitest';

import {
  validateToolRequirements,
  SUBAGENT_DISPATCH_REQUIREMENT,
  type ToolRequirement,
} from '../../src/validators/tool-requirements-validator.js';
import { defaultRegistry } from '../../src/targets/built-in.js';
import { TargetRegistry } from '../../src/targets/registry.js';
import { TARGET_CLAUDE_CODE, TARGET_VSCODE, TARGET_DEEP_AGENTS } from '../../src/targets/types.js';

const claudeCodeDef = defaultRegistry.get(TARGET_CLAUDE_CODE);
const vscodeDef = defaultRegistry.get(TARGET_VSCODE);
const deepAgentsDef = defaultRegistry.get(TARGET_DEEP_AGENTS);

// ---------------------------------------------------------------------------
// SUBAGENT_DISPATCH_REQUIREMENT
// ---------------------------------------------------------------------------

describe('SUBAGENT_DISPATCH_REQUIREMENT', () => {
  it('has the expected id and field trigger, with no targets restriction', () => {
    expect(SUBAGENT_DISPATCH_REQUIREMENT).toEqual({
      id: 'subagent-dispatch',
      when: { field: 'subagents' },
    });
  });
});

// ---------------------------------------------------------------------------
// Dispatch grant
// ---------------------------------------------------------------------------

describe('validateToolRequirements — dispatch grant', () => {
  it('triggered and granted → no result', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read', 'Task'],
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('triggered and ungranted → one error naming the id, target, source key, and granting tools', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read', 'Edit'],
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('error');
    expect(results[0]!.message).toContain('subagent-dispatch');
    expect(results[0]!.message).toContain('claude-code');
    expect(results[0]!.message).toContain('field "subagents"');
    expect(results[0]!.message).toContain('Task');
    expect(results[0]!.message).toContain('Agent');
  });

  it('a partial-triggered requirement names the partial as the source key', () => {
    const requirement: ToolRequirement = {
      id: 'handoff-block-claude-code',
      when: { partial: 'handoff-block-claude-code' },
    };
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read'],
      triggered: [requirement],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.message).toContain('partial "handoff-block-claude-code"');
  });

  it('an untriggered requirement → no result', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read'],
      triggered: [],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('undefined effective tools → no result', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: undefined,
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('a target without a capability map is skipped (deep-agents)', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'deep-agents',
      effectiveTools: ['task'],
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: deepAgentsDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('a target with a capability map but no dispatch entry is skipped', () => {
    const noDispatchDef = {
      name: 'custom',
      outputDirKey: 'custom',
      defaultFrontmatter: '',
      toolCapabilities: { read: ['read'] },
    };
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'custom',
      effectiveTools: ['read'],
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: noDispatchDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('a requirement restricted to other targets does not apply to the current target', () => {
    const requirement: ToolRequirement = {
      id: 'vscode-only-requirement',
      when: { field: 'subagents' },
      targets: ['vscode'],
    };
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read'], // no dispatch grant — would error if the requirement applied
      triggered: [requirement],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('a requirement restricted to the current target still applies', () => {
    const requirement: ToolRequirement = {
      id: 'vscode-only-requirement',
      when: { field: 'subagents' },
      targets: ['vscode'],
    };
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'vscode',
      effectiveTools: ['read'],
      triggered: [requirement],
      definition: vscodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('error');
  });

  it('multiple triggered requirements each ungranted produce multiple errors', () => {
    const requirementA: ToolRequirement = { id: 'req-a', when: { field: 'subagents' } };
    const requirementB: ToolRequirement = { id: 'req-b', when: { partial: 'handoff' } };
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read'],
      triggered: [requirementA, requirementB],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.severity === 'error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Foreign notation
// ---------------------------------------------------------------------------

describe('validateToolRequirements — foreign notation', () => {
  it("'read' present in a claude-code effective list yields a warning naming vscode and the Claude Code equivalent", () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['read'],
      triggered: [],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warning');
    expect(results[0]!.message).toContain('read');
    expect(results[0]!.message).toContain('vscode');
    expect(results[0]!.message).toContain('Read');
  });

  it("'Read' present in a vscode effective list yields a warning naming claude-code", () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'vscode',
      effectiveTools: ['Read'],
      triggered: [],
      definition: vscodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warning');
    expect(results[0]!.message).toContain('claude-code');
  });

  it('a tool recognised on its own target is not flagged', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['Read', 'Edit', 'Bash'],
      triggered: [],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('a tool unmapped everywhere (custom/IDE-specific) is ignored', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'vscode',
      effectiveTools: ['browser', 'vscode', 'totally-custom-tool'],
      triggered: [],
      definition: vscodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('an MCP-notation tool from another target is flagged without a fabricated equivalent', () => {
    // vscode-style MCP notation ('server/tool') appearing in a claude-code list.
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['my-server/some-tool'],
      triggered: [],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe('warning');
    expect(results[0]!.message).toContain('vscode');
    // No claude-code equivalent tool names exist for an mcp:<server> capability.
    expect(results[0]!.message).not.toContain('equivalent');
  });

  it('a tool recognised by its own target via mcpToolPattern is not flagged', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['mcp__my_server__some_tool'],
      triggered: [],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('deep-agents (no capability map) skips the foreign-notation check entirely', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'deep-agents',
      effectiveTools: ['read', 'Read', 'task'],
      triggered: [],
      definition: deepAgentsDef,
      registry: defaultRegistry,
    });
    expect(results).toEqual([]);
  });

  it('combines a dispatch-grant error with a foreign-notation warning in one call', () => {
    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'claude-code',
      effectiveTools: ['read'], // vscode notation, and grants no claude-code dispatch tool
      triggered: [SUBAGENT_DISPATCH_REQUIREMENT],
      definition: claudeCodeDef,
      registry: defaultRegistry,
    });
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.severity === 'error')).toBe(true);
    expect(results.some((r) => r.severity === 'warning')).toBe(true);
  });

  it('works against an isolated registry with custom targets (not just the built-in defaultRegistry)', () => {
    const registry = new TargetRegistry();
    registry.register({
      name: 'a',
      outputDirKey: 'a',
      defaultFrontmatter: '',
      toolCapabilities: { read: ['read-a'], dispatch: ['dispatch-a'] },
    });
    registry.register({
      name: 'b',
      outputDirKey: 'b',
      defaultFrontmatter: '',
      toolCapabilities: { read: ['read-b'], dispatch: ['dispatch-b'] },
    });

    const results = validateToolRequirements({
      personaName: 'My Persona',
      target: 'b',
      effectiveTools: ['read-a'],
      triggered: [],
      definition: registry.get('b'),
      registry,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.message).toContain('a notation');
    expect(results[0]!.message).toContain('read-b');
  });
});
