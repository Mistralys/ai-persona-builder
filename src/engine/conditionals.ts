/**
 * conditionals.ts
 *
 * Pure template-engine function for resolving conditional blocks.
 * Handles {{#if flag}}…{{/if}} and {{#if flag}}…{{else}}…{{/if}} syntax,
 * including nested {{#if}} blocks inside {{else}} branches.
 * No file-system I/O.
 */

/**
 * Resolve conditional blocks in a template string.
 *
 * Syntax:
 *   `{{#if flag}}content{{/if}}`
 *   `{{#if flag}}truthy-content{{else}}falsy-content{{/if}}`
 *
 * Nested conditionals inside `{{else}}` branches are supported:
 *   `{{#if a}}A{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}`
 *
 * Behaviour:
 * - When `context[flag]` is truthy: the delimiters are stripped and the
 *   content before `{{else}}` (or the entire inner block if no `{{else}}`)
 *   is kept, surrounded by single `\n` delimiters.
 * - When `context[flag]` is falsy and a `{{else}}` branch exists: the
 *   content after `{{else}}` is kept, surrounded by single `\n` delimiters.
 * - When `context[flag]` is falsy and no `{{else}}` branch exists: the
 *   entire block (including surrounding newlines) is removed, leaving a
 *   single `\n`.
 * - Unknown flags (absent from context) are treated as falsy.
 *
 * Leading and trailing newlines within the kept content are trimmed so the
 * output does not accumulate extra blank lines.
 *
 * Nesting algorithm: the regex matches only *innermost* blocks — those
 * whose content contains no further `{{#if` markers. The replacement loop
 * repeats until the output stabilises, resolving each nesting level in
 * depth-first (innermost-first) order. This avoids the closing `{{/if}}`
 * ambiguity that arises with non-greedy single-pass matching.
 *
 * @param text    - Template string potentially containing {{#if}} blocks
 * @param context - Key-value map used to evaluate flag truthiness
 * @returns       The template string with conditional blocks resolved
 */
export function resolveConditionals(
  text: string,
  context: Record<string, unknown>,
): string {
  // Match only innermost conditional blocks — those whose truthy and falsy
  // content contains no nested `{{#if`. The negative lookahead
  // `(?!\{\{#if\b)` ensures the quantifier stops before any nested opener,
  // so each pass resolves one depth level. Subsequent passes bubble outward
  // until the output stabilises (no more `{{#if` markers remain).
  const noNestedIf = String.raw`(?:(?!\{\{#if\b)[\s\S])*?`;
  const pattern = new RegExp(
    String.raw`\n*\{\{#if (\w+)\}\}(${noNestedIf})` +
      String.raw`(?:\{\{else\}\}(${noNestedIf}))?\{\{\/if\}\}\n*`,
    'g',
  );

  const resolve = (
    _match: string,
    flag: string,
    inner: string,
    elseInner: string | undefined,
  ): string => {
    if (context[flag]) {
      // Truthy: keep content before {{else}} (or entire inner if no {{else}})
      return '\n' + inner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n';
    }
    if (elseInner !== undefined) {
      // Falsy with {{else}}: keep content after {{else}}
      return '\n' + elseInner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n';
    }
    // Falsy without {{else}}: remove entire block
    return '\n';
  };

  let result = text;
  let prev: string;
  do {
    prev = result;
    result = result.replace(pattern, resolve);
  } while (result !== prev);
  return result;
}
