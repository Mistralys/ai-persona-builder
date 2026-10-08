/**
 * src/builders/persona-index.ts
 *
 * General persona pre-scan.
 *
 * Replaces the name-map-only scan (`buildAgentNameMap()`) with a single pass
 * that reads every persona YAML once and carries everything cross-persona
 * logic needs: resolved target lists, tool-parity exceptions, and the data
 * the cross-suite agent name map is derived from.
 *
 * A single scan is deliberate: a second scan run alongside
 * `buildAgentNameMap()` would read the same files twice and could disagree
 * with it (see plan "Considered Alternatives" — Pre-scan structure).
 */

import path from 'node:path';

import { discoverSuitePersonaYamls, loadPersonaYaml, loadRawYaml } from './persona-files.js';
import { resolveChangelogMeta } from '../utils/changelog.js';
import type { BuildConfig } from './types.js';
import type { ValidationResult } from '../plugins/types.js';
import type { TargetRegistry } from '../targets/registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One persona's entry in the cross-suite index.
 */
export interface PersonaIndexEntry {
  /** Identifier of the suite this persona belongs to. */
  suite: string;
  /** Absolute path to the persona YAML source file. */
  yamlPath: string;
  /** Kebab-case slug (from the YAML `slug` field, or the filename stem). */
  slug: string;
  /** Display name (from the YAML `name` field, or the slug). */
  name: string;
  /** Resolved version string (changelog-derived, else `default_version`, else `'0.0.0'`). */
  version: string;
  /**
   * Resolved target list this persona builds for, per `resolvePersonaTargets()`.
   * Equals every registered target name when the persona declares no `targets`.
   */
  targets: string[];
  /**
   * The raw `targets` value as declared in the persona YAML, verbatim.
   * `undefined` when the persona does not declare the field at all — this is
   * what distinguishes "declared the same subset as the default" from
   * "declared nothing".
   */
  declaredTargets?: unknown;
  /**
   * Capability names exempted from the cross-target tool parity check for
   * this persona (from the YAML `tool_parity_exceptions` field). Defaults to
   * `[]` when the persona declares no exceptions.
   */
  toolParityExceptions: string[];
}

/**
 * The result of scanning every configured suite's persona YAML files once.
 */
export interface PersonaIndex {
  /** Every persona across every suite, in suite-then-filename order. */
  entries: PersonaIndexEntry[];
  /**
   * Lookup by slug. When two personas across suites share the same slug,
   * the later one encountered (in suite-then-filename scan order) wins —
   * matching the historical `buildAgentNameMap()` overwrite behaviour.
   */
  bySlug: Map<string, PersonaIndexEntry>;
  /**
   * Error-severity results collected while resolving each persona's
   * `targets` field (unknown target, non-string entry, or empty array).
   * Consumed by `build()`'s success semantics in a later step.
   */
  issues: ValidationResult[];
}

/**
 * The outcome of resolving a persona's declared `targets` field against a
 * target registry.
 */
export interface TargetResolution {
  /** The resolved, deduplicated list of valid target names. */
  targets: string[];
  /** Error-severity results for anything invalid found while resolving. */
  issues: ValidationResult[];
}

// ---------------------------------------------------------------------------
// resolvePersonaTargets
// ---------------------------------------------------------------------------

/**
 * Resolve a persona's declared `targets` field into a concrete target list.
 *
 * Rules:
 *   - `declared === undefined` → every registered target, no issues.
 *   - `declared` is not an array → `[]`, one error.
 *   - `declared` is an empty array → `[]`, one error (an empty list most
 *     likely signals an author mistake — see plan "Considered Alternatives").
 *   - A non-string entry → dropped, one error per entry.
 *   - An entry naming an unregistered target → dropped, one error per entry.
 *   - A duplicate of an already-accepted entry → silently dropped, no error.
 *
 * Messages name the persona YAML path so a build failure points directly at
 * the offending file.
 *
 * @param declared  The raw `targets` value from the persona YAML (`unknown`
 *                   because YAML parsing gives no static guarantee of shape).
 * @param registry  The target registry to validate names against.
 * @param yamlPath  Absolute path to the persona YAML file (for messages).
 * @returns         The resolved target list plus any validation issues.
 */
export function resolvePersonaTargets(
  declared: unknown,
  registry: TargetRegistry,
  yamlPath: string,
): TargetResolution {
  if (declared === undefined) {
    return { targets: registry.names(), issues: [] };
  }

  if (!Array.isArray(declared)) {
    return {
      targets: [],
      issues: [
        {
          severity: 'error',
          message: `Persona "${yamlPath}" declares "targets" but the value is not an array.`,
        },
      ],
    };
  }

  if (declared.length === 0) {
    return {
      targets: [],
      issues: [
        {
          severity: 'error',
          message:
            `Persona "${yamlPath}" declares an empty "targets" array. ` +
            `Omit the field to build for every target, or list at least one target name.`,
        },
      ],
    };
  }

  const issues: ValidationResult[] = [];
  const seen = new Set<string>();
  const targets: string[] = [];

  for (const entry of declared) {
    if (typeof entry !== 'string') {
      issues.push({
        severity: 'error',
        message: `Persona "${yamlPath}" declares a non-string entry in "targets": ${JSON.stringify(entry)}.`,
      });
      continue;
    }

    if (!registry.has(entry)) {
      issues.push({
        severity: 'error',
        message: `Persona "${yamlPath}" declares unknown target "${entry}" in "targets".`,
      });
      continue;
    }

    if (seen.has(entry)) continue;
    seen.add(entry);
    targets.push(entry);
  }

  return { targets, issues };
}

