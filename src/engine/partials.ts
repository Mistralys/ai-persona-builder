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
 * @param depth      - **Internal recursion counter — callers must always omit this
 *                     parameter.** It exists solely so the function can track its own
 *                     nesting level across recursive calls. Passing a non-zero value
 *                     bypasses the depth guard (e.g. `resolvePartials(text, map, 5)`
 *                     expands nothing). This parameter will be removed from the public
 *                     signature and marked `@internal` in a future release.
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

/**
 * Collect the names of every partial a template transitively references,
 * without resolving or rendering anything.
 *
 * Mirrors `resolvePartials()` exactly — same `{{> name}}` regex, same
 * depth-2 recursion cap — so a caller can ask "would the renderer expand
 * this partial?" and get the same answer the renderer itself would give.
 * This matters for validators (e.g. a `ToolRequirement`'s `partial` trigger)
 * that need to detect a partial reference without actually rendering the
 * template: a single-level regex against raw content would miss a partial
 * only reachable through one level of nesting, and would also "see" a
 * partial buried past the depth cap that the renderer would never expand.
 *
 * A referenced name is recorded whether or not it exists in `partialsMap` —
 * this reports what the template *asks for*, not what successfully
 * resolves. An unknown name is simply not recursed into (there is nothing to
 * recurse into), matching `resolvePartials()`'s behaviour of leaving an
 * unresolvable marker as-is rather than expanding it further.
 *
 * @param text        Template string potentially containing {{> name}} markers.
 * @param partialsMap  Map of partial name → partial content, used to recurse
 *                     into a referenced partial's own body.
 * @returns            The set of every partial name referenced, directly or
 *                     via one level of nesting (depth 0 → 1 → 2, same cap as
 *                     `resolvePartials()`).
 */
export function collectPartialReferences(
  text: string,
  partialsMap: Record<string, string>,
): Set<string> {
  const found = new Set<string>();
  collectPartialReferencesAtDepth(text, partialsMap, 0, found);
  return found;
}

/**
 * Internal recursive worker for `collectPartialReferences()`.
 *
 * @param text        Template string to scan for `{{> name}}` markers.
 * @param partialsMap  Map of partial name → partial content.
 * @param depth       Current recursion depth (0 at the top level).
 * @param found       Accumulator set, mutated in place across the recursion.
 */
function collectPartialReferencesAtDepth(
  text: string,
  partialsMap: Record<string, string>,
  depth: number,
  found: Set<string>,
): void {
  if (depth >= 2) return;

  const pattern = /\{\{> ([\w-]+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    found.add(name);

    if (name in partialsMap) {
      collectPartialReferencesAtDepth(partialsMap[name], partialsMap, depth + 1, found);
    }
  }
}
