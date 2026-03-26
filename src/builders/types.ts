/**
 * src/builders/types.ts
 *
 * Core types for the persona builder layer.
 *
 * Defines:
 *   - BuildConfig     — typed configuration accepted by build()
 *   - BuildResult     — outcome of building a single persona
 *   - BuildSummary    — aggregated result returned by build()
 *
 * TargetType is defined in src/plugins/types.ts and exported via the
 * canonical path: src/plugins/index.ts → src/index.ts.
 */

import type { PersonaBuildPlugin, SuiteConfig, ValidationResult } from '../plugins/types.js';

// ---------------------------------------------------------------------------
// Build configuration
// ---------------------------------------------------------------------------

/**
 * Top-level configuration accepted by `build()`.
 *
 * At minimum, `suites` must be provided. All other fields have sensible
 * defaults so a minimal configuration is:
 *
 * ```ts
 * const summary = await build({
 *   suites: { my-suite: { srcDir: './src', outVscode: './out/vs', outClaudeCode: './out/cc' } },
 * });
 * ```
 */
export interface BuildConfig {
  /**
   * Named map of suite configurations. Each key is a suite identifier; the
   * value describes source and output directories for that suite.
   */
  suites: Record<string, SuiteConfig>;

  /**
   * Absolute path to the shared partials directory. When provided, partials
   * from this directory are loaded as the base layer before suite-local
   * partials are overlaid. Optional.
   */
  sharedPartialsDir?: string;

  /**
   * List of registered plugins. Plugins are invoked in array order for every
   * hook. Defaults to `[]`.
   */
  plugins?: PersonaBuildPlugin[];

  /**
   * Target output formats to build. Defaults to both `'vscode'` and
   * `'claude-code'` when omitted.
   */
  targets?: Array<'vscode' | 'claude-code'>;

  /**
   * When `true`, no files are written to disk. The build still renders all
   * personas and collects ValidationResults, but all write operations are
   * skipped. Defaults to `false`.
   */
  check?: boolean;

  /**
   * When `true`, the build fails (throws or returns a failed summary) if any
   * ValidationResult has severity `'error'` or `'warning'`. Defaults to
   * `false`.
   */
  strict?: boolean;

  /**
   * Optional map of default frontmatter templates, keyed by target type.
   * These are used as library defaults and can be overridden by plugin
   * `frontmatterTemplates`. When absent, built-in defaults from
   * `src/builders/frontmatter.ts` are used.
   */
  frontmatter?: Partial<Record<'vscode' | 'claude-code', string>>;
}

// ---------------------------------------------------------------------------
// Build result types
// ---------------------------------------------------------------------------

/**
 * The outcome of building a single persona for a single target.
 */
export interface BuildResult {
  /** The suite identifier this persona belongs to */
  suite: string;
  /** Target platform this result was generated for */
  target: 'vscode' | 'claude-code';
  /** Absolute path to the persona YAML source file */
  personaYamlPath: string;
  /** Absolute path to the output file (may not exist if check mode) */
  outputPath: string;
  /** The rendered persona content */
  content: string;
  /** Validation results collected from all plugins */
  validationResults: ValidationResult[];
  /** Whether the output file was written to disk (false in check mode) */
  written: boolean;
}

/**
 * Aggregated result returned by `build()` after processing all suites and
 * targets.
 */
export interface BuildSummary {
  /** Whether the overall build succeeded */
  success: boolean;
  /** Individual results for each persona × target combination */
  results: BuildResult[];
  /**
   * When `strict` mode is enabled and a failure was detected, this holds all
   * ValidationResults with severity `'error'` or `'warning'` that caused the
   * failure. Empty otherwise.
   */
  strictFailures: ValidationResult[];
  /** Total number of persona files processed */
  totalBuilt: number;
  /** Total number of output files written (0 in check mode) */
  totalWritten: number;
}
