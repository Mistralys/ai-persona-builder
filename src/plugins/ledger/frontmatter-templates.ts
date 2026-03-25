/**
 * src/plugins/ledger/frontmatter-templates.ts
 *
 * Ledger-suite frontmatter template strings, ported from
 * `scripts/build-personas.js` in ai-insights-dev.
 *
 * Two templates are defined — one for each supported output target:
 *   - FRONTMATTER_LEDGER_VSCODE   → VS Code instruction files
 *   - FRONTMATTER_LEDGER_CC       → Claude Code instruction files
 *
 * Template variables ({{varName}}) and conditionals ({{#if flag}}...{{/if}})
 * are resolved by the library's template engine at build time.
 *
 * These templates are structurally identical to the originals; the only
 * differences from the JavaScript source are:
 *   1. `ccFrontmatterFields()` has been inlined rather than interpolated via
 *      a function call — the rendered output is byte-identical.
 *   2. Both templates are exported as typed `string` constants so downstream
 *      TypeScript code can import them without type-casting.
 *
 * @see build-personas.js — `FRONTMATTER_LEDGER_VSCODE`, `FRONTMATTER_LEDGER_CC`,
 *      `ccFrontmatterFields()` (source of truth for structural equivalence)
 */

// ---------------------------------------------------------------------------
// Shared CC fields helper (inlined constant — see module doc)
// ---------------------------------------------------------------------------

/**
 * Shared Claude Code frontmatter fields used by the ledger CC template.
 *
 * Mirrors the return value of `ccFrontmatterFields()` from build-personas.js.
 * Defined as a named constant to make the inlining explicit and keep the
 * template strings readable.
 *
 * @note Intentionally monomorphic — see the equivalent JSDoc note in
 * build-personas.js §ccFrontmatterFields for the reasoning.
 */
const CC_FRONTMATTER_FIELDS =
  `permissionMode: {{cc_permission_mode}}
model: '{{cc_model}}'
memory: {{cc_memory}}`;

// ---------------------------------------------------------------------------
// Ledger frontmatter templates
// ---------------------------------------------------------------------------

/**
 * VS Code frontmatter template for the ledger persona suite.
 *
 * Includes the `id:` field added in WP-002 of the previous plan cycle;
 * the remaining fields are the pre-WP-002 baseline.
 *
 * Used when `target === 'vscode'` and `suite === 'ledger'`.
 */
export const FRONTMATTER_LEDGER_VSCODE: string = `---
id: {{id}}
name: '{{number}} - {{role}} v{{version}}'
description: 'Step {{number}}/{{total}} in the agent workflow.'
model: '{{model}}'
role: {{role}}
author: {{author}}
version: {{version}}
last_updated: {{last_updated}}
vs_file_name: {{vs_file_name}}
tools: {{tools_json}}
---`;

/**
 * Claude Code frontmatter template for the ledger persona suite.
 *
 * The `mcpServers` block is conditionally included — it appears only when
 * the `has_mcp` context variable is truthy.
 *
 * Used when `target === 'claude-code'` and `suite === 'ledger'`.
 */
export const FRONTMATTER_LEDGER_CC: string = `---
name: {{cc_name}}
description: '{{cc_description}}'
role: {{role}}
author: {{author}}
version: {{version}}
last_updated: {{last_updated}}
tools: {{cc_tools_json}}
${CC_FRONTMATTER_FIELDS}
{{#if has_mcp}}
mcpServers:
  - {{mcp_server_name}}
{{/if}}
---`;
