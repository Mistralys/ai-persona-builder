/**
 * tests/targets/target-tools.test.ts
 *
 * Unit tests for src/targets/tools.ts:
 *   - pickToolList()          — key-with-tools-fallback selection
 *   - resolveTargetTools()    — pickToolList() driven by a TargetDefinition
 *   - resolveCapabilities()   — capability → first granting tool, plus MCP
 *   - recognizedBy()          — cross-target foreign-notation recognition
 */

import { describe, it, expect } from 'vitest';

import {
  pickToolList,
  resolveTargetTools,
  resolveCapabilities,
  recognizedBy,
} from '../../src/targets/tools.js';
import { TargetRegistry } from '../../src/targets/registry.js';
import { defaultRegistry } from '../../src/targets/built-in.js';
import { TARGET_CLAUDE_CODE, TARGET_VSCODE } from '../../src/targets/types.js';

// ---------------------------------------------------------------------------
// pickToolList
// ---------------------------------------------------------------------------

describe('pickToolList', () => {
  it('returns the named key when it is an array', () => {
    const record = { cc_tools: ['Read', 'Write'], tools: ['read'] };
    expect(pickToolList(record, 'cc_tools')).toEqual(['Read', 'Write']);
  });

  it('falls back to "tools" when the named key is absent', () => {
    const record = { tools: ['read', 'edit'] };
    expect(pickToolList(record, 'cc_tools')).toEqual(['read', 'edit']);
  });

  it('falls back to "tools" when the named key is present but not an array', () => {
    const record = { cc_tools: 'not-an-array', tools: ['read'] };
    expect(pickToolList(record, 'cc_tools')).toEqual(['read']);
  });

  it('returns undefined when neither the key nor "tools" is an array', () => {
    const record = { description: 'no tool fields here' };
    expect(pickToolList(record, 'cc_tools')).toBeUndefined();
  });

  it('returns undefined when both the key and "tools" are absent', () => {
    expect(pickToolList({}, 'da_tools')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveTargetTools
// ---------------------------------------------------------------------------

describe('resolveTargetTools', () => {
  it("uses the target's toolsContextKey", () => {
    const context = { cc_tools: ['Read'], tools: ['read'] };
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    expect(resolveTargetTools(context, def)).toEqual(['Read']);
  });

  it('falls back to "tools" when a definition has no toolsContextKey', () => {
    const context = { tools: ['read', 'edit'] };
    expect(resolveTargetTools(context, { name: 'custom', outputDirKey: 'custom', defaultFrontmatter: '' })).toEqual([
      'read',
      'edit',
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilities
// ---------------------------------------------------------------------------

describe('resolveCapabilities', () => {
  it('resolves the first granting tool per mapped capability (claude-code)', () => {
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    const capabilities = resolveCapabilities(['Read', 'Edit', 'Bash'], def);

    expect(capabilities.get('read')).toBe('Read');
    expect(capabilities.get('edit')).toBe('Edit');
    expect(capabilities.get('execute')).toBe('Bash');
    expect(capabilities.has('search')).toBe(false);
  });

  it('picks the first tool in list order when multiple tools grant the same capability', () => {
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    // Both Edit and Write grant `edit` — Write appears first in the list.
    const capabilities = resolveCapabilities(['Write', 'Edit'], def);
    expect(capabilities.get('edit')).toBe('Write');
  });

  it('ignores unmapped tools (e.g. a VS Code-only tool with no capability entry)', () => {
    const def = defaultRegistry.get(TARGET_VSCODE);
    const capabilities = resolveCapabilities(['browser', 'vscode', 'read'], def);
    expect(capabilities.get('read')).toBe('read');
    expect(capabilities.size).toBe(1);
  });

  it('resolves mcp:<server> capability via mcpToolPattern (vscode notation)', () => {
    const def = defaultRegistry.get(TARGET_VSCODE);
    const capabilities = resolveCapabilities(['my-server/some-tool'], def);
    expect(capabilities.get('mcp:my-server')).toBe('my-server/some-tool');
  });

  it('resolves mcp:<server> capability via mcpToolPattern (claude-code notation)', () => {
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    const capabilities = resolveCapabilities(['mcp__my_server__some_tool'], def);
    expect(capabilities.get('mcp:my_server')).toBe('mcp__my_server__some_tool');
  });

  it('returns an empty map for an undefined tool list', () => {
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    expect(resolveCapabilities(undefined, def).size).toBe(0);
  });

  it('returns an empty map for an empty tool list', () => {
    const def = defaultRegistry.get(TARGET_CLAUDE_CODE);
    expect(resolveCapabilities([], def).size).toBe(0);
  });

  it('returns an empty map for a target with no capability map or MCP pattern (deep-agents)', () => {
    const def = defaultRegistry.get('deep-agents');
    expect(resolveCapabilities(['task'], def).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recognizedBy
// ---------------------------------------------------------------------------

describe('recognizedBy', () => {
  it("recognizes VS Code's 'read' tool on the vscode target, excluding claude-code", () => {
    expect(recognizedBy('read', defaultRegistry, 'claude-code')).toEqual(['vscode']);
  });

  it("recognizes Claude Code's 'Read' tool on the claude-code target, excluding vscode", () => {
    expect(recognizedBy('Read', defaultRegistry, 'vscode')).toEqual(['claude-code']);
  });

  it('returns an empty array for a tool no other target recognises', () => {
    expect(recognizedBy('totally-custom-tool', defaultRegistry, 'vscode')).toEqual([]);
  });

  it('recognises an MCP-notation tool via the other target\'s mcpToolPattern', () => {
    // 'mcp__server__tool' is claude-code notation; vscode does not recognise
    // its own list, but does it get flagged by claude-code's pattern when
    // excluding vscode itself? Confirm claude-code recognises it.
    expect(recognizedBy('mcp__server__tool', defaultRegistry, 'vscode')).toEqual(['claude-code']);
  });

  it('returns no entries when the only other registered target has no capability map (isolated registry)', () => {
    const registry = new TargetRegistry();
    registry.register({ name: 'a', outputDirKey: 'a', defaultFrontmatter: '', toolCapabilities: { read: ['read'] } });
    registry.register({ name: 'b', outputDirKey: 'b', defaultFrontmatter: '' });
    expect(recognizedBy('read', registry, 'a')).toEqual([]);
  });
});
