/**
 * partials.ts
 *
 * Pure template-engine function for resolving partial inclusions.
 * Supports {{> name}} syntax with up to depth-2 recursion to handle
 * partials-within-partials. No file-system I/O.
 */

/**
 * Resolve partial inclusions in a template string.
 *
 * Replaces `{{> name}}` markers with the content from `partialsMap`.
 * Recursion is capped at depth 2 so that:
 *   - depth 0 → 1: outer partials are expanded
 *   - depth 1 → 2: one level of nested partials are expanded
 *   - depth 2: recursion stops, marker is left as-is
 *
 * Each resolved partial is `trimEnd()`-ed to prevent trailing blank lines
 * from causing double-blank-line artefacts during concatenation.
 *
 * If a partial name is not found in `partialsMap`, the original marker is
 * preserved and a warning is emitted via `console.warn`.
 *
 * @param text       - Template string potentially containing {{> name}} markers
 * @param partialsMap - Map of partial name → partial content
 * @param depth      - Current recursion depth (callers should omit; defaults to 0)
 * @returns          The template string with partial markers replaced
 */
export function resolvePartials(
  text: string,
  partialsMap: Record<string, string>,
  depth = 0,
): string {
  if (depth >= 2) return text;
  return text.replace(/\{\{> ([\w-]+)\}\}/g, (match, name: string) => {
    if (!(name in partialsMap)) {
      console.warn(`[WARN] Partial not found: ${match}`);
      return match;
    }
    // Recursively resolve nested partials (depth + 1).
    // trimEnd() strips trailing whitespace to avoid extra blank lines.
    return resolvePartials(partialsMap[name], partialsMap, depth + 1).trimEnd();
  });
}
