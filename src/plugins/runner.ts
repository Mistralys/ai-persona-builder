/**
 * src/plugins/runner.ts
 *
 * Plugin runner — responsible for invoking plugin hooks in registration order.
 *
 * Each exported function corresponds to one lifecycle hook defined in
 * PersonaBuildPlugin. The runner:
 *   - Skips plugins that do not implement the requested hook (hook is optional)
 *   - Invokes hooks in the order plugins are registered (first-in first-called)
 *   - For accumulating hooks (onBuildContext, onPostRender), each plugin
 *     receives the output of the previous plugin as its first argument
 *   - For collecting hooks (onValidate), results are concatenated into a
 *     flat array
 *
 * No file-system I/O. No async operations.
 */

import type {
  PersonaBuildPlugin,
  PersonaMetadata,
  SuiteConfig,
  TargetType,
  ValidationResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Suite-level hook
// ---------------------------------------------------------------------------

/**
 * Invoke the `onSuiteInit` hook on every registered plugin.
 *
 * Each plugin may optionally implement this hook. Plugins are called in
 * registration order. The hook receives the suite config and a mutable
 * `sharedMeta` object — plugins may mutate `sharedMeta` in place; the
 * same reference is passed to every subsequent plugin.
 *
 * @param plugins    Ordered list of registered plugins
 * @param suite      The suite configuration object
 * @param sharedMeta Mutable shared metadata object (mutated in place by plugins)
 */
export function runSuiteInit(
  plugins: PersonaBuildPlugin[],
  suite: SuiteConfig,
  sharedMeta: Record<string, unknown>,
): void {
  for (const plugin of plugins) {
    if (typeof plugin.onSuiteInit === 'function') {
      plugin.onSuiteInit(suite, sharedMeta);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-persona context accumulation
// ---------------------------------------------------------------------------

/**
 * Invoke the `onBuildContext` hook on every registered plugin, accumulating
 * context mutations sequentially.
 *
 * Each plugin receives the context returned by the previous plugin. If a
 * plugin does not implement `onBuildContext`, the context passes through
 * unchanged. The final accumulated context is returned.
 *
 * @param plugins Ordered list of registered plugins
 * @param ctx     Initial rendering context for this persona
 * @param persona Typed metadata for the persona being built
 * @param suite   The suite configuration object
 * @returns       Accumulated rendering context after all plugins have run
 */
export function runBuildContext(
  plugins: PersonaBuildPlugin[],
  ctx: Record<string, unknown>,
  persona: PersonaMetadata,
  suite: SuiteConfig,
): Record<string, unknown> {
  let accumulated = ctx;
  for (const plugin of plugins) {
    if (typeof plugin.onBuildContext === 'function') {
      accumulated = plugin.onBuildContext(accumulated, persona, suite);
    }
  }
  return accumulated;
}

// ---------------------------------------------------------------------------
// Per-persona post-render chain
// ---------------------------------------------------------------------------

/**
 * Invoke the `onPostRender` hook on every registered plugin, chaining the
 * output string sequentially.
 *
 * Each plugin receives the string returned by the previous plugin. If a
 * plugin does not implement `onPostRender`, the string passes through
 * unchanged. The final string is returned.
 *
 * @param plugins  Ordered list of registered plugins
 * @param rendered Initial rendered output string
 * @param persona  Typed metadata for the persona being built
 * @param target   The current build target
 * @returns        Final output string after all plugins have run
 */
export function runPostRender(
  plugins: PersonaBuildPlugin[],
  rendered: string,
  persona: PersonaMetadata,
  target: TargetType,
): string {
  let output = rendered;
  for (const plugin of plugins) {
    if (typeof plugin.onPostRender === 'function') {
      output = plugin.onPostRender(output, persona, target);
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Per-persona validation collection
// ---------------------------------------------------------------------------

/**
 * Invoke the `onValidate` hook on every registered plugin and collect all
 * returned ValidationResult objects into a single flat array.
 *
 * Plugins that do not implement `onValidate` contribute nothing to the result.
 * The return value is always an array (never null/undefined).
 *
 * @param plugins Ordered list of registered plugins
 * @param persona Typed metadata for the persona being built
 * @param suite   The suite configuration object
 * @returns       Flat array of all ValidationResult objects from all plugins
 */
export function runValidate(
  plugins: PersonaBuildPlugin[],
  persona: PersonaMetadata,
  suite: SuiteConfig,
): ValidationResult[] {
  const results: ValidationResult[] = [];
  for (const plugin of plugins) {
    if (typeof plugin.onValidate === 'function') {
      const pluginResults = plugin.onValidate(persona, suite);
      results.push(...pluginResults);
    }
  }
  return results;
}
