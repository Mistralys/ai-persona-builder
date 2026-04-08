/**
 * src/builders/frontmatter.ts
 *
 * Frontmatter template registry for @mistralys/persona-builder.
 *
 * Ships three minimal default templates — one per built-in target — that work for the
 * "standalone" persona mode (simple personas without numbered workflows or
 * MCP server blocks).  Projects needing richer frontmatter register custom
 * templates via the `PersonaBuildPlugin.frontmatterTemplates` property.
 *
 * Template rendering follows the same two-step sequence as body rendering:
 *   1. resolveConditionals() — resolve {{#if flag}} blocks
 *   2. resolveVariables()    — substitute {{varName}} markers
 *
 * No partials in frontmatter — frontmatter is kept deliberately simple.
 */

import { resolveConditionals } from '../engine/conditionals.js';
import { resolveVariables } from '../engine/variables.js';
import type { PersonaBuildPlugin } from '../plugins/types.js';
import type { TargetRegistry } from '../targets/registry.js';

// Default templates are owned by the targets layer; re-exported here so
// the public API surface (src/builders/index.ts) is unchanged.
import {
  DEFAULT_FRONTMATTER_VSCODE,
  DEFAULT_FRONTMATTER_CLAUDE_CODE,
  DEFAULT_FRONTMATTER_DEEP_AGENTS,
} from '../targets/types.js';
export { DEFAULT_FRONTMATTER_VSCODE, DEFAULT_FRONTMATTER_CLAUDE_CODE, DEFAULT_FRONTMATTER_DEEP_AGENTS };

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve frontmatter template precedence.
 *
 * Precedence order (highest wins):
 *   1. Plugin `frontmatterTemplates` — plugins are checked in registration
 *      order; the first plugin with a matching key wins.
 *   2. `configTemplates` — templates passed via `BuildConfig.frontmatter`
 *   3. Registry default — `TargetDefinition.defaultFrontmatter` for the target
 *   4. Library default (`DEFAULT_FRONTMATTER_VSCODE`) — safety fallback only
 *
 * @param target          The build target name (e.g. `'vscode'`, `'claude-code'`, or a custom target)
 * @param plugins         Registered plugins (searched in order; first match wins)
 * @param configTemplates Optional caller-supplied overrides from BuildConfig
 * @param registry        Optional TargetRegistry for resolving the built-in default template
 * @returns               The resolved template string
 */
export function resolveFrontmatterTemplate(
  target: string,
  plugins: PersonaBuildPlugin[],
  configTemplates?: Record<string, string>,
  registry?: TargetRegistry,
): string {
  // Check plugins in registration order — first plugin with a matching
  // frontmatterTemplates entry wins.
  for (const plugin of plugins) {
    if (plugin.frontmatterTemplates && target in plugin.frontmatterTemplates) {
      const tpl = plugin.frontmatterTemplates[target];
      if (tpl !== undefined) return tpl;
    }
  }

  // Caller-supplied config templates
  if (configTemplates && target in configTemplates) {
    const tpl = configTemplates[target];
    if (tpl !== undefined) return tpl;
  }

  // Registry default (covers all registered targets, including custom ones)
  if (registry && registry.has(target)) {
    return registry.get(target).defaultFrontmatter;
  }

  // Absolute fallback — should not be reached in normal usage
  return DEFAULT_FRONTMATTER_VSCODE;
}

// ---------------------------------------------------------------------------
// Frontmatter rendering
// ---------------------------------------------------------------------------

/**
 * Render a frontmatter template string against the given context.
 *
 * Applies the standard two-step template resolution:
 *   1. `resolveConditionals` — `{{#if flag}}` blocks
 *   2. `resolveVariables`    — `{{varName}}` substitution
 *
 * @param template  The raw frontmatter template string (may contain markers)
 * @param context   Key-value context for variable substitution
 * @param filename  Source filename used in warning messages
 * @returns         Rendered frontmatter string (ready to prepend to body)
 */
export function renderFrontmatter(
  template: string,
  context: Record<string, unknown>,
  filename: string,
): string {
  let rendered = resolveConditionals(template, context);
  rendered = resolveVariables(rendered, context, filename);
  return rendered;
}
