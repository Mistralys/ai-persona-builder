/**
 * postProcessor.ts
 *
 * Pure post-processing functions for cleaning up rendered persona output.
 * All functions are side-effect-free and operate only on strings.
 * No file-system I/O.
 */

/**
 * Collapse 3 or more consecutive blank lines into 2 blank lines.
 *
 * Specifically converts 4 or more consecutive `\n` characters into `\n\n\n`
 * (which equals 2 blank lines between paragraphs).
 *
 * @param text - Rendered output string
 * @returns    String with excessive blank lines collapsed
 */
export function collapseBlankLines(text: string): string {
  return text.replace(/\n{4,}/g, '\n\n\n');
}

/**
 * Ensure every Markdown heading has a blank line immediately before it.
 *
 * Also ensures horizontal rules (`---`) have a blank line before and after
 * them. This corrects spacing gaps caused by partial concatenation where
 * `trimEnd()` strips trailing newlines and conditionals add only a single
 * `\n` delimiter.
 *
 * @param text - Rendered output string
 * @returns    String with blank lines inserted before headings and rules
 */
export function ensureBlankLineBeforeHeadings(text: string): string {
  // Blank line before headings
  let result = text.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  // Blank line before horizontal rules (---)
  result = result.replace(/([^\n])\n(---)\n/g, '$1\n\n$2\n');
  // Blank line after horizontal rules (---)
  result = result.replace(/\n(---)\n([^\n])/g, '\n$1\n\n$2');
  return result;
}

/**
 * Normalize line endings to LF (`\n`) for OS-agnostic output.
 *
 * Converts CRLF (`\r\n`) first, then strips any remaining stray CR (`\r`).
 *
 * @param text - String potentially containing CRLF or CR line endings
 * @returns    String with all line endings normalized to LF
 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
