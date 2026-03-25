/**
 * src/validators/strict-validator.ts
 *
 * Validates that a set of required marker strings are present in a rendered
 * persona output string.
 *
 * "Strict" mode in the build pipeline guards against incomplete renders —
 * e.g. a required section marker (e.g. "{{ROLE}}") that was never resolved.
 * This validator generalises that concept: callers supply the list of marker
 * strings that *must* appear in the final rendered content.
 *
 * This is a pure function: no file I/O, no side effects.
 * It depends only on `ValidationResult` from `src/plugins/types.ts`.
 */

import type { ValidationResult } from '../plugins/types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that every required marker string is present in the rendered output.
 *
 * Each absent marker produces one `ValidationResult` entry with severity
 * `"error"` and a descriptive message identifying the missing marker.
 *
 * @param renderedContent  The final rendered output string to inspect
 * @param requiredMarkers  Array of marker strings that must appear verbatim in
 *                         `renderedContent`. An empty array always returns `[]`.
 * @returns                Empty array when all markers are found; one entry per
 *                         absent marker otherwise. Each entry has severity "error".
 *
 * @example
 * validateStrictMarkers('Hello world', ['Hello', 'world']); // []
 * validateStrictMarkers('Hello world', ['{{MISSING}}']);
 * // [{severity:'error', message:'Required marker "{{MISSING}}" is missing from the rendered output.'}]
 */
export function validateStrictMarkers(
  renderedContent: string,
  requiredMarkers: string[],
): ValidationResult[] {
  const errors: ValidationResult[] = [];

  for (const marker of requiredMarkers) {
    if (!renderedContent.includes(marker)) {
      errors.push({
        severity: 'error',
        message: `Required marker "${marker}" is missing from the rendered output.`,
      });
    }
  }

  return errors;
}
