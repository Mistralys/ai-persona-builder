/**
 * src/utils/changelog.ts
 *
 * Utility for extracting version and date metadata from a changelog block scalar.
 *
 * Pure function — zero imports, no I/O, no side effects.
 */

/**
 * Version and date metadata extracted from a changelog entry.
 *
 * `date` is an empty string when the changelog entry has no date component.
 */
export interface ChangelogMeta {
  /** Semver version string, e.g. `'1.5.0'` */
  version: string;
  /** ISO date string (`YYYY-MM-DD`), or `''` if absent */
  date: string;
}

/**
 * Primary pattern: `X.Y.Z (YYYY-MM-DD): …`
 * Captures version in group 1 and date in group 2.
 * Applied per-line so that the FIRST version line always wins.
 */
const RE_VERSION_WITH_DATE = /^(\d+\.\d+\.\d+)\s*\((\d{4}-\d{2}-\d{2})\)\s*:/;

/**
 * Fallback pattern: `X.Y.Z: …` (no date component)
 * Captures version in group 1.
 * Applied per-line so that the FIRST version line always wins.
 */
const RE_VERSION_ONLY = /^(\d+\.\d+\.\d+)\s*:/;

/**
 * Extract `version` and `date` from the first matching line of a changelog
 * block scalar.
 *
 * Lines are inspected in order; the first line that contains a recognisable
 * semver entry wins. This ensures that a later entry with a date does not
 * shadow an earlier entry that has no date.
 *
 * Accepts `unknown` input so callers can pass raw YAML values without casting.
 * Returns `undefined` when the input is not a non-empty string or contains no
 * recognisable version line.
 *
 * @param input  Raw changelog value (typically a YAML block scalar string)
 * @returns      Extracted `{ version, date }`, or `undefined`
 *
 * @example
 * resolveChangelogMeta('1.5.0 (2026-06-13): Added feature')
 * // => { version: '1.5.0', date: '2026-06-13' }
 *
 * resolveChangelogMeta('1.5.0: Added feature')
 * // => { version: '1.5.0', date: '' }
 *
 * resolveChangelogMeta(undefined)
 * // => undefined
 */
export function resolveChangelogMeta(input: unknown): ChangelogMeta | undefined {
  if (typeof input !== 'string' || input.trim() === '') {
    return undefined;
  }

  for (const line of input.split(/\r?\n/)) {
    const withDate = RE_VERSION_WITH_DATE.exec(line);
    if (withDate !== null) {
      return { version: withDate[1], date: withDate[2] };
    }

    const versionOnly = RE_VERSION_ONLY.exec(line);
    if (versionOnly !== null) {
      return { version: versionOnly[1], date: '' };
    }
  }

  return undefined;
}
