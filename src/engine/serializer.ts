/**
 * serializer.ts
 *
 * Pure serializer functions for converting tool lists to YAML-compatible
 * string representations. No file-system I/O.
 */

/**
 * Serialize a tools array in YAML single-quote flow format WITH outer brackets.
 *
 * Output format: `['tool1', 'tool2', 'tool3']`
 * Used by the ledger suite to preserve byte-identical frontmatter output.
 *
 * @param tools - Array of tool name strings
 * @returns     YAML flow-sequence string including outer brackets
 *
 * @example
 * serializeTools(['Bash', 'Read']) // => "['Bash', 'Read']"
 * serializeTools([])              // => "[]"
 */
export function serializeTools(tools: string[]): string {
  return '[' + tools.map((t) => `'${t}'`).join(', ') + ']';
}

/**
 * Serialize a tools array in YAML single-quote flow format WITHOUT outer brackets.
 *
 * Output format: `'tool1', 'tool2', 'tool3'`
 * Used inside standalone frontmatter templates which supply the surrounding `[ ]`.
 *
 * @param tools - Array of tool name strings
 * @returns     Comma-separated quoted tool names (no outer brackets)
 *
 * @example
 * serializeToolsList(['Bash', 'Read']) // => "'Bash', 'Read'"
 * serializeToolsList([])              // => ""
 */
export function serializeToolsList(tools: string[]): string {
  return tools.map((t) => `'${t}'`).join(', ');
}
