/**
 * src/plugins/types.ts
 *
 * Core plugin system types for @mistralys/persona-builder.
 *
 * Defines:
 *   - TargetType         — union of supported output targets
 *   - PersonaMetadata    — typed representation of a persona YAML file
 *   - SuiteConfig        — configuration for a single persona suite
 *   - ValidationResult   — outcome of a plugin's onValidate hook
 *   - PersonaBuildPlugin — interface every plugin must implement
 */

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

/**
 * The two output formats supported by the build pipeline.
 * 'vscode'      → VS Code `.code-workspace` instruction files
 * 'claude-code' → Claude Code instruction files
 */
export type TargetType = 'vscode' | 'claude-code';

// ---------------------------------------------------------------------------
// Metadata / configuration types
// ---------------------------------------------------------------------------

/**
 * Typed representation of a persona YAML metadata file.
 *
 * Fields map directly to the keys expected in `*.yaml` persona files.
 * All fields beyond `name` are optional — consumers should treat them
 * as potentially absent and fall back to suite-level or shared defaults.
 */
export interface PersonaMetadata {
  /** Unique persona identifier (matches filename stem) */
  name: string;
  /** Human-readable display name */
  displayName?: string;
  /** Short description surfaced in frontmatter */
  description?: string;
  /** Semantic version string (e.g. "1.2.0") */
  version?: string;
  /** Ordered list of tool identifiers */
  tools?: string[];
  /** Free-form context variables available during template rendering */
  [key: string]: unknown;
}

/**
 * Configuration for a single persona suite (directory of related personas).
 */
export interface SuiteConfig {
  /** Absolute or relative path to the suite source directory */
  srcDir: string;
  /** Output path for VS Code formatted persona files */
  outVscode: string;
  /** Output path for Claude Code formatted persona files */
  outClaudeCode: string;
  /**
   * Optional persona mode string (e.g. 'ledger').
   * When present, plugins can use this to branch behaviour.
   */
  personaMode?: string;
  /** Sub-directory within srcDir that contains partials. Default: 'partials' */
  partialsSubdir?: string;
  /** Sub-directory within srcDir that contains YAML metadata. Default: 'meta' */
  metaSubdir?: string;
  /** Sub-directory within srcDir that contains content Markdown files. Default: 'content' */
  contentSubdir?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * A single validation outcome returned by a plugin's `onValidate` hook.
 */
export interface ValidationResult {
  /** Severity level of the issue */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable description of the issue */
  message: string;
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

/**
 * Interface that every persona build plugin must implement.
 *
 * All hooks are optional — a plugin only needs to implement the hooks it
 * uses. The only required field is `name`, which is used for logging and
 * identification.
 *
 * Hook invocation order (per persona):
 *   1. onSuiteInit   — once per suite, before any persona is built
 *   2. onBuildContext — per persona, before template rendering
 *   3. onPostRender   — per persona, after body rendering
 *   4. onValidate     — per persona, during the validation phase
 */
export interface PersonaBuildPlugin {
  /**
   * Unique name for this plugin (used in log messages and error reporting).
   */
  name: string;

  /**
   * Called once per suite before any persona is built.
   *
   * Use this hook to perform suite-level setup — e.g. loading external data,
   * validating the suite config, or mutating `sharedMeta` for downstream hooks.
   *
   * @param suite      The suite configuration object
   * @param sharedMeta Shared metadata merged from `_shared.yaml` (mutate in place if needed)
   */
  onSuiteInit?(suite: SuiteConfig, sharedMeta: Record<string, unknown>): void;

  /**
   * Called for each persona before template rendering.
   *
   * Receives the current rendering context and must return a (possibly mutated)
   * context object. Plugins are chained: each plugin receives the output of the
   * previous one.
   *
   * @param context  Current rendering context (accumulates across plugins)
   * @param persona  Typed metadata for the persona being built
   * @param suite    The suite configuration object
   * @returns        Updated rendering context (must include all original keys)
   */
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, unknown>;

  /**
   * Called for each persona after body rendering.
   *
   * Receives the rendered output string and can return a mutated version.
   * Plugins are chained: each plugin receives the output of the previous one.
   *
   * @param output  The rendered persona output string (accumulates across plugins)
   * @param persona Typed metadata for the persona being built
   * @param target  The current build target
   * @returns       Updated output string
   */
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;

  /**
   * Called during the validation phase for each persona.
   *
   * Return an array of ValidationResult objects (or an empty array).
   * Results from all plugins are collected into a flat array by the runner.
   *
   * @param persona Typed metadata for the persona being built
   * @param suite   The suite configuration object
   * @param target  The current build target (optional — absent in single-target contexts)
   * @returns       Array of validation results (may be empty)
   */
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig, target?: TargetType): ValidationResult[];

  /**
   * Optional map of custom frontmatter templates keyed by target type.
   *
   * When present, the builder will use these templates in place of (or to
   * augment) the library defaults for the matching target.
   */
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
