# Bug Report: Conditional blocks remove the blank lines around them

**Date:** 2026-09-30
**Component:** `src/engine/conditionals.ts` — `resolveConditionals()`
**Affected versions:** 2.6.0 (published, installed by `ai-insights`) and `main` at `be00286`. The file is identical in both.
**Found in:** `ai-insights`, while reviewing the rendered AGENTS.md Curator persona.

## Summary

A `{{#if}}…{{/if}}` block swallows every newline on both sides of it and puts back exactly one. A blank line in the source before or after a block therefore disappears from the output. The two paragraphs on either side of the block run together into one Markdown paragraph.

Headings and `---` rules hide the problem in most places, because `ensureBlankLineBeforeHeadings()` re-inserts blank lines before them. Plain paragraphs get no such repair.

## Reproduction

Against the installed 2.6.0 `dist/index.cjs`:

```js
const { resolveConditionals: r } = require('@mistralys/persona-builder');

r('Para one.\n\n{{#if a}}\nInside.\n{{/if}}\n\nPara two.', { a: true });
// → "Para one.\nInside.\nPara two."

r('Para one.\n\n{{#if a}}\nX\n{{else}}\nY\n{{/if}}\n\nPara two.', { a: false });
// → "Para one.\nY\nPara two."

r('Intro:\n\n{{#if a}}\nA\n{{else if b}}\nB\n{{else}}\nC\n{{/if}}\n\nOutro.', { b: true });
// → "Intro:\nB\nOutro."
```

**Expected** for the first case: `"Para one.\n\nInside.\n\nPara two."`. The blank lines the author wrote are kept.

## Root cause

The block pattern matches any number of newlines on either side, and the replacement returns single newlines:

```ts
String.raw`\n*\{\{#if (\w+)\}\}(${NO_NESTED_IF})` +
  String.raw`(?:\{\{else\}\}(${NO_NESTED_IF}))?\{\{\/if\}\}\n*`
// truthy:  '\n' + inner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n'
// else:    '\n' + elseInner.replace(/^\n+/, '').replace(/\n+$/, '') + '\n'
// removed: '\n'
```

The JSDoc describes this as intended ("surrounded by single `\n` delimiters"), so that no extra blank lines pile up. The trade-off throws away the author's paragraph breaks along with the surplus.

## Real-world impact

In `ai-insights`, the shared partial `personas/shared/partials/documentation-ownership.md` has blank lines in all the right places. It renders three pairs of paragraphs joined together in each of the three personas that include it:

- "…every other row is a handoff target." runs into "**Acting on a finding.** …"
- "Dispatch works like this:" runs into "Use the `Task` tool…"
- "Use the `Task` tool…" runs into "Read what the agent returns…"

Across `ai-insights`, 84 places in 17 source files have a blank line directly next to a conditional tag. This count is a regex scan of the partials and content files. Each of those places loses its blank line in every build.

## Related defect: inline conditionals break the line

The same replacement adds newlines around content that sits in the middle of a line:

```js
r('Use the {{#if a}}Task{{else}}task{{/if}} tool.', { a: true });
// → "Use the \nTask\n tool."
```

`ai-insights` uses no inline conditionals today, so nothing there is visibly affected. The fix touches the same code, so it's worth handling in the same pass.

## Nesting

Inner blocks resolve first, so blank lines inside an outer branch are lost as well:

```js
r('{{#if o}}\nRO\n{{else}}\nIntro:\n\n{{#if t}}\nT\n{{/if}}\n\nAfter.\n{{/if}}', { o: false, t: true });
// → "\nIntro:\nT\nAfter.\n"
```

## Behaviour to keep

- **A removed block leaves a single paragraph break.** With `Para one.\n\n{{#if a}}…{{/if}}\n\nPara two.` and `a` false, the output should be `Para one.\n\nPara two.`, not two blank lines. The current `"Para one.\nPara two."` is wrong only because the break is gone.
- **Source without blank lines stays tight.** `"Line one.\n{{#if a}}\nInside.\n{{/if}}\nLine two."` currently renders as `"Line one.\nInside.\nLine two."`, which is correct. Tables and lists inside conditionals rely on this.
- **Nested `{{else}}` output matches flat output.** Test `preserves whitespace symmetry: nested else output equals flat else output` in `tests/engine/conditionals.test.ts` asserts this.
- **`collapseBlankLines()`** in `postProcessor.ts` still caps runs of blank lines, so the fix does not need to prevent surplus blank lines on its own.

## Verification in a downstream project

After the fix, rebuild `ai-insights` against a local link to the builder (`node scripts/build-personas.js`) and diff the rendered persona directories against the current output. The expected diff is blank lines added wherever the source has one next to a conditional, and nothing else. The three joined pairs in `documentation-ownership.md` are the known cases to check by eye.

## Repository note

The `v2.6.0` tag (`52f1e63`, 2026-06-14) is not on any branch. Local `main` (`be00286`) reports itself as `v2.5.1-11` and still has `2.5.1` in `package.json`. `conditionals.ts` is identical in both, so the fix does not depend on the base. The versioning of the release that ships it probably does.
