/**
 * src/validators/tool-parity-validator.ts
 *
 * Validates that a persona grants the same mapped capabilities on every
 * target it is built for — a persona built for both `vscode` and
 * `claude-code` that grants `execute` on one but not the other is very
 * likely an author mistake, not an intentional difference.
 *
 * This is a pure function: no file I/O, no side effects. It depends only on
 * `ValidationResult` (from `src/plugins/types.ts`). It cannot run inside
 * `buildPersona()` — a single-target build never sees another target's
 * effective tool list — so `build()` runs it as a post-pass once every
 * suite × target combination has built (see plan §F).
 */

import type { ValidationResult } from '../plugins/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One target's granted capabilities for a single persona, plus the target's
 * full capability map (used to name "equivalent" tools on a lacking target).
 */
export interface TargetCapabilitySet {
  /** The target name (e.g. `'vscode'`, `'claude-code'`). */
  target: string;
  /**
   * Capability → the tool that grants it, for this persona on this target
   * (see `resolveCapabilities()` in `src/targets/tools.ts`). Only capabilities
   * actually granted appear as keys.
   */
  capabilities: Map<string, string>;
  /**
   * The target's full capability → tool-names map (from
   * `TargetDefinition.toolCapabilities`), used to name which tool names
   * *would* grant a missing capability on this target.
   */
  toolCapabilities: Record<string, string[]>;
}

/**
 * A single parity finding, associated with the target whose result it
 * belongs on — a caller (e.g. `build()`) appends `result` to that target's
 * own `BuildResult.validationResults`.
 */
export interface ToolParityFinding {
  /** The lacking target this finding applies to. */
  target: string;
  /** The validation result itself (always `severity: 'error'`). */
  result: ValidationResult;
}

// ---------------------------------------------------------------------------
// validateToolParity
// ---------------------------------------------------------------------------

/**
 * Compare a persona's granted capabilities across every target it was built
 * for, and report a parity mismatch on each lacking target.
 *
 * For every capability granted on at least one target but missing on
 * another (among the targets present in `perTarget`), this emits one
 * **error**-severity finding on each lacking target — naming the capability,
 * every granting target and its granting tool, and the lacking target's own
 * equivalent tool names (from its `toolCapabilities` map, regardless of
 * whether any of those tools are currently granted).
 *
 * Capabilities listed in `exceptions` are skipped entirely — no finding is
 * emitted for them on any target, granting or lacking.
 *
 * At least two target capability sets are required for any comparison to be
 * meaningful; fewer produce no findings.
 *
 * @param personaLabel  Display label for the persona (used in messages).
 * @param perTarget     One `TargetCapabilitySet` per target this persona was
 *                      built for (only targets with a capability map and a
 *                      defined effective tool list should be included —
 *                      callers filter before calling, see `build()`).
 * @param exceptions    Capability names exempted from this check (from the
 *                      persona's `tool_parity_exceptions` YAML field).
 * @returns             One finding per lacking target × mismatched
 *                      capability. Empty when nothing to report.
 */
export function validateToolParity(
  personaLabel: string,
  perTarget: TargetCapabilitySet[],
  exceptions: string[],
): ToolParityFinding[] {
  if (perTarget.length < 2) return [];

  const findings: ToolParityFinding[] = [];
  const exceptionSet = new Set(exceptions);

  const allCapabilities = new Set<string>();
  for (const { capabilities } of perTarget) {
    for (const capability of capabilities.keys()) allCapabilities.add(capability);
  }

  for (const capability of allCapabilities) {
    if (exceptionSet.has(capability)) continue;

    const granting = perTarget.filter((t) => t.capabilities.has(capability));
    const lacking = perTarget.filter((t) => !t.capabilities.has(capability));

    // Granted everywhere (no mismatch) or granted nowhere among the
    // participating targets (can't happen — allCapabilities is built from
    // granted capabilities only — but kept for clarity/defensiveness).
    if (granting.length === 0 || lacking.length === 0) continue;

    const grantingDescription = granting
      .map((t) => `"${t.capabilities.get(capability)}" on "${t.target}"`)
      .join(', ');

    for (const lackingTarget of lacking) {
      const equivalents = lackingTarget.toolCapabilities[capability] ?? [];
      const equivalentsDescription = equivalents.length > 0 ? equivalents.join(', ') : '(no known tool name)';

      findings.push({
        target: lackingTarget.target,
        result: {
          severity: 'error',
          message:
            `Persona "${personaLabel}" grants capability "${capability}" via ${grantingDescription} ` +
            `but not on target "${lackingTarget.target}" (equivalent tool(s) on "${lackingTarget.target}": ${equivalentsDescription}).`,
        },
      });
    }
  }

  return findings;
}
