/**
 * src/plugins/ledger/mcp-tools-renderer.ts
 *
 * Renders the MCP tools array as Markdown table rows.
 *
 * Ported from scripts/lib/persona-helpers.js `renderMcpToolsTable()`.
 * No file-system I/O, no side effects — pure function.
 *
 * Important: entries flagged with `note_only: true` are intentionally
 * excluded from the rendered output. These are internal-documentation-only
 * tools that must not appear in published persona files.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single MCP tool entry as declared in a persona YAML `mcp_tools` field.
 */
export interface McpToolEntry {
  /** Tool identifier as used in the MCP server */
  tool: string;
  /** Human-readable description of what the tool does */
  purpose: string;
  /**
   * When true, this entry is included in documentation notes only and must
   * NOT appear in the rendered persona output.
   */
  note_only?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the MCP tools array as Markdown table rows.
 *
 * Each visible tool is formatted as:
 * ```
 * | `{tool}` | {purpose} |
 * ```
 * Entries with `note_only: true` are filtered out and will not appear in
 * the output — this prevents internal-only tooling from being surfaced in
 * published persona documents.
 *
 * Output is structurally identical to the JS original in `persona-helpers.js`.
 *
 * @param tools  Array of MCP tool entries from the persona YAML `mcp_tools` field
 * @returns      Newline-joined Markdown table row string (empty string when all
 *               entries are filtered out or the array is empty)
 *
 * @example
 * renderMcpToolsTable([
 *   { tool: 'ledger_get_status', purpose: 'Read project status' },
 *   { tool: 'internal_tool',    purpose: 'Internal use only', note_only: true },
 * ])
 * // => "| `ledger_get_status` | Read project status |"
 */
export function renderMcpToolsTable(tools: McpToolEntry[]): string {
  return tools
    .filter((t) => !t.note_only)
    .map((t) => `| \`${t.tool}\` | ${t.purpose} |`)
    .join('\n');
}