// ---------------------------------------------------------------------------
// validateToolParityExceptionNames
// ---------------------------------------------------------------------------

/**
 * Validate a persona's declared `tool_parity_exceptions` names against every
 * capability any registered target maps.
 *
 * An exception naming a capability that no registered target maps, and that
 * is not an `mcp:<server>` form (which is never present in a target's
 * `toolCapabilities` keys — it is derived from `mcpToolPattern` matches, not
 * declared there), is very likely a typo or a stale exception left over from
 * a renamed capability. This is a **warning**, not an error — an unusable
 * exception does not itself cause a false parity mismatch (it just fails to
 * suppress one that may or may not exist), so it does not need error-level
 * urgency.
 *
 * @param exceptions  The persona's declared `tool_parity_exceptions` list.
 * @param registry    The target registry to check capability names against.
 * @param yamlPath    Absolute path to the persona YAML file (for messages).
 * @returns           One warning per unrecognised exception name, or `[]`.
 */
function validateToolParityExceptionNames(
  exceptions: string[],
  registry: TargetRegistry,
  yamlPath: string,
): ValidationResult[] {
  if (exceptions.length === 0) return [];

  const knownCapabilities = new Set<string>();
  for (const definition of registry.allDefinitions()) {
    if (definition.toolCapabilities) {
      for (const capability of Object.keys(definition.toolCapabilities)) {
        knownCapabilities.add(capability);
      }
    }
  }

  const issues: ValidationResult[] = [];

  for (const exception of exceptions) {
    if (knownCapabilities.has(exception)) continue;
    if (exception.startsWith('mcp:')) continue;

    issues.push({
      severity: 'warning',
      message:
        `Persona "${yamlPath}" lists "${exception}" in "tool_parity_exceptions", but no registered target ` +
        `maps that capability, and it is not an "mcp:<server>" form.`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// scanPersonas
// ---------------------------------------------------------------------------

/**
 * Scan every configured suite's persona YAML files once, resolving each
 * persona's targets and tool-parity exceptions along the way.
 *
 * Iterates suites in `Object.entries(config.suites)` order and, within each
 * suite, personas in `discoverSuitePersonaYamls()`'s sorted order — the same
 * traversal order the former `buildAgentNameMap()` used, so
 * `agentNameMapFromIndex()` reproduces its output byte-for-byte.
 *
 * @param config    Top-level BuildConfig with all suite definitions.
 * @param registry  Target registry used to resolve each persona's `targets`.
 * @returns         The populated PersonaIndex.
 */
export async function scanPersonas(
  config: BuildConfig,
  registry: TargetRegistry,
): Promise<PersonaIndex> {
  const entries: PersonaIndexEntry[] = [];
  const bySlug = new Map<string, PersonaIndexEntry>();
  const issues: ValidationResult[] = [];

  for (const [suite, suiteConfig] of Object.entries(config.suites)) {
    const metaSubdir = suiteConfig.metaSubdir ?? 'meta';
    const sharedYamlPath = path.join(suiteConfig.srcDir, metaSubdir, '_shared.yaml');
    const sharedMeta = await loadRawYaml(sharedYamlPath);
    const defaultVersion =
      typeof sharedMeta['default_version'] === 'string' ? sharedMeta['default_version'] : '0.0.0';

    const personaYamls = await discoverSuitePersonaYamls(suiteConfig);

    for (const yamlPath of personaYamls) {
      const persona = await loadPersonaYaml(yamlPath);

      const slug = typeof persona['slug'] === 'string' ? persona['slug'] : path.basename(yamlPath, '.yaml');
      const name = typeof persona['name'] === 'string' ? persona['name'] : slug;

      const clMeta = resolveChangelogMeta(persona['changelog']);
      const version = clMeta?.version ?? defaultVersion;

      const declaredTargets = persona['targets'];
      const { targets, issues: targetIssues } = resolvePersonaTargets(declaredTargets, registry, yamlPath);
      issues.push(...targetIssues);

      const toolParityExceptions = Array.isArray(persona['tool_parity_exceptions'])
        ? (persona['tool_parity_exceptions'] as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      issues.push(...validateToolParityExceptionNames(toolParityExceptions, registry, yamlPath));

      const entry: PersonaIndexEntry = {
        suite,
        yamlPath,
        slug,
        name,
        version,
        targets,
        declaredTargets,
        toolParityExceptions,
      };

      entries.push(entry);
      bySlug.set(slug, entry);
    }
  }

  return { entries, bySlug, issues };
}

// ---------------------------------------------------------------------------
// agentNameMapFromIndex
// ---------------------------------------------------------------------------

/**
 * Derive the cross-suite agent name map from a `PersonaIndex`.
 *
 * Reproduces the former `buildAgentNameMap()` output byte-for-byte: for each
 * entry, in scan order,
 *   - `agent_<underscored_slug>` → `"<name> v<version>"`
 *   - `agent_slug_<underscored_slug>` → `<slug>` (raw, hyphens preserved)
 *
 * Deriving the map from the same index `build()` uses elsewhere means both
 * cannot disagree — they come from one scan.
 *
 * @param index  A `PersonaIndex` produced by `scanPersonas()`.
 * @returns      Map of agent variable keys to display strings.
 */
export function agentNameMapFromIndex(index: PersonaIndex): Record<string, string> {
  const agentMap: Record<string, string> = {};

  for (const entry of index.entries) {
    const underscoredSlug = entry.slug.replace(/-/g, '_');

    agentMap[`agent_${underscoredSlug}`] = `${entry.name} v${entry.version}`;
    agentMap[`agent_slug_${underscoredSlug}`] = entry.slug;
  }

  return agentMap;
}
