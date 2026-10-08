/**
 * src/validators/tool-requirements-validator.ts
 *
 * Validates that a persona grants the tools its declared behaviour requires
 * on every target it is built for, and flags tool names spelled in another
 * target's notation.
 *
 * Two checks, driven entirely by a target's `TargetDefinition.toolCapabilities`
 * (see `src/targets/tools.ts`) — no target-name branches:
 *
 *   1. **Dispatch grant.** A persona whose declared behaviour requires
 *      dispatching (e.g. it lists `subagents`, or includes a handoff partial)
 *      must grant the target's `dispatch` capability. An ungranted, triggered
 *      requirement is an **error**.
 *   2. **Foreign notation.** A tool present in the persona's effective tool
 *      list for this target, but not recognised by this target's own
 *      capability map or MCP pattern, and recognised by some *other*
 *      registered target's notation, is a **warning** — it is very likely a
 *      copy-paste from the wrong target's tool list.
 *
 * This is a pure function: no file I/O, no side effects. It depends only on
 * `ValidationResult` (from `src/plugins/types.ts`) and the `TargetDefinition`
 * / `TargetRegistry` / tool-resolution helpers in `src/targets/`.
 *
 * Consumers pass in `triggered` — the list of `ToolRequirement`s this
 * persona actually triggered for this build (via `when.field` /
 * `when.partial`) — and `effectiveTools` — the post-`onBuildContext` tool
 * list for this target. Computing which requirements are triggered, and
 * wiring this validator into `buildPersona()`, is a later step; this module
 * defines the pure check only.
 */

import type { ValidationResult } from '../plugins/types.js';
import type { TargetDefinition } from '../targets/types.js';
import type { TargetRegistry } from '../targets/registry.js';
import { recognizedBy } from '../targets/tools.js';

// ---------------------------------------------------------------------------
// ToolRequirement
// ---------------------------------------------------------------------------

/**
 * Declares that some persona behaviour requires the target's `dispatch`
 * capability to be granted.
 *
 * Deliberately carries only `id`, `when`, and `targets` — every requirement
 * is satisfied by `dispatch`, resolved through the target's
 * `toolCapabilities`. There is no `capability` or `anyOf` field: no rule in
 * this plan needs either, and `anyOf` would let a rule bypass the capability
 * map that serves as the single tool vocabulary. Both could be added later
 * as optional fields without a break.
 */
export interface ToolRequirement {
  /** Unique identifier for this requirement (used in validation messages). */
  id: string;
  /**
   * What triggers this requirement for a given persona:
   *   - `{ field }` — fires when the named metadata field is a non-empty
   *     array or string (e.g. `subagents`).
   *   - `{ partial }` — fires when the persona's content template
   *     transitively references the named partial (directly, or via one
   *     level of nesting — see `collectPartialReferences()` in
   *     `src/engine/partials.ts`).
   */
  when: { field: string } | { partial: string };
  /**
   * Restricts this requirement to the named targets. When omitted, the
   * requirement applies to every target that has a `dispatch` capability
   * entry (a target without one is always skipped — see
   * `validateToolRequirements()`).
   */
  targets?: string[];
}

/**
 * Built-in requirement: a persona that declares `subagents` must grant
 * `dispatch` on every target it is built for. Applies to every target
 * (no `targets` restriction) — a target without a `dispatch` capability
 * entry is simply skipped.
 */
export const SUBAGENT_DISPATCH_REQUIREMENT: ToolRequirement = {
  id: 'subagent-dispatch',
  when: { field: 'subagents' },
};

// ---------------------------------------------------------------------------
// validateToolRequirements
// ---------------------------------------------------------------------------

/**
 * Options for `validateToolRequirements()`.
 */
