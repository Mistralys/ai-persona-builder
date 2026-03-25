/**
 * src/plugins/ledger/roster-renderer.ts
 *
 * Renders the ledger agent roster as a numbered Markdown list.
 *
 * Ported from scripts/lib/persona-helpers.js `renderRoster()`.
 * No file-system I/O, no side effects — pure function.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the ledger agent roster as declared in `_shared.yaml`.
 */
export interface RosterEntry {
  /** Sequential agent number (1-based) */
  number: number;
  /** Full display title for this agent role */
  title: string;
  /** Short description / label shown in parentheses */
  short: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the agent roster as a numbered Markdown list.
 *
 * Each entry is formatted as:
 * ```
 * {number}. **{title}[ (YOU)]** ({short})
 * ```
 * The "(YOU)" suffix is appended to the entry whose `number` matches
 * `activeNumber`, making the active persona's role immediately obvious
 * when a built persona reads its own roster.
 *
 * Output is structurally identical to the JS original in `persona-helpers.js`.
 *
 * @param roster       Ordered array of roster entries from `_shared.yaml`
 * @param activeNumber The `number` field of the persona currently being built
 * @returns            Newline-joined Markdown list string
 *
 * @example
 * renderRoster([
 *   { number: 1, title: 'Planner', short: 'plans the work' },
 *   { number: 2, title: 'Developer', short: 'writes code' },
 * ], 1)
 * // => "1. **Planner (YOU)** (plans the work)\n2. **Developer** (writes code)"
 */
export function renderRoster(roster: RosterEntry[], activeNumber: number): string {
  return roster
    .map((entry) => {
      const you = entry.number === activeNumber ? ' (YOU)' : '';
      return `${entry.number}. **${entry.title}${you}** (${entry.short})`;
    })
    .join('\n');
}
