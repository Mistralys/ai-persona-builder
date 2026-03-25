/**
 * src/plugins/ledger/index.ts
 *
 * Factory function for the ledger persona build plugin.
 *
 * `ledgerPlugin(options)` assembles the core modules from the ledger plugin
 * package into a `PersonaBuildPlugin`-conformant object and returns it.
 *
 * Hooks implemented:
 *   - `onBuildContext`  — injects `roster_rendered` and `mcp_tools_table` into
 *                         the build context so templates can reference them.
 *   - `onPostRender`    — captures the rendered output per-persona so the
 *                         `onValidate` hook can run the `note_only` guard against
 *                         the real generated content.
 *   - `onValidate`      — invokes `validateRole` (role against workflow manifest)
 *                         and `validateNoteOnlyGuard` (ensures `note_only` tools
 *                         are not present in the rendered output).
 *   - `frontmatterTemplates` — registers the ledger-specific frontmatter templates
 *                               for the `vscode` and `claude-code` targets.
 *
 * Sub-path export: `@mistralys/persona-builder/plugins/ledger`
 *
 * @example
 * ```ts
 * import { ledgerPlugin } from '@mistralys/persona-builder/plugins/ledger';
 * const manifest = require('./shared/workflow-manifest.json');
 *
 * const plugin = ledgerPlugin({
 *   manifestRoles: manifest.roles.map(r => r.name),
 * });
 * ```
 */

import type { PersonaBuildPlugin, PersonaMetadata, SuiteConfig, ValidationResult } from '../types.js';
import { renderRoster } from './roster-renderer.js';
import type { RosterEntry } from './roster-renderer.js';
import { renderMcpToolsTable } from './mcp-tools-renderer.js';
import type { McpToolEntry } from './mcp-tools-renderer.js';
import { validateRole, validateNoteOnlyGuard } from './role-validator.js';
import { FRONTMATTER_LEDGER_VSCODE, FRONTMATTER_LEDGER_CC } from './frontmatter-templates.js';

// ---------------------------------------------------------------------------
// Public options type
// ---------------------------------------------------------------------------

/**
 * Configuration options for the ledger plugin.
 */
export interface LedgerPluginOptions {
  /**
   * List of canonical role names sourced from the project's workflow manifest.
   *
   * Every persona's `role` field is validated against this list.
   * Provide `manifest.roles.map(r => r.name)` from `shared/workflow-manifest.json`.
   *
   * When omitted (or empty), role validation is skipped.
   */
  manifestRoles?: ReadonlyArray<string>;

  /**
   * When `true`, an unknown `role` field emits a warning-level
   * `ValidationResult` instead of being silently skipped.
   *
   * @default true
   */
  warnOnUnknownRole?: boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ledger persona build plugin.
 *
 * The returned object satisfies the `PersonaBuildPlugin` interface and can be
 * passed directly to the `plugins` array in a `BuildConfig`.
 *
 * @param options Configuration options for the plugin
 * @returns       A fully configured `PersonaBuildPlugin` for the ledger suite
 */
export function ledgerPlugin(options: LedgerPluginOptions = {}): PersonaBuildPlugin {
  const { manifestRoles = [], warnOnUnknownRole = true } = options;

  /**
   * Per-persona rendered output cache.
   *
   * Populated by `onPostRender` and consumed by `onValidate`.
   * Keyed by persona `name` to handle cases where multiple targets are built
   * in sequence — each call to `onPostRender` overwrites the previous entry
   * for the same persona, which is fine because `onValidate` immediately
   * follows `onPostRender` in the per-persona pipeline.
   */
  const renderedOutputCache = new Map<string, string>();

  return {
    name: 'ledger',

    // -------------------------------------------------------------------------
    // onBuildContext — inject roster_rendered and mcp_tools_table
    // -------------------------------------------------------------------------

    onBuildContext(
      context: Record<string, unknown>,
      persona: PersonaMetadata,
      _suite: SuiteConfig,
    ): Record<string, unknown> {
      const updated: Record<string, unknown> = { ...context };

      // Render roster list if the persona carries a roster array
      const roster = persona['roster'] as RosterEntry[] | undefined;
      const personaNumber = persona['number'] as number | undefined;

      if (Array.isArray(roster) && personaNumber !== undefined) {
        updated['roster_rendered'] = renderRoster(roster, personaNumber);
      } else {
        // Emit an empty string so templates can safely reference the variable
        // without producing an unresolved-variable warning on non-ledger personas.
        updated['roster_rendered'] = '';
      }

      // Render MCP tools table if the persona carries an mcp_tools array
      const mcpTools = persona['mcp_tools'] as McpToolEntry[] | undefined;

      if (Array.isArray(mcpTools)) {
        updated['mcp_tools_table'] = renderMcpToolsTable(mcpTools);
      } else {
        updated['mcp_tools_table'] = '';
      }

      return updated;
    },

    // -------------------------------------------------------------------------
    // onPostRender — capture rendered output for note_only guard in onValidate
    // -------------------------------------------------------------------------

    onPostRender(
      output: string,
      persona: PersonaMetadata,
    ): string {
      // Cache the rendered output so onValidate can run the note_only guard.
      renderedOutputCache.set(persona.name, output);
      return output;
    },

    // -------------------------------------------------------------------------
    // onValidate — role validation + note_only guard
    // -------------------------------------------------------------------------

    onValidate(
      persona: PersonaMetadata,
      _suite: SuiteConfig,
    ): ValidationResult[] {
      const results: ValidationResult[] = [];

      // 1. Role validation against the workflow manifest
      const role = persona['role'] as string | undefined;
      const roleResults = validateRole(role, manifestRoles).map((r) => ({
        ...r,
        // When warnOnUnknownRole is false, escalate warning → error so that
        // unknown roles are treated as hard failures rather than advisories.
        severity: (r.severity === 'warning' && !warnOnUnknownRole)
          ? ('error' as const)
          : r.severity,
      }));
      results.push(...roleResults);

      // 2. note_only guard — verify internal-only MCP tools are not in the output
      const mcpTools = persona['mcp_tools'] as McpToolEntry[] | undefined;
      const renderedOutput = renderedOutputCache.get(persona.name) ?? '';
      results.push(...validateNoteOnlyGuard(renderedOutput, mcpTools));

      return results;
    },

    // -------------------------------------------------------------------------
    // frontmatterTemplates — ledger-specific frontmatter for both targets
    // -------------------------------------------------------------------------

    frontmatterTemplates: {
      vscode: FRONTMATTER_LEDGER_VSCODE,
      'claude-code': FRONTMATTER_LEDGER_CC,
    },
  };
}
