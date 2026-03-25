/**
 * src/plugins/ledger/role-validator.ts
 *
 * Validation helpers for the ledger plugin.
 *
 * Two validators are provided:
 *
 *   - `validateRole`        — checks that a persona's role field is present in
 *                             the project's workflow manifest role list.
 *   - `validateNoteOnlyGuard` — asserts that MCP tools flagged `note_only: true`
 *                               do not appear in the rendered persona output.
 *
 * Both functions are pure (no I/O, no side effects) and return
 * `ValidationResult[]` compatible with the plugin `onValidate` hook.
 */

import type { ValidationResult } from '../types.js';
import type { McpToolEntry } from './mcp-tools-renderer.js';

// ---------------------------------------------------------------------------
// validateRole
// ---------------------------------------------------------------------------

/**
 * Validate that a persona's `role` field is present in the workflow manifest.
 *
 * In the ledger suite each persona carries a `role` that must correspond to
 * one of the canonical agent roles defined in `shared/workflow-manifest.json`.
 * This guard prevents typos or outdated role names from silently reaching
 * generated output.
 *
 * @param role           The role string from the persona YAML (may be undefined
 *                       for non-ledger personas — pass `undefined` to skip)
 * @param manifestRoles  Set or array of valid role names from the manifest
 * @returns              Empty array when the role is valid or absent; a single
 *                       warning-level `ValidationResult` when the role is not
 *                       found in `manifestRoles`
 *
 * @example
 * validateRole('Developer', ['Planner', 'Developer', 'QA'])
 * // => []
 *
 * validateRole('Coder', ['Planner', 'Developer', 'QA'])
 * // => [{ severity: 'warning', message: 'Role "Coder" is not in the workflow manifest. ...' }]
 *
 * validateRole(undefined, ['Planner', 'Developer'])
 * // => []  (role absent — not a ledger persona)
 */
export function validateRole(
  role: string | undefined,
  manifestRoles: ReadonlyArray<string> | ReadonlySet<string>,
): ValidationResult[] {
  // Non-ledger personas (standalone, etc.) have no role field — skip silently.
  if (role === undefined) return [];

  const roleSet: ReadonlySet<string> =
    manifestRoles instanceof Set
      ? manifestRoles
      : new Set(manifestRoles);

  if (roleSet.has(role)) return [];

  const known = [...roleSet].join(', ');
  return [
    {
      severity: 'warning',
      message:
        `Role "${role}" is not in the workflow manifest. ` +
        `Known roles: ${known}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// validateNoteOnlyGuard
// ---------------------------------------------------------------------------

/**
 * Assert that no `note_only: true` MCP tools appear in the rendered output.
 *
 * Tools marked `note_only` are documentation annotations that must be
 * filtered out by `renderMcpToolsTable()`. This guard provides a second-line
 * defence: even if the renderer is bypassed or misconfigured, the validator
 * will flag any leakage of internal-only tooling into published persona files.
 *
 * Detection method mirrors the `--check` mode in `build-personas.js`:
 * it searches for the Markdown table pattern `| \`toolName\` |` in the
 * rendered output string.
 *
 * @param output     The fully-rendered persona output string (frontmatter + body)
 * @param mcpTools   The persona's `mcp_tools` array (may be undefined or empty)
 * @returns          Empty array when no violations are found; one error-level
 *                   `ValidationResult` per leaking tool name
 *
 * @example
 * validateNoteOnlyGuard('| `internal_tool` | does stuff |', [
 *   { tool: 'internal_tool', purpose: 'Internal', note_only: true },
 * ])
 * // => [{ severity: 'error', message: 'note_only tool "internal_tool" appears in rendered output.' }]
 */
export function validateNoteOnlyGuard(
  output: string,
  mcpTools: ReadonlyArray<McpToolEntry> | undefined,
): ValidationResult[] {
  if (!mcpTools || mcpTools.length === 0) return [];

  const violations: ValidationResult[] = [];

  for (const entry of mcpTools) {
    if (!entry.note_only) continue;

    // Match the Markdown table cell pattern: | `toolName` |
    const pattern = new RegExp(`\\|\\s*\`${escapeRegExp(entry.tool)}\`\\s*\\|`);
    if (pattern.test(output)) {
      violations.push({
        severity: 'error',
        message: `note_only tool "${entry.tool}" appears in rendered output.`,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe use inside a `new RegExp(...)` constructor.
 * Escapes all regex special characters.
 *
 * @param str  Raw string to escape
 * @returns    String with all special regex characters escaped
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
