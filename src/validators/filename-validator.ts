/**
 * src/validators/filename-validator.ts
 *
 * Validates persona output filenames against the project naming convention.
 *
 * Convention: kebab-case only — lowercase letters, digits, and hyphens.
 * No spaces, no uppercase letters, no special characters other than hyphens
 * and dots (for the file extension).
 *
 * This is a pure function: no file I/O, no process.exit, no side effects.
 * It depends only on `ValidationResult` from `src/plugins/types.ts`.
 */

import type { ValidationResult } from '../plugins/types.js';

// ---------------------------------------------------------------------------
// Validation rule definitions
// ---------------------------------------------------------------------------

interface FilenameRule {
  /** Human-readable description of the rule (used in error messages) */
  description: string;
  /** Returns true when the filename is *invalid* (i.e. the rule is violated) */
  violated: (basename: string) => boolean;
  /** Message factory — receives the offending basename */
  message: (basename: string) => string;
}

const FILENAME_RULES: FilenameRule[] = [
  {
    description: 'no uppercase letters',
    violated: (name) => /[A-Z]/.test(name),
    message: (name) =>
      `Filename "${name}" contains uppercase letters. Use lowercase kebab-case (e.g. "my-persona.md").`,
  },
  {
    description: 'no spaces',
    violated: (name) => /\s/.test(name),
    message: (name) =>
      `Filename "${name}" contains spaces. Use hyphens to separate words (e.g. "my-persona.md").`,
  },
  {
    description: 'kebab-case characters only',
    violated: (name) => {
      // A valid filename consists of one or more dot-separated segments.
      // Each segment must be a non-empty kebab-case token:
      //   - starts and ends with a lowercase letter or digit
      //   - may contain hyphens, but not consecutive hyphens
      // Examples of valid names: "my-persona.md", "1-developer.agent.md"
      // Examples of invalid names: "My_Persona.md", "--bad.md", "foo..bar.md"
      const segments = name.split('.');
      if (segments.length === 1) {
        // No extension — treat the whole name as a kebab stem
        return !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
      }
      // All segments (stem + extension parts) must be valid kebab tokens
      return !segments.every((seg) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seg));
    },
    message: (name) =>
      `Filename "${name}" does not conform to kebab-case naming. ` +
      `Use lowercase letters, digits, and hyphens only (e.g. "my-persona.md").`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a persona filename against the project naming convention.
 *
 * Accepts either a bare filename (`my-persona.md`) or a full/relative path
 * — only the basename (last path segment) is evaluated.
 *
 * @param filePath  Filename or path to validate (only the basename is checked)
 * @returns         Empty array when the filename conforms; one ValidationResult
 *                  per violated rule otherwise. Each result has severity "error".
 *
 * @example
 * validateFileName('my-persona.md');          // []
 * validateFileName('My Persona.md');          // [{severity:'error', message:'...'}]
 * validateFileName('/abs/path/my-persona.md');// []
 */
export function validateFileName(filePath: string): ValidationResult[] {
  const basename = filePath.includes('/')
    ? filePath.split('/').pop() ?? filePath
    : filePath.includes('\\')
      ? filePath.split('\\').pop() ?? filePath
      : filePath;

  const errors: ValidationResult[] = [];

  for (const rule of FILENAME_RULES) {
    if (rule.violated(basename)) {
      errors.push({
        severity: 'error',
        message: rule.message(basename),
      });
    }
  }

  return errors;
}
