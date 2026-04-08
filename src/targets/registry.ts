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
   */
  register(definition: TargetDefinition): void {
    if (this._definitions.has(definition.name)) {
      throw new Error(
        `TargetRegistry: target "${definition.name}" is already registered. ` +
          `Use a unique name or remove the existing registration first.`,
      );
    }
    this._definitions.set(definition.name, definition);
  }

  /**
   * Retrieve a registered target definition by name.
   *
   * Returns a shallow copy — mutating the returned object does not affect
   * the registry's internal state.
   *
   * @param name      The target name to look up.
   * @returns         A shallow copy of the matching TargetDefinition.
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
    return { ...def };
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
   * Returns shallow copies — mutating a returned definition does not affect
   * the registry's internal state.
   */
  allDefinitions(): TargetDefinition[] {
    return Array.from(this._definitions.values()).map(def => ({ ...def }));
  }

  /**
   * Returns a new TargetRegistry pre-populated with the same definitions.
   *
   * Useful for test isolation: clone the `defaultRegistry` to get an
   * independent copy that can be mutated without affecting the singleton.
   */
  clone(): TargetRegistry {
    const copy = new TargetRegistry();
    for (const def of this._definitions.values()) {
      copy.register({ ...def });
    }
    return copy;
  }
}
