/**
 * src/targets/registry.ts
 *
 * TargetRegistry — holds TargetDefinition entries and allows consumers to
 * register custom build targets alongside (or instead of) the built-in ones.
 */

import type { TargetDefinition } from './types.js';

// ---------------------------------------------------------------------------
// TargetRegistry class
// ---------------------------------------------------------------------------

/**
 * Registry that maps target names to their TargetDefinition objects.
 *
 * Consumers can extend the default build system by calling `register()` with
 * a custom TargetDefinition before invoking `build()`.
 *
 * @example
 * ```ts
 * import { defaultRegistry } from '@mistralys/persona-builder';
 *
 * defaultRegistry.register({
 *   name: 'my-target',
 *   outputDirKey: 'my-target',
 *   defaultFrontmatter: '---\nmy: frontmatter\n---',
 *   contextFlags: { target_my_target: true },
 * });
 * ```
 */
export class TargetRegistry {
  // Map preserves insertion order — names() and allDefinitions() are
  // therefore deterministic and match registration sequence. This is
  // intentional: the built-in registry guarantees ['vscode', 'claude-code']
  // ordering for the default targets (AC-2).
  private readonly _definitions = new Map<string, TargetDefinition>();

  /**
   * Register a new target definition.
   *
   * @param definition  The target descriptor to register.
   * @throws {Error}    If a target with the same `name` is already registered.
   * @throws {Error}    If `definition.mcpToolPattern` carries the `g` or `y`
   *                    flag — such a pattern gives `exec()`/`test()` mutable
   *                    `lastIndex` state, and the same `RegExp` instance is
   *                    shared between registry copies (see `clone()`), so
   *                    match results would depend on call order.
   */
  register(definition: TargetDefinition): void {
    if (this._definitions.has(definition.name)) {
      throw new Error(
        `TargetRegistry: target "${definition.name}" is already registered. ` +
          `Use a unique name or remove the existing registration first.`,
      );
    }
    if (definition.mcpToolPattern && (definition.mcpToolPattern.global || definition.mcpToolPattern.sticky)) {
      throw new Error(
        `TargetRegistry: target "${definition.name}" registers an "mcpToolPattern" with a "g" or "y" flag. ` +
          `The pattern must be non-global — remove the flag(s) so exec()/test() stays stateless.`,
      );
    }
    this._definitions.set(definition.name, definition);
  }

  /**
   * Retrieve a registered target definition by name.
   *
   * Returns a copy — mutating the returned object, including its
   * `toolCapabilities` map and arrays, does not affect the registry's
   * internal state. See `cloneDefinition()`.
   *
   * @param name      The target name to look up.
   * @returns         A copy of the matching TargetDefinition.
   * @throws {Error}  If no target with the given name is registered.
   */
  get(name: string): TargetDefinition {
    const def = this._definitions.get(name);
    if (!def) {
      const known = this.names().join(', ') || '(none)';
      throw new Error(
        `TargetRegistry: target "${name}" is not registered. ` +
          `Registered targets: ${known}.`,
      );
    }
    return cloneDefinition(def);
  }

  /**
   * Returns `true` if a target with the given name is registered.
   *
   * @param name  The target name to check.
   */
  has(name: string): boolean {
    return this._definitions.has(name);
  }

  /**
   * Returns the names of all registered targets, in registration order.
   */
  names(): string[] {
    return Array.from(this._definitions.keys());
  }

  /**
   * Returns all registered TargetDefinition objects, in registration order.
   *
   * Returns copies — mutating a returned definition, including its
   * `toolCapabilities` map and arrays, does not affect the registry's
   * internal state. See `cloneDefinition()`.
   */
  allDefinitions(): TargetDefinition[] {
    return Array.from(this._definitions.values()).map(cloneDefinition);
  }

  /**
   * Returns a new TargetRegistry pre-populated with the same definitions.
   *
   * Useful for test isolation: clone the `defaultRegistry` to get an
   * independent copy that can be mutated without affecting the singleton.
   * Each definition is deep-copied (see `cloneDefinition()`), so mutating a
   * `toolCapabilities` array on the clone never leaks back to the original
   * registry, or to any other clone.
   */
  clone(): TargetRegistry {
    const copy = new TargetRegistry();
    for (const def of this._definitions.values()) {
      copy.register(cloneDefinition(def));
    }
    return copy;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deep-copy a `TargetDefinition`.
 *
 * A plain `{ ...def }` shallow spread would leave `toolCapabilities` (an
 * object whose values are arrays) shared between the original and the copy —
 * mutating a copy's array would silently mutate the original too, which
 * defeats the test-isolation purpose `clone()` and `allDefinitions()` are
 * documented to serve. `mcpToolPattern` is intentionally left shared: it is
 * required to be non-global (enforced by `register()`), and a non-global
 * `RegExp` carries no mutable `lastIndex` state, so sharing it is safe.
 *
 * @param def  The definition to copy.
 * @returns    A new object; `toolCapabilities`, if present, is a fresh object
 *             with fresh arrays.
 */
function cloneDefinition(def: TargetDefinition): TargetDefinition {
  const copy: TargetDefinition = { ...def };
  if (def.toolCapabilities) {
    copy.toolCapabilities = Object.fromEntries(
      Object.entries(def.toolCapabilities).map(([capability, tools]) => [capability, [...tools]]),
    );
  }
  return copy;
}
