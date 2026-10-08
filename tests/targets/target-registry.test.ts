/**
 * tests/targets/target-registry.test.ts
 *
 * Unit tests for the src/targets/ module.
 *
 * Covers:
 *   - TargetRegistry CRUD: register(), get(), has(), names(), allDefinitions()
 *   - defaultRegistry built-in targets ('vscode', 'claude-code')
 *   - Duplicate registration throws descriptive error (AC-3)
 *   - get() for unknown name throws descriptive error listing known targets (AC-4)
 *   - Smoke import: all expected symbols are exported from the package entry point (AC-5)
 *   - DEFAULT_FRONTMATTER_CLAUDE_CODE field structure assertions
 *   - register() rejects a global/sticky `mcpToolPattern` (WP-003 AC)
 *   - clone()/allDefinitions()/get() deep-copy `toolCapabilities` (WP-003 AC)
 *   - Built-in vscode/claude-code capability maps + mcpToolPattern;
 *     deep-agents toolsContextKey-only (WP-003 AC)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TargetRegistry } from '../../src/targets/registry.js';
import {
  defaultRegistry,
  TARGET_VSCODE,
  TARGET_CLAUDE_CODE,
  TARGET_DEEP_AGENTS,
} from '../../src/targets/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTarget(name: string) {
  return {
    name,
    outputDirKey: name,
    defaultFrontmatter: `---\ntarget: ${name}\n---`,
    contextFlags: { [`target_${name}`]: true },
  };
}

// ---------------------------------------------------------------------------
// TargetRegistry — isolated instance tests
// ---------------------------------------------------------------------------

describe('TargetRegistry', () => {
  let registry: TargetRegistry;

  beforeEach(() => {
    registry = new TargetRegistry();
  });

  // AC-1: register and retrieve
  describe('register() + get()', () => {
    it('stores a definition and returns it by name', () => {
      const def = makeTarget('my-target');
      registry.register(def);
      expect(registry.get('my-target')).toStrictEqual(def);
    });

    it('returns the correct definition when multiple targets are registered', () => {
      const a = makeTarget('alpha');
      const b = makeTarget('beta');
      registry.register(a);
      registry.register(b);
      expect(registry.get('alpha')).toStrictEqual(a);
      expect(registry.get('beta')).toStrictEqual(b);
    });
  });

  // AC-3: duplicate registration throws descriptive error
  describe('register() — duplicate rejection', () => {
    it('throws when registering a name that already exists', () => {
      registry.register(makeTarget('dup'));
      expect(() => registry.register(makeTarget('dup'))).toThrow(
        /already registered/i,
      );
    });

    it('error message includes the duplicate target name', () => {
      registry.register(makeTarget('dup'));
      expect(() => registry.register(makeTarget('dup'))).toThrowError(/dup/);
    });
  });

  // AC-4: get() for unknown throws descriptive error
  describe('get() — unknown name', () => {
    it('throws when the name is not registered', () => {
      expect(() => registry.get('nonexistent')).toThrow(/not registered/i);
    });

    it('error message includes the requested name', () => {
      expect(() => registry.get('ghost')).toThrowError(/ghost/);
    });

    it('error message lists registered targets when at least one exists', () => {
      registry.register(makeTarget('known-target'));
      expect(() => registry.get('ghost')).toThrowError(/known-target/);
    });

    it('error message shows (none) when registry is empty', () => {
      expect(() => registry.get('ghost')).toThrowError(/\(none\)/);
    });
  });

  // has()
  describe('has()', () => {
    it('returns true for a registered name', () => {
      registry.register(makeTarget('present'));
      expect(registry.has('present')).toBe(true);
    });

    it('returns false for an unregistered name', () => {
      expect(registry.has('absent')).toBe(false);
    });
  });

  // names()
  describe('names()', () => {
    it('returns an empty array for a fresh registry', () => {
      expect(registry.names()).toEqual([]);
    });

    it('returns names in registration order', () => {
      registry.register(makeTarget('first'));
      registry.register(makeTarget('second'));
      registry.register(makeTarget('third'));
      expect(registry.names()).toEqual(['first', 'second', 'third']);
    });
  });

  // allDefinitions()
  describe('allDefinitions()', () => {
    it('returns an empty array for a fresh registry', () => {
      expect(registry.allDefinitions()).toEqual([]);
    });

    it('returns all registered definitions in registration order', () => {
      const a = makeTarget('a');
      const b = makeTarget('b');
      registry.register(a);
      registry.register(b);
      expect(registry.allDefinitions()).toEqual([a, b]);
    });

    it('returns shallow copies — mutating a returned definition does not affect the registry', () => {
      registry.register(makeTarget('immutable'));
      const [returned] = registry.allDefinitions();
      returned.name = 'MUTATED';
      expect(registry.get('immutable').name).toBe('immutable');
    });
  });

  // clone()
  describe('clone()', () => {
    it('returns a new registry with the same definitions', () => {
      registry.register(makeTarget('alpha'));
      registry.register(makeTarget('beta'));
      const cloned = registry.clone();
      expect(cloned.names()).toEqual(['alpha', 'beta']);
    });

    it('cloned registry is independent — registering on clone does not affect original', () => {
      registry.register(makeTarget('alpha'));
      const cloned = registry.clone();
      cloned.register(makeTarget('gamma'));
      expect(cloned.has('gamma')).toBe(true);
      expect(registry.has('gamma')).toBe(false);
    });

    it('cloned registry is independent — registering on original does not affect clone', () => {
      registry.register(makeTarget('alpha'));
      const cloned = registry.clone();
      registry.register(makeTarget('delta'));
      expect(registry.has('delta')).toBe(true);
      expect(cloned.has('delta')).toBe(false);
    });

    it('cloned definitions are copies (not references)', () => {
      const original = makeTarget('alpha');
      registry.register(original);
      const cloned = registry.clone();
      const clonedDef = cloned.get('alpha');
      expect(clonedDef).toEqual(original);
      expect(clonedDef).not.toBe(original);
    });

    it('deep-copies toolCapabilities — mutating a cloned array leaves the original registry unchanged', () => {
      registry.register({
        ...makeTarget('alpha'),
        toolCapabilities: { read: ['Read'] },
      });
      const cloned = registry.clone();
      cloned.get('alpha').toolCapabilities!.read.push('MutatedTool');
      expect(registry.get('alpha').toolCapabilities!.read).toEqual(['Read']);
    });
  });

  // toolCapabilities deep-copy — get() / allDefinitions()
  describe('toolCapabilities deep-copy', () => {
    it('get() returns a definition whose toolCapabilities array is independent of the registry', () => {
      registry.register({
        ...makeTarget('alpha'),
        toolCapabilities: { read: ['Read'] },
      });
      const first = registry.get('alpha');
      first.toolCapabilities!.read.push('MutatedTool');
      const second = registry.get('alpha');
      expect(second.toolCapabilities!.read).toEqual(['Read']);
    });

    it('allDefinitions() returns definitions whose toolCapabilities arrays are independent of the registry', () => {
      registry.register({
        ...makeTarget('alpha'),
        toolCapabilities: { read: ['Read'] },
      });
      const [returned] = registry.allDefinitions();
      returned.toolCapabilities!.read.push('MutatedTool');
      expect(registry.get('alpha').toolCapabilities!.read).toEqual(['Read']);
    });

    it('a custom target registered without the new fields still registers and is retrievable', () => {
      const def = makeTarget('legacy-style');
      expect(() => registry.register(def)).not.toThrow();
      expect(registry.get('legacy-style')).toEqual(def);
    });
  });

  // register() — mcpToolPattern flag rejection
  describe('register() — mcpToolPattern flag validation', () => {
    it('throws when mcpToolPattern carries the global flag', () => {
      expect(() =>
        registry.register({ ...makeTarget('bad-g'), mcpToolPattern: /^mcp__(\w+)/g }),
      ).toThrow(/non-global|"g"|"y"/i);
    });

    it('throws when mcpToolPattern carries the sticky flag', () => {
      expect(() =>
        registry.register({ ...makeTarget('bad-y'), mcpToolPattern: /^mcp__(\w+)/y }),
      ).toThrow(/non-global|"g"|"y"/i);
    });

    it('error message names the offending target', () => {
      expect(() =>
        registry.register({ ...makeTarget('bad-target'), mcpToolPattern: /^mcp__(\w+)/g }),
      ).toThrowError(/bad-target/);
    });

    it('registers successfully when mcpToolPattern has no global/sticky flag', () => {
      expect(() =>
        registry.register({ ...makeTarget('good'), mcpToolPattern: /^mcp__(\w+)/ }),
      ).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// AC-2: defaultRegistry built-in targets
// ---------------------------------------------------------------------------

describe('defaultRegistry', () => {
  it('names() returns [\'vscode\', \'claude-code\', \'deep-agents\'] in that order', () => {
    expect(defaultRegistry.names()).toEqual(['vscode', 'claude-code', 'deep-agents']);
  });

  it('has() returns true for TARGET_VSCODE', () => {
    expect(defaultRegistry.has(TARGET_VSCODE)).toBe(true);
  });

  it('has() returns true for TARGET_CLAUDE_CODE', () => {
    expect(defaultRegistry.has(TARGET_CLAUDE_CODE)).toBe(true);
  });

  it('vscode target has correct outputDirKey', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).outputDirKey).toBe('vscode');
  });

  it('vscode target has correct filenameContextKey', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).filenameContextKey).toBe('vs_file_name');
  });

  it('vscode target has target_vscode context flag set to true', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).contextFlags).toMatchObject({
      target_vscode: true,
    });
  });

  it('claude-code target has correct outputDirKey', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).outputDirKey).toBe('claude-code');
  });

  it('claude-code target has correct filenameContextKey', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).filenameContextKey).toBe('cc_file_name');
  });

  it('claude-code target has target_claude_code context flag set to true', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).contextFlags).toMatchObject({
      target_claude_code: true,
    });
  });

  it('allDefinitions() returns 3 entries', () => {
    expect(defaultRegistry.allDefinitions()).toHaveLength(3);
  });

  it('has() returns true for TARGET_DEEP_AGENTS', () => {
    expect(defaultRegistry.has(TARGET_DEEP_AGENTS)).toBe(true);
  });

  it('deep-agents target has correct outputDirKey', () => {
    expect(defaultRegistry.get(TARGET_DEEP_AGENTS).outputDirKey).toBe('deep-agents');
  });

  it('deep-agents target has correct filenameContextKey', () => {
    expect(defaultRegistry.get(TARGET_DEEP_AGENTS).filenameContextKey).toBe('da_file_name');
  });

  it('deep-agents target has target_deep_agents context flag set to true', () => {
    expect(defaultRegistry.get(TARGET_DEEP_AGENTS).contextFlags).toMatchObject({
      target_deep_agents: true,
    });
  });

  it('vscode target has defaultEnabled = true', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).defaultEnabled).toBe(true);
  });

  it('claude-code target has defaultEnabled = true', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).defaultEnabled).toBe(true);
  });

  it('deep-agents target has defaultEnabled = false', () => {
    expect(defaultRegistry.get(TARGET_DEEP_AGENTS).defaultEnabled).toBe(false);
  });

  // WP-003: tool capability metadata
  it('vscode target declares toolsContextKey "tools"', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).toolsContextKey).toBe('tools');
  });

  it('vscode target declares the full capability map', () => {
    expect(defaultRegistry.get(TARGET_VSCODE).toolCapabilities).toEqual({
      execute: ['execute'],
      read: ['read'],
      edit: ['edit'],
      search: ['search'],
      web: ['web'],
      dispatch: ['agent'],
      todo: ['todo'],
    });
  });

  it('vscode target declares a non-global mcpToolPattern matching server/*', () => {
    const pattern = defaultRegistry.get(TARGET_VSCODE).mcpToolPattern!;
    expect(pattern.global).toBe(false);
    expect(pattern.sticky).toBe(false);
    expect('my-server/some-tool'.match(pattern)?.[1]).toBe('my-server');
  });

  it('claude-code target declares toolsContextKey "cc_tools"', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).toolsContextKey).toBe('cc_tools');
  });

  it('claude-code target declares the full capability map', () => {
    expect(defaultRegistry.get(TARGET_CLAUDE_CODE).toolCapabilities).toEqual({
      execute: ['Bash'],
      read: ['Read'],
      edit: ['Edit', 'Write'],
      search: ['Grep', 'Glob'],
      web: ['WebFetch', 'WebSearch'],
      dispatch: ['Task', 'Agent'],
      todo: ['TodoWrite', 'TodoRead'],
    });
  });

  it('claude-code target declares a non-global mcpToolPattern matching mcp__server and mcp__server__tool', () => {
    const pattern = defaultRegistry.get(TARGET_CLAUDE_CODE).mcpToolPattern!;
    expect(pattern.global).toBe(false);
    expect(pattern.sticky).toBe(false);
    expect('mcp__my_server'.match(pattern)?.[1]).toBe('my_server');
    expect('mcp__my_server__some_tool'.match(pattern)?.[1]).toBe('my_server');
  });

  it('deep-agents target declares toolsContextKey "da_tools" and no capability map', () => {
    const def = defaultRegistry.get(TARGET_DEEP_AGENTS);
    expect(def.toolsContextKey).toBe('da_tools');
    expect(def.toolCapabilities).toBeUndefined();
    expect(def.mcpToolPattern).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC-5: package entry-point smoke test
// ---------------------------------------------------------------------------

describe('package entry-point exports', () => {
  it('exports TargetRegistry', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.TargetRegistry).toBe('function');
  });

  it('exports defaultRegistry', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.defaultRegistry).toBeDefined();
    expect(typeof mod.defaultRegistry.register).toBe('function');
  });

  it('exports TARGET_VSCODE constant', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.TARGET_VSCODE).toBe('vscode');
  });

  it('exports TARGET_CLAUDE_CODE constant', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.TARGET_CLAUDE_CODE).toBe('claude-code');
  });

  it('TargetDefinition type is re-exported (verified via TargetRegistry usage)', async () => {
    // Type-only exports cannot be asserted at runtime; verify the value-level
    // symbols that depend on TargetDefinition are present and correct shape.
    const mod = await import('../../src/index.js');
    const def = mod.defaultRegistry.get(mod.TARGET_VSCODE);
    expect(def).toHaveProperty('name');
    expect(def).toHaveProperty('outputDirKey');
    expect(def).toHaveProperty('defaultFrontmatter');
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_FRONTMATTER_CLAUDE_CODE — field structure assertions
// ---------------------------------------------------------------------------

describe('DEFAULT_FRONTMATTER_CLAUDE_CODE', () => {
  // Import the constant directly from types.ts (not barrel-exported).
  let template: string;

  beforeEach(async () => {
    const mod = await import('../../src/targets/types.js');
    template = mod.DEFAULT_FRONTMATTER_CLAUDE_CODE;
  });

  it('contains the name field', () => {
    expect(template).toMatch(/^name:/m);
  });

  it('contains the description field', () => {
    expect(template).toMatch(/^description:/m);
  });

  it('does NOT contain the permissionMode field', () => {
    expect(template).not.toMatch(/^permissionMode:/m);
  });

  it('contains the model field', () => {
    expect(template).toMatch(/^model:/m);
  });

  it('contains the memory field', () => {
    expect(template).toMatch(/^memory:/m);
  });

  it('contains the tools field (not allowedTools)', () => {
    expect(template).toMatch(/^tools:/m);
  });

  it('does NOT contain the allowedTools field', () => {
    expect(template).not.toMatch(/^allowedTools:/m);
  });

  it('is wrapped in YAML frontmatter delimiters', () => {
    expect(template).toMatch(/^---\n/);
    expect(template).toMatch(/\n---$/);
  });
});
