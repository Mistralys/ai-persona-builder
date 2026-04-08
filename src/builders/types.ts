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
import type { TargetRegistry } from '../targets/registry.js';

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
   * Target output formats to build.
   *
   * Default behaviour depends on whether `targetRegistry` is provided:
   * - **No custom registry** (default): builds `['vscode', 'claude-code']` to
   *   preserve backward compatibility — suites that do not configure a
   *   `'deep-agents'` output directory would otherwise fail silently.
   * - **Custom registry supplied**: builds all targets registered in that
   *   registry (equivalent to `registry.names()`).
   *
   * Pass an explicit array to override either default:
   * ```ts
   * targets: ['vscode', 'claude-code', 'deep-agents']
   * ```
   *
   * Accepts any registered target name — all three built-in targets
   * (`'vscode'`, `'claude-code'`, `'deep-agents'`) and any custom target
   * added via `targetRegistry`.
   */
  targets?: string[];

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
   * Optional map of default frontmatter templates, keyed by target name.
   * These are used as library defaults and can be overridden by plugin
   * `frontmatterTemplates`. When absent, built-in defaults from the
   * `TargetDefinition.defaultFrontmatter` are used.
   */
  frontmatter?: Record<string, string>;

  /**
   * Optional target registry to use for this build.
   *
   * When provided, overrides the built-in `defaultRegistry` for output
   * directory resolution, filename key lookup, frontmatter defaults, and
   * context flag injection. Consumers can register custom targets on the
   * provided registry to extend the build system without touching source code.
   *
   * Defaults to `defaultRegistry` (pre-registered with `'vscode'`,
   * `'claude-code'`, and `'deep-agents'`) when not supplied.
   */
  targetRegistry?: TargetRegistry;
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
  /** Target name this result was generated for (e.g. `'vscode'`, `'claude-code'`, or a custom target) */
  target: string;
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
