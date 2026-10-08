/**
 * src/validators/subagent-validator.ts
 *
 * Validates a persona's declared `subagents` references.
 *
 * Two independent checks:
 *   1. **Unknown slug.** A declared slug that does not exist in any
 *      configured suite (keyed on the cross-suite agent name map, exactly as
 *      before this validator was relocated out of `persona-builder.ts`).
 *   2. **Target-aware.** A declared slug that exists, but whose resolved
 *      `targets` (see `resolvePersonaTargets()` in
 *      `src/builders/persona-index.ts`) exclude the target currently being
 *      built. A dispatching persona built for `claude-code` that names a
 *      sub-agent only built for `vscode` would otherwise silently dispatch
 *      to a persona file that was never written for that target.
 *
 * This is a pure function: no file I/O, no side effects. It depends only on
 * `PersonaMetadata` / `ValidationResult` (from `src/plugins/types.ts`) and
 * `PersonaIndex` (from `src/builders/persona-index.ts`).
 */

import type { PersonaMetadata, ValidationResult } from '../plugins/types.js';
import type { PersonaIndex } from '../builders/persona-index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that all slugs declared in a persona's `subagents` field exist,
 * and — when a `PersonaIndex` and `target` are supplied — are built for the
 * current target.
 *
 * **Unknown-slug check:** keyed on `agentMap` — a declared slug is valid
 * when `agent_slug_{underscored_slug}` is present in `agentMap`.
 * **Skip-on-empty is deliberately preserved**: when `agentMap` has zero
 * entries (the default `{}`), no unknown-slug error is emitted for any
 * declared slug — an empty map is treated as "no cross-suite agent data was
 * computed for this call" rather than "zero personas exist anywhere", so a
 * direct `buildPersona()` call that doesn't supply an agent map does not get
 * unknown-slug noise it never asked to be checked against.
 *
 * **Target-aware check:** runs only when both `index` and `target` are
 * supplied. For a slug found in `index.bySlug` whose resolved `targets`
 * exclude `target`, this is a *second, independent* error — it does not
 * replace or suppress the unknown-slug check (a slug can, in principle, fail
 * both checks if `agentMap` and `index` were built from different scans). A
 * slug absent from the index is left entirely to the unknown-slug check
 * above; this also keeps a suite-only index (as `buildSuite()` builds when
 * called without one) from raising false target-aware errors for
 * cross-suite slugs it never scanned.
 *
 * @param persona  Typed persona metadata (may or may not have `subagents`)
 * @param agentMap Cross-suite agent name map (see `agentNameMapFromIndex()`)
 * @param index    Optional cross-suite `PersonaIndex`, enabling the
 *                 target-aware check
 * @param target   The target currently being built, required alongside
 *                 `index` to enable the target-aware check
 * @returns        `ValidationResult[]` — one error per failing check, or `[]`
 */
export function validateSubagentRefs(
  persona: PersonaMetadata,
  agentMap: Record<string, string>,
  index?: PersonaIndex,
  target?: string,
): ValidationResult[] {
  const subagents = persona.subagents;
  if (!Array.isArray(subagents) || subagents.length === 0) return [];

  const results: ValidationResult[] = [];
  const agentMapIsEmpty = Object.keys(agentMap).length === 0;

  for (const slug of subagents) {
    if (!agentMapIsEmpty) {
      const key = `agent_slug_${slug.replace(/-/g, '_')}`;
      if (!(key in agentMap)) {
        results.push({
          severity: 'error',
          message:
            `Persona '${persona.name}' declares subagent '${slug}' but no persona ` +
            `with that slug exists in any configured suite.`,
        });
      }
    }

    if (index && target) {
      const entry = index.bySlug.get(slug);
      if (entry && !entry.targets.includes(target)) {
        results.push({
          severity: 'error',
          message:
            `Persona '${persona.name}' declares subagent '${slug}' but that persona is not built for ` +
            `target "${target}" (its resolved targets: ${entry.targets.length > 0 ? entry.targets.join(', ') : '(none)'}).`,
        });
      }
    }
  }

  return results;
}