export interface ValidateToolRequirementsOptions {
  /** Display name of the persona being validated (for messages). */
  personaName: string;
  /** The target this persona is being validated for. */
  target: string;
  /**
   * The persona's effective (post-`onBuildContext`) tool list for `target`.
   * `undefined` means "no tool list was resolved" — the platform's default
   * grant is assumed to apply, so nothing is flagged (see AC / plan §E).
   */
  effectiveTools: string[] | undefined;
  /** The `ToolRequirement`s this persona actually triggered for this build. */
  triggered: ToolRequirement[];
  /** The current target's definition, supplying its capability map. */
  definition: TargetDefinition;
  /** The full target registry, used to look up foreign-notation matches. */
  registry: TargetRegistry;
}

/**
 * Find which capability, if any, a tool grants on a given target definition
 * (basic capability map entry, or an `mcp:<server>` match via
 * `mcpToolPattern`). Returns `undefined` when the tool is unmapped on this
 * target — deliberate, since the correspondence is intentionally rough (see
 * plan §D): an unmapped tool is simply invisible to this validator's checks.
 */
function findCapabilityForTool(tool: string, definition: TargetDefinition): string | undefined {
  if (definition.toolCapabilities) {
    for (const [capability, grantingTools] of Object.entries(definition.toolCapabilities)) {
      if (grantingTools.includes(tool)) return capability;
    }
  }

  if (definition.mcpToolPattern) {
    const match = definition.mcpToolPattern.exec(tool);
    const server = match?.[1];
    if (server) return `mcp:${server}`;
  }

  return undefined;
}

/**
 * Validate a persona's dispatch-grant requirements and foreign tool
 * notation for a single target.
 *
 * @param options  See `ValidateToolRequirementsOptions`.
 * @returns        One error per triggered, ungranted requirement, plus one
 *                 warning per foreign-notation tool found. Empty when
 *                 nothing to report.
 */
export function validateToolRequirements(options: ValidateToolRequirementsOptions): ValidationResult[] {
  const { personaName, target, effectiveTools, triggered, definition, registry } = options;

  // An absent effective tool list means the platform's default grant
  // applies — neither check has anything meaningful to compare against.
  if (effectiveTools === undefined) return [];

  const results: ValidationResult[] = [];

  // ── 1. Dispatch grant ──────────────────────────────────────────────────
  const dispatchTools = definition.toolCapabilities?.['dispatch'];

  // A target without a capability map, or without a `dispatch` entry in it,
  // is skipped — there is nothing to validate the grant against.
  if (dispatchTools && dispatchTools.length > 0) {
    for (const requirement of triggered) {
      if (requirement.targets && !requirement.targets.includes(target)) continue;

      const granted = effectiveTools.some((tool) => dispatchTools.includes(tool));
      if (granted) continue;

      const sourceDescription =
        'field' in requirement.when
          ? `field "${requirement.when.field}"`
          : `partial "${requirement.when.partial}"`;

      results.push({
        severity: 'error',
        message:
          `Persona "${personaName}" triggers tool requirement "${requirement.id}" (${sourceDescription}) ` +
          `but grants no dispatch tool on target "${target}". Grant one of: ${dispatchTools.join(', ')}.`,
      });
    }
  }

  // ── 2. Foreign notation ────────────────────────────────────────────────
  if (definition.toolCapabilities) {
    for (const tool of effectiveTools) {
      // Recognised on its own target — not foreign, nothing to flag.
      if (findCapabilityForTool(tool, definition) !== undefined) continue;

      const foreignTargets = recognizedBy(tool, registry, target);
      // Unmapped everywhere (e.g. a custom or IDE-specific tool) — ignored,
      // per the intentionally rough correspondence (plan §D).
      if (foreignTargets.length === 0) continue;

      const foreignTargetName = foreignTargets[0]!;
      const foreignDefinition = registry.get(foreignTargetName);
      const capability = findCapabilityForTool(tool, foreignDefinition);
      const equivalents = capability ? definition.toolCapabilities[capability] : undefined;

      results.push({
        severity: 'warning',
        message:
          `Persona "${personaName}": tool "${tool}" in target "${target}"'s effective tool list is ` +
          `${foreignTargetName} notation` +
          (equivalents && equivalents.length > 0
            ? `; ${target} equivalent: ${equivalents.join(', ')}.`
            : '.'),
      });
    }
  }

  return results;
}
