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
 * Identifies a build output target.
 *
 * Resolves to `string` to allow custom targets alongside the three built-in
 * well-known values:
 *   - `'vscode'`       → VS Code `.prompt.md` / `.agent.md` instruction files
 *   - `'claude-code'`  → Claude Code `.md` instruction files
 *   - `'deep-agents'`  → Deep Agents `.md` instruction files
 *
 * Use the exported constants `TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, and
 * `TARGET_DEEP_AGENTS` from `src/targets/types.ts` for type-safe references
 * to the built-in targets.
 */
export type TargetType = string;

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
  /**
   * Output path for VS Code formatted persona files.
   *
   * @deprecated Use `outputDirs['vscode']` instead. Kept for backwards
   *   compatibility. When `outputDirs['vscode']` is present it takes
   *   precedence. Will be removed in a future major version.
   */
  outVscode?: string;
  /**
   * Output path for Claude Code formatted persona files.
   *
   * @deprecated Use `outputDirs['claude-code']` instead. Kept for backwards
   *   compatibility. When `outputDirs['claude-code']` is present it takes
   *   precedence. Will be removed in a future major version.
   */
  outClaudeCode?: string;
  /**
   * Generic map of output directories keyed by target output-dir key.
   *
   * Takes precedence over the deprecated `outVscode` / `outClaudeCode` fields.
   * Required for custom targets beyond the built-in ones. Each key must match
   * the target's `outputDirKey` field (declared in its `TargetDefinition`),
   * **not** necessarily the target name.
   *
   * For the three built-in targets `outputDirKey` equals the target name, so
   * there is no difference in practice:
   *   - `'vscode'` → `TargetDefinition.outputDirKey === 'vscode'`
   *   - `'claude-code'` → `TargetDefinition.outputDirKey === 'claude-code'`
   *   - `'deep-agents'` → `TargetDefinition.outputDirKey === 'deep-agents'`
   *
   * For a custom target where `name: 'my-target'` and
   * `outputDirKey: 'mydir'`, the map key must be `'mydir'`:
   *
   * @example
   * ```ts
   * outputDirs: {
   *   'vscode':      './out/vs-code',
   *   'claude-code': './out/claude-code',
   *   'deep-agents': './out/deep-agents',
   *   'mydir':       './out/my-target',  // outputDirKey for a custom target
   * }
   * ```
   */
  outputDirs?: Record<string, string>;
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

  /**
   * Optional map of suite-level template variables.
   *
   * These form the **second-lowest** layer (layer 2 of 7) in the merge chain
   * used by `buildContext()`:
   *
   *   1. `BuildConfig.variables`   — global defaults (lowest priority)
   *   2. `SuiteConfig.variables`   ← this field
   *   3. `_shared.yaml` fields     — shared metadata
   *   4. Per-persona YAML fields   — per-persona metadata
   *   5. Derived fields            — version fallback, tools serialisation, etc.
   *   6. Cross-suite agent map     — `agent_<slug>` entries
   *   7. Target flags              — `target_<name>` booleans (highest priority)
   *
   * Suite variables override any same-named entry in `BuildConfig.variables`,
   * but are themselves overridden by `_shared.yaml` fields and per-persona
   * YAML metadata. Use this field to inject suite-scoped defaults that apply
   * to every persona in the suite without modifying shared YAML files.
   */
  variables?: Record<string, unknown>;
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
 *   1. onSuiteInit      — once per suite, before any persona is built
 *   2. onPartials       — once per suite, after partials are loaded
 *   3. onBuildContext   — per persona, before template rendering
 *   4. onPersonaPartials — per persona, before template rendering (after onBuildContext)
 *   5. onPostRender     — per persona, after body rendering
 *   6. onValidate       — per persona, during the validation phase
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
   * Called once per suite after partials are loaded from disk (and after any
   * `BuildConfig.partials` inline map has been applied), but before any persona
   * is rendered.
   *
   * Plugins are chained: each plugin receives the accumulated partials map
   * returned by the previous plugin. Return the (possibly mutated or extended)
   * map to pass it to the next plugin.
   *
   * @param partialsMap The current map of partial name → partial content
   * @param suiteName   The identifier of the current suite
   * @param suite       The suite configuration object
   * @returns           Updated partials map (must include all original keys)
   */
  onPartials?(
    partialsMap: Record<string, string>,
    suiteName: string,
    suite: SuiteConfig,
  ): Record<string, string>;

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
   * Called for each persona (and target) after `onBuildContext`, before
   * template rendering.
   *
   * Allows plugins to inject or override partials on a per-persona basis.
   * Plugins are chained: each plugin receives the accumulated partials map
   * returned by the previous plugin. Return the (possibly mutated or extended)
   * map to pass it to the next plugin.
   *
   * **Isolation guarantee:** The builder creates a shallow copy of the
   * suite-level partials map before invoking the first plugin in the chain.
   * The `partialsMap` argument you receive is already persona-scoped — changes
   * to it (or to the map you return) are invisible to other personas in the
   * same suite.  Do **not** mutate `partialsMap` in place; instead, return a
   * new map (e.g. `{ ...partialsMap, myPartial: '...' }`) so that each plugin
   * in the chain receives an independent copy of the previous plugin's output.
   *
   * @param partialsMap The current persona-scoped map of partial name → content
   *                    (a shallow copy of the suite-level map, isolated per persona)
   * @param persona     Typed metadata for the persona being built
   * @param context     The post-`onBuildContext` rendering context; persona
   *                    metadata and any context keys injected by `onBuildContext`
   *                    plugins are accessible here
   * @param suite       The suite configuration object
   * @param target      The current build target (optional)
   * @returns           Updated partials map (must include all original keys)
   */
  onPersonaPartials?(
    partialsMap: Record<string, string>,
    persona: PersonaMetadata,
    context: Record<string, unknown>,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, string>;

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
