/**
 * conditionals.ts
 *
 * Pure template-engine module for block-level tags: conditionals and
 * comments. Handles {{#if flag}}…{{/if}}, {{#if flag}}…{{else}}…{{/if}},
 * and {{#if flag}}…{{else if flag2}}…{{else}}…{{/if}} (chain) syntax,
 * including nested {{#if}} blocks inside any branch, plus the two
 * Handlebars comment forms {{!-- … --}} and {{! … }}. No file-system I/O.
 *
 * Implementation shape: a single linear tokenizer pass locates every
 * conditional and comment tag and records whether it is "standalone" (the
 * only non-whitespace content on its line, or — for a multi-line comment —
 * only whitespace before it on its first line and only whitespace after it
 * on its last line). A bracket-matching pass pairs each `{{#if}}` with its
 * `{{/if}}`, which also identifies unclosed openers.
 *
 * Two entry points share the tokenizer, each with one job:
 * - `resolveConditionals()` walks the tag list once, resolving each
 *   well-formed conditional block in place and leaving anything malformed
 *   — a stray `{{/if}}`, an `{{else}}`/`{{else if}}` outside a block, a
 *   second `{{else}}` in one block, an unclosed `{{#if}}`, or any comment
 *   tag — untouched as literal text. Nested blocks inside malformed or
 *   literal text still resolve, because the bracket-matching pass
 *   considers each `{{#if}}`/`{{/if}}` pair independently of its enclosing
 *   context.
 * - `stripComments()` removes only comment tags under the same
 *   standalone/inline/blank-run-merge whitespace contract, leaving
 *   conditional tags and all other text untouched. It is the only place
 *   comments are removed; `resolveConditionals()` does not recognise
 *   comment delimiters.
 */

/**
 * Matches a conditional tag — `{{#if NAME}}`, `{{else if NAME}}`,
 * `{{else}}`, or `{{/if}}`, where `NAME` is `\w+` — or a comment tag, in
 * either of its two forms:
 * - `{{!--…--}}`: ends at the first `--}}`, may contain `}}`, and may span
 *   lines. The negative lookahead on the short-form alternative is what
 *   keeps an *unterminated* long comment from ever being reinterpreted as
 *   a (wrongly closed) short one — if the lazy `--}}` search in the first
 *   alternative fails, the engine falls through to the second alternative
 *   at the same start position, and `(?!--)` makes that fall through fail
 *   too, so the whole match attempt fails and the unterminated `{{!--`
 *   is left as literal text, exactly like an unterminated `{{!`.
 * - `{{!…}}`: ends at the first `}}` (so it cannot contain a literal
 *   `}}`), and may span lines.
 *
 * A flag that does not match `\w+` (e.g. `{{#if a-b}}`) never matches this
 * pattern, so it is left untouched as ordinary text.
 * Hoisted to module level to avoid constructing a new `RegExp` on every
 * call. The manual `exec()` loop below always drains the pattern to
 * exhaustion (until it returns `null`), which resets `lastIndex` to `0`,
 * so the shared `g`-flag instance is safe for repeated, non-reentrant use.
 * @internal
 */
