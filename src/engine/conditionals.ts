/**
 * conditionals.ts
 *
 * Pure template-engine function for resolving conditional blocks.
 * Handles {{#if flag}}…{{/if}} and {{#if flag}}…{{else}}…{{/if}} syntax.
 * No file-system I/O.
 */

/**
 * Resolve conditional blocks in a template string.
 *
 * Syntax:
 *   `{{#if flag}}content{{/if}}`
 *   `{{#if flag}}truthy-content{{else}}falsy-content{{/if}}`
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
 * @param text    - Template string potentially containing {{#if}} blocks
 * @param context - Key-value map used to evaluate flag truthiness
 * @returns       The template string with conditional blocks resolved
 */
export function resolveConditionals(
  text: string,
  context: Record<string, unknown>,
): string {
  return text.replace(
    /\n*\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}\n*/g,
    (
      _match: string,
      flag: string,
      inner: string,
      elseInner: string | undefined,
    ) => {
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
    },
  );
}
