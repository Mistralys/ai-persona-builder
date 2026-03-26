/**
 * src/utils/regex.ts
 *
 * Shared regex utilities.
 *
 * Pure functions — no I/O, no side effects.
 */

/**
 * Escape a string for safe use inside a `new RegExp(...)` constructor.
 * Escapes all regex special characters.
 *
 * @param str  Raw string to escape
 * @returns    String with all special regex characters escaped
 *
 * @example
 * escapeRegExp('tool.name+extra')
 * // => 'tool\\.name\\+extra'
 *
 * new RegExp(`\\|\\s*\`${escapeRegExp(toolName)}\`\\s*\\|`)
 * // Safe regex that matches | `<toolName>` | in rendered Markdown tables
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
