/**
 * src/builders/frontmatter.ts
 *
 * Frontmatter template registry for @smor/persona-build.
 *
 * Ships two minimal default templates — one per target — that work for the
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

// ---------------------------------------------------------------------------
// Built-in default templates
// ---------------------------------------------------------------------------

/**
 * Default VS Code frontmatter template.
 *
 * Minimal fields that work for standalone personas.  Projects using numbered
 * workflows (e.g. ledger) should inject a richer template via a plugin.
 */
export const DEFAULT_FRONTMATTER_VSCODE = `---
name: '{{name}} v{{version}}'
description: '{{description}}'
tools: [{{tools_list}}]
---`;

/**
 * Default Claude Code frontmatter template.
 *
 * Minimal fields that work for standalone personas.  Projects using numbered
 * workflows should inject a richer template via a plugin.
 */
export const DEFAULT_FRONTMATTER_CLAUDE_CODE = `---
name: {{cc_file_name_stem}}
permissionMode: {{cc_permission_mode}}
model: {{cc_model}}
memory: {{cc_memory}}
allowedTools: [{{cc_tools_list}}]
---`;

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve frontmatter template precedence.
 *
 * Precedence order (highest wins):
 *   1. Plugin `frontmatterTemplates` — the last plugin with a matching key
 *      wins (plugins are applied in reverse-registration order so the
 *      *first* registered plugin with a template takes precedence over later
 *      ones, matching the general plugin-chain contract).
 *   2. `configTemplates` — templates passed via `BuildConfig.frontmatter`
 *   3. Library defaults (`DEFAULT_FRONTMATTER_VSCODE` / `DEFAULT_FRONTMATTER_CLAUDE_CODE`)
 *
 * @param target          The build target ('vscode' | 'claude-code')
 * @param plugins         Registered plugins (searched in order; first match wins)
 * @param configTemplates Optional caller-supplied overrides from BuildConfig
 * @returns               The resolved template string
 */
export function resolveFrontmatterTemplate(
  target: 'vscode' | 'claude-code',
  plugins: PersonaBuildPlugin[],
  configTemplates?: Partial<Record<'vscode' | 'claude-code', string>>,
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

  // Library defaults
  return target === 'vscode' ? DEFAULT_FRONTMATTER_VSCODE : DEFAULT_FRONTMATTER_CLAUDE_CODE;
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