const TAG_PATTERN =
  /\{\{#if (\w+)\}\}|\{\{else if (\w+)\}\}|\{\{else\}\}|\{\{\/if\}\}|\{\{!--[\s\S]*?--\}\}|\{\{!(?!--)[\s\S]*?\}\}/g;

/**
 * A single recognised conditional or comment tag occurrence.
 * @internal
 */
interface Tag {
  /** Tag kind. `comment` covers both comment forms — they share whitespace
   * handling and neither carries a flag. */
  kind: 'if' | 'elseif' | 'else' | 'close' | 'comment';
  /** Flag name for `if` / `elseif` kinds; `undefined` otherwise. */
  flag: string | undefined;
  /** Raw match start offset in the source text. */
  start: number;
  /** Raw match end offset in the source text. */
  end: number;
  /** Whether this tag is the only non-whitespace content on its line. */
  standalone: boolean;
  /**
   * Effective start offset used when this tag is consumed as part of a
   * well-formed block: equals `start` for an inline tag, or the start of
   * its line for a standalone tag (so the line's leading whitespace is
   * removed with it).
   */
  effStart: number;
  /**
   * Effective end offset used when this tag is consumed as part of a
   * well-formed block: equals `end` for an inline tag, or just past its
   * line's terminating `\n` for a standalone tag (or end-of-line when the
   * line has no terminator).
   */
  effEnd: number;
}

/**
 * Determine whether the character range `[start, end)` is the only
 * non-whitespace content on its line in `text`, and compute the effective
 * start/end offsets to use if it is consumed as a standalone tag.
 * @internal
 */
function computeLinePlacement(
  text: string,
  start: number,
  end: number,
): Pick<Tag, 'standalone' | 'effStart' | 'effEnd'> {
  const prevNewline = start === 0 ? -1 : text.lastIndexOf('\n', start - 1);
  const lineStart = prevNewline + 1;
  const nextNewline = text.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;

  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  const standalone = /^[ \t]*$/.test(before) && /^[ \t]*$/.test(after);

  if (!standalone) {
    return { standalone, effStart: start, effEnd: end };
  }
  return {
    standalone,
    effStart: lineStart,
    effEnd: nextNewline === -1 ? text.length : nextNewline + 1,
  };
}

/**
 * Tokenize `text` into an ordered list of recognised conditional tags.
 * @internal
 */
function tokenize(text: string): Tag[] {
  const tags: Tag[] = [];
  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    let kind: Tag['kind'];
    let flag: string | undefined;
    if (match[1] !== undefined) {
      kind = 'if';
      flag = match[1];
    } else if (match[2] !== undefined) {
      kind = 'elseif';
      flag = match[2];
    } else if (match[0] === '{{else}}') {
      kind = 'else';
    } else if (match[0] === '{{/if}}') {
      kind = 'close';
    } else {
      kind = 'comment';
    }
    const placement = computeLinePlacement(text, start, end);
    tags.push({ kind, flag, start, end, ...placement });
  }
  return tags;
}

/**
 * For every `if` tag, find the index of its matching `close` tag using a
 * stack (bracket matching). `elseif`/`else` tags do not affect nesting
 * depth. An `if` left on the stack once every tag has been scanned is
 * unclosed, and its entry stays `null`. A `close` with nothing on the
 * stack is stray and is simply skipped.
 * @internal
 */
function computeMatchClose(tags: Tag[]): (number | null)[] {
  const matchClose: (number | null)[] = new Array(tags.length).fill(null);
  const stack: number[] = [];
  for (let idx = 0; idx < tags.length; idx++) {
    const tag = tags[idx];
    if (tag.kind === 'if') {
      stack.push(idx);
    } else if (tag.kind === 'close') {
      const openIdx = stack.pop();
      if (openIdx !== undefined) {
        matchClose[openIdx] = idx;
      }
    }
  }
  return matchClose;
}

/**
 * Render context shared by every recursive call of `renderRange()`.
 * @internal
 */
interface RenderState {
  text: string;
  tags: Tag[];
  matchClose: (number | null)[];
  context: Record<string, unknown>;
}

/**
 * Marker character substituted for a block that emits nothing (no branch
 * selected) or a removed comment. It cannot occur in template source, so a
 * single global regex pass can safely find and resolve every occurrence
 * afterwards. @see mergeMarkers
 * @internal
 */
const EMPTY_BLOCK_MARKER = '\0';

/**
 * Render the tag range `[tagLo, tagHi)` — restricted to the text range
 * `[textLo, textHi)` — resolving every well-formed `{{#if}}` block found at
 * this level and leaving everything else (stray dividers, unclosed
 * openers) as literal text. Nested `{{#if}}` blocks are skipped over in
 * bulk while scanning for a block's branch dividers, then rendered by a
 * recursive call scoped to the selected branch's own range.
 * @internal
 */
function renderRange(
  tagLo: number,
  tagHi: number,
  textLo: number,
  textHi: number,
  state: RenderState,
): string {
  const { text, tags, matchClose, context } = state;
  let pos = textLo;
  let out = '';
  let i = tagLo;

  while (i < tagHi) {
    const tag = tags[i];
    if (tag.kind !== 'if') {
      // Stray {{else}}/{{else if}}/{{/if}} with no enclosing block at this
      // level: literal text. Leave pos untouched; it is captured by the
      // next text slice below.
      i++;
      continue;
    }

    const closeIdx = matchClose[i];
    if (closeIdx === null || closeIdx >= tagHi) {
      // Unclosed within this range: literal open tag. The rest of this
      // range is still scanned normally, so any balanced block that
      // follows still resolves.
      i++;
      continue;
    }

    // Well-formed block. Emit the literal text preceding it, then resolve.
    out += text.slice(pos, tag.effStart);

    // Collect this block's branch boundaries: [ifTag, ...dividers, closeTag].
    // Nested `{{#if}}` blocks are skipped over via their own matchClose so
    // their internal dividers are never mistaken for this block's own.
    const boundaries: number[] = [i];
    let hasElse = false;
    let j = i + 1;
    while (j < closeIdx) {
      const inner = tags[j];
      if (inner.kind === 'if') {
        const innerClose = matchClose[j];
        j = innerClose === null ? j + 1 : innerClose + 1;
        continue;
      }
      if ((inner.kind === 'elseif' || inner.kind === 'else') && !hasElse) {
        boundaries.push(j);
        if (inner.kind === 'else') {
          hasElse = true;
        }
      }
      // A second {{else}}/{{else if}} once hasElse is true is left as
      // literal text embedded in the final branch's content — it is
      // simply never recorded as a boundary.
      j++;
    }
    boundaries.push(closeIdx);

    // Select the first branch whose flag is truthy, or the trailing
    // {{else}} branch if present.
    let selected = -1;
    for (let k = 0; k < boundaries.length - 1; k++) {
      const branchTag = tags[boundaries[k]];
      if (branchTag.kind === 'else' || (branchTag.flag !== undefined && context[branchTag.flag])) {
        selected = k;
        break;
      }
    }

    if (selected === -1) {
      out += EMPTY_BLOCK_MARKER;
    } else {
      const startTag = tags[boundaries[selected]];
      const endTag = tags[boundaries[selected + 1]];
      out += renderRange(
        boundaries[selected] + 1,
        boundaries[selected + 1],
        startTag.effEnd,
        endTag.effStart,
        state,
      );
    }

    pos = tags[closeIdx].effEnd;
    i = closeIdx + 1;
  }

  out += text.slice(pos, textHi);
  return out;
}

/**
 * Resolve every `EMPTY_BLOCK_MARKER` left by `renderRange()`. A **cluster**
 * — one or more markers where consecutive markers are separated only by a
 * whitespace-only line run (a zero-length gap, i.e. two markers with
 * nothing between them, also counts as "separated only by whitespace") —
 * resolves as a single replacement together with the blank-line runs
 * directly before the first marker and directly after the last. The
 * replacement is `'\n'.repeat(n)`, where `n` is the maximum newline count
 * across every run in the cluster (the leading run, every inter-marker run,
 * and the trailing run). A single marker is a cluster of one, so it keeps
 * merging its own before/after runs exactly as before. A cluster with no
 * newline anywhere in it — every run empty, e.g. two inline markers with
 * nothing but literal text around them — collapses to the empty string.
 *
 * A **kept** block's content breaks a cluster, because that content is not
 * a whitespace-only run: two empty blocks separated by a kept block each
 * resolve as their own one-marker cluster, so they are never merged across
 * the content between them.
 * @internal
 */
function mergeMarkers(text: string): string {
  return text.replace(
    /(?:[ \t]*\n)*(?:\0(?:[ \t]*\n)*)+/g,
    (match: string): string => {
      const countNewlines = (run: string): number => (run.match(/\n/g) ?? []).length;
      const maxNewlines = match
        .split('\0')
        .reduce((max, run) => Math.max(max, countNewlines(run)), 0);
      return '\n'.repeat(maxNewlines);
    },
  );
}

/**
 * Resolve conditional blocks in a template string.
 *
 * Syntax:
 *   `{{#if flag}}content{{/if}}`
 *   `{{#if flag}}truthy-content{{else}}falsy-content{{/if}}`
 *   `{{#if flag}}truthy-content{{else if flag2}}branch2{{else}}falsy-content{{/if}}`
 *
 * `{{else if}}` chains are handled natively — no pre-pass rewrite — and
 * combine transparently with traditional nested `{{#if}}` blocks inside any
 * branch.
 *
 * Whitespace contract:
 * - A **standalone** tag — the only non-whitespace content on its line —
 *   has its entire line, including the line's own trailing `\n`, removed.
 *   A tag on the last line with no trailing `\n` has just its line content
 *   removed; the newline that ends the previous line is never touched.
 * - An **inline** tag — sharing its line with other content — has only its
 *   own characters removed. The rest of the line is untouched.
 * - The content of a **selected** branch is kept exactly as written,
 *   including any blank lines at its edges: they add to whatever blank-line
 *   run sits outside the block, they are never merged away.
 * - When a block selects **no** branch (every flag falsy and no trailing
 *   `{{else}}`), or a selected branch renders to nothing, the block itself
 *   emits nothing. If that leaves a blank-line run directly above and
 *   another directly below, the two merge into the longer run rather than
 *   adding together — so a removed block sitting between two paragraphs
 *   leaves exactly one paragraph break. This merge applies at any nesting
 *   depth, so a nested block emitting nothing inside a kept outer branch
 *   still merges its own surrounding runs.
 * - **Adjacent removals merge as one.** Two or more emits-nothing blocks
 *   separated only by whitespace-only lines (including no gap at all) form
 *   a single cluster: the blank-line runs before the first block, between
 *   every pair, and after the last all merge into one run — the longest of
 *   them — rather than each block merging independently and the leftover
 *   runs adding together. A block whose branch keeps real content breaks
 *   the cluster, so emits-nothing blocks on either side of a kept block
 *   never merge across it.
 *
 * Malformed input is left untouched, exactly as before: a stray `{{/if}}`
 * with no open block, an `{{else}}`/`{{else if}}` outside any block, an
 * unclosed `{{#if}}` (though any balanced block nested inside it still
 * resolves), a second `{{else}}`/`{{else if}}` once a block already has a
 * plain `{{else}}` (kept as literal text of the final branch), and a flag
 * that does not match `\w+` all pass through as plain text.
 *
 * Unknown flags (absent from context) are treated as falsy. Truthiness is
 * ordinary JS truthiness of `context[flag]`.
 *
 * @param text    - Template string potentially containing {{#if}} blocks
 * @param context - Key-value map used to evaluate flag truthiness
 * @returns       The template string with conditional blocks resolved
 */
export function resolveConditionals(
  text: string,
  context: Record<string, unknown>,
): string {
  const tags = tokenize(text);
  if (tags.length === 0) {
    return text;
  }
  const matchClose = computeMatchClose(tags);
  const state: RenderState = { text, tags, matchClose, context };
  const rendered = renderRange(0, tags.length, 0, text.length, state);
  return mergeMarkers(rendered);
}

/**
 * Remove template comments from a template string.
 *
 * Syntax (both forms are recognised; neither has an escape form):
 *   `{{!-- comment --}}` — ends at the first `--}}`. May span lines and may
 *   contain a literal `}}`, so it is the only safe form for a note that
 *   itself mentions template syntax.
 *   `{{! comment }}` — ends at the first `}}`. May span lines but cannot
 *   contain a literal `}}`.
 *
 * This is the only place comments are removed: `resolveConditionals()`
 * does not recognise comment delimiters, so a direct caller that wants
 * both resolved must call `stripComments()` first.
 *
 * Whitespace contract (shared with conditional tags):
 * - A **standalone** comment — the only non-whitespace content on its
 *   line (or, for a multi-line comment, only whitespace before it on its
 *   first line and only whitespace after it on its last line) — has its
 *   entire line span removed, including the final line terminator. A
 *   comment on the last line with no trailing `\n` has just its line
 *   content removed.
 * - An **inline** comment — sharing a line with other content — has only
 *   its own characters removed. The rest of the line is untouched.
 * - **Blank-run merge:** where removing a standalone comment leaves a
 *   blank-line run directly above and another directly below, the two
 *   merge into the longer run instead of adding together, exactly as for
 *   a conditional block that emits nothing.
 * - **Adjacent removals merge as one.** Two or more standalone comments
 *   separated only by whitespace-only lines (including no gap at all) form
 *   a single cluster, merging into one longest run across every blank-line
 *   run in the cluster — the same adjacent-removal contract
 *   `resolveConditionals()` documents for emits-nothing blocks, since both
 *   entry points share `mergeMarkers()`.
 *
 * Any tag or template syntax written inside a comment (a partial,
 * conditional, or variable reference) is inert: it is removed along with
 * the comment and never separately recognised. An unterminated `{{!--` or
 * `{{!` (no closing delimiter before end of input) passes through as
 * literal text, exactly like a malformed conditional tag.
 *
 * @param text - Template string potentially containing comment tags
 * @returns    The template string with comment tags removed
 */
export function stripComments(text: string): string {
  const tags = tokenize(text).filter((tag) => tag.kind === 'comment');
  if (tags.length === 0) {
    return text;
  }
  let out = '';
  let pos = 0;
  for (const tag of tags) {
    out += text.slice(pos, tag.effStart);
    out += EMPTY_BLOCK_MARKER;
    pos = tag.effEnd;
  }
  out += text.slice(pos);
  return mergeMarkers(out);
}
