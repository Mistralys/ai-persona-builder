/**
 * conditionals.ts
 *
 * Pure template-engine function for resolving conditional blocks.
 * Handles {{#if flag}}…{{/if}}, {{#if flag}}…{{else}}…{{/if}}, and
 * {{#if flag}}…{{else if flag2}}…{{else}}…{{/if}} (chain) syntax,
 * including nested {{#if}} blocks inside {{else}} branches.
 * No file-system I/O.
 */

/**
 * Negative-lookahead fragment that matches any character sequence containing
 * no `{{#if` opener. Used as a shared building-block in the regex patterns of
 * both `resolveElseIf` and `resolveConditionals` so the two guards stay in sync.
 * @internal
 */
const NO_NESTED_IF = String.raw`(?:(?!\{\{#if\b)[\s\S])*?`;

/**
 * Matches `{{else if flag}}…{{/if}}` segments whose content contains no
 * nested `{{#if` opener. Hoisted to module level to avoid constructing a new
 * `RegExp` object on every `resolveElseIf()` call.
 * `String.prototype.replace()` resets `lastIndex` to 0 before each call, so
 * the shared `g`-flag instance is safe for repeated use.
 * @internal
 */
const ELSE_IF_PATTERN = new RegExp(
  String.raw`\{\{else if (\w+)\}\}(${NO_NESTED_IF})\{\{\/if\}\}`,
  'g',
);

/**
 * Pre-process `{{else if flag}}` chains by rewriting each innermost
 * occurrence into an equivalent nested `{{else}}{{#if flag}}` block.
 *
 * Examples:
 *   `{{#if a}}A{{else if b}}B{{else}}C{{/if}}`
 *   → `{{#if a}}A{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}`
 *
 * Multi-level chains are normalised iteratively, one level per pass:
 *   `{{#if a}}A{{else if b}}B{{else if c}}C{{/if}}`
 *   pass 1 → `{{#if a}}A{{else}}{{#if b}}B{{else if c}}C{{/if}}{{/if}}`
 *   pass 2 → `{{#if a}}A{{else}}{{#if b}}B{{else}}{{#if c}}C{{/if}}{{/if}}{{/if}}`
 *
 * The pattern matches only segments whose content contains no nested
 * `{{#if` markers, mirroring the innermost-first invariant of
 * `resolveConditionals`. This ensures `{{else if}}` chains that are
 * themselves nested inside outer `{{#if}}…{{else}}…{{/if}}` blocks are
 * handled safely.
 *
 * @internal
 */
function resolveElseIf(text: string): string {
  if (!text.includes('{{else if ')) {
    return text;
  }
  // Use the module-level ELSE_IF_PATTERN constant. replace() resets the
  // regex's lastIndex before each call, so sharing the instance is safe.
  let result = text;
  let prev: string;
  do {
    prev = result;
    result = result.replace(
      ELSE_IF_PATTERN,
      (_match: string, flag: string, content: string): string =>
        `{{else}}{{#if ${flag}}}${content}{{/if}}{{/if}}`,
    );
  } while (result !== prev);
  return result;
}

/**
 * Resolve conditional blocks in a template string.
 *
 * Syntax:
 *   `{{#if flag}}content{{/if}}`
 *   `{{#if flag}}truthy-content{{else}}falsy-content{{/if}}`
 *   `{{#if flag}}truthy-content{{else if flag2}}branch2{{else}}falsy-content{{/if}}`
 *
 * Nested conditionals inside `{{else}}` branches are supported:
 *   `{{#if a}}A{{else}}{{#if b}}B{{else}}C{{/if}}{{/if}}`
 *
 * `{{else if}}` chains are normalised into nested `{{#if}}` blocks before
 * resolution, so they work transparently alongside — and can be combined
 * with — traditional nested `{{#if}}` syntax.
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
  // Normalise {{else if}} chains into nested {{else}}{{#if}} blocks so the
  // existing innermost-first resolution loop handles them transparently.
  const normalized = resolveElseIf(text);

  // Match only innermost conditional blocks — those whose truthy and falsy
  // content contains no nested `{{#if`. The negative lookahead
  // `(?!\{\{#if\b)` ensures the quantifier stops before any nested opener,
  // so each pass resolves one depth level. Subsequent passes bubble outward
  // until the output stabilises (no more `{{#if` markers remain).
  const pattern = new RegExp(
    String.raw`\n*\{\{#if (\w+)\}\}(${NO_NESTED_IF})` +
      String.raw`(?:\{\{else\}\}(${NO_NESTED_IF}))?\{\{\/if\}\}\n*`,
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

  let result = normalized;
  let prev: string;
  do {
    prev = result;
    result = result.replace(pattern, resolve);
  } while (result !== prev);
  return result;
}
