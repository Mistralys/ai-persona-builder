/**
 * variables.ts
 *
 * Pure template-engine function for resolving variable substitutions.
 * Handles {{varName}} substitution and \{{varName}} escape syntax. No file-system I/O.
 */

/**
 * Resolve variable substitutions in a template string.
 *
 * Replaces `{{varName}}` markers with `String(context[varName])`.
 * If a variable is not found in `context` (or its value is `undefined`),
 * the original marker is preserved and a warning is emitted via
 * `console.warn`, identifying the file by `filename` for easier debugging.
 *
 * **Escape syntax:** prefix a marker with a backslash (`\{{varName}}`) to
 * emit the literal `{{varName}}` text in the output without performing any
 * lookup or triggering an unresolved-variable warning.
 *
 * Note: this step must run AFTER `resolvePartials` and `resolveConditionals`
 * so that only plain variable markers remain.
 *
 * @param text     - Template string potentially containing {{varName}} markers
 * @param context  - Key-value map of variable name → value
 * @param filename - Identifier used in warning messages (e.g. persona file path)
 * @returns        The template string with variable markers substituted
 */
export function resolveVariables(
  text: string,
  context: Record<string, unknown>,
  filename: string,
): string {
  return text.replace(/(\\?)\{\{(\w+)\}\}/g, (match, escape: string, varName: string) => {
    if (escape === '\\') {
      return `{{${varName}}}`;
    }
    if (varName in context && context[varName] !== undefined) {
      return String(context[varName]);
    }
    console.warn(`[WARN] Unresolved variable: ${match} in ${filename}`);
    return match;
  });
}
