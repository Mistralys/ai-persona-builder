/**
 * src/targets/types.ts
 *
 * Target type definitions for @mistralys/persona-builder.
 *
 * Defines the TargetDefinition interface and well-known target name constants.
 */

// ---------------------------------------------------------------------------
// TargetDefinition interface
// ---------------------------------------------------------------------------

/**
 * Describes a build target — maps a target name to its output directory key,
 * filename context key, default frontmatter template, and optional
 * auto-injected context flags.
 */
export interface TargetDefinition {
  /** Unique target identifier (e.g. 'vscode', 'claude-code'). */
  name: string;

  /**
   * Key used to look up the output directory in the suite's output dir map.
   * For built-in targets this matches the target name.
   */
  outputDirKey: string;

  /**
   * Context field name that holds a custom output filename for this target.
   * When present and non-empty in the rendered context, it overrides the
   * default filename derived from the persona name.
   */
  filenameContextKey?: string;

  /**
   * Default frontmatter template string for this target.
   * Used when neither a plugin nor a BuildConfig template is provided.
   */
  defaultFrontmatter: string;

  /**
   * Declarative context flags merged into the build context when this target
   * is rendered. Useful for `{{#if target_vscode}}` guards.
   *
   * All entries are spread into the context by `buildContext()` via a
   * registry lookup — `registry.get(target).contextFlags`. The fallback path
   * (for targets absent from the registry) injects a single boolean flag
   * derived from the target name: `target_${name.replace(/-/g, '_')} = true`.
   */
  contextFlags?: Record<string, unknown>;

  /**
   * Whether this target is included in the default build when no explicit
   * `targets` array is configured. Defaults to `true` when omitted.
   *
   * Set to `false` for opt-in targets (e.g. `'deep-agents'`) that should
   * only be built when explicitly requested via `config.targets`.
   */
  defaultEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Well-known target name constants
// ---------------------------------------------------------------------------

/** Well-known name constant for the VS Code target. */
export const TARGET_VSCODE = 'vscode' as const;

/** Well-known name constant for the Claude Code target. */
export const TARGET_CLAUDE_CODE = 'claude-code' as const;

/** Well-known name constant for the Deep Agents target. */
export const TARGET_DEEP_AGENTS = 'deep-agents' as const;

// ---------------------------------------------------------------------------
// Default frontmatter templates (owned by the targets layer)
// ---------------------------------------------------------------------------

/**
 * Default VS Code frontmatter template.
 *
 * Minimal fields that work for standalone personas. Projects using numbered
 * workflows (e.g. ledger) should inject a richer template via a plugin.
 */
export const DEFAULT_FRONTMATTER_VSCODE = `---
name: '{{name}} v{{version}}'
description: '{{description}}'
tools: [{{tools_list}}]
---`;

/**
 * Default Claude Code frontmatter template.
 *
 * Minimal fields that work for standalone personas. Projects using numbered
 * workflows should inject a richer template via a plugin.
 */
export const DEFAULT_FRONTMATTER_CLAUDE_CODE = `---
name: {{cc_file_name_stem}}
permissionMode: {{cc_permission_mode}}
model: {{cc_model}}
memory: {{cc_memory}}
tools: [{{cc_tools_list}}]
---`;

/**
 * Default Deep Agents frontmatter template.
 *
 * Minimal fields — no IDE-specific properties. Suitable for headless
 * LangGraph / Deep Agents pipeline executors that consume persona files
 * without an IDE host.
 */
export const DEFAULT_FRONTMATTER_DEEP_AGENTS = `---
name: {{name}}
description: {{description}}
---`;
