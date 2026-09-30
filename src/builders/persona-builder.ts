/**
 * src/builders/persona-builder.ts
 *
 * Core build orchestrator for @mistralys/persona-builder.
 *
 * Exports three public functions:
 *
 *  1. buildPersona(personaYamlPath, suiteName, suiteConfig, sharedMeta,
 *                  partialsMap, config, plugins, target, agentMap?)
 *     — Builds a single persona for a single target. Returns a BuildResult.
 *
 *  2. buildSuite(suiteName, suiteConfig, config, plugins, target, agentMap?)
 *     — Discovers all persona YAMLs for a suite, fires onSuiteInit, maps
 *       buildPersona() over each, and returns BuildResult[].
 *
 *  3. build(config)
 *     — Top-level entry point. Pre-scans all suites to build a cross-suite
 *       agent name map, then iterates all suites × targets, calls
 *       buildSuite() for each combination, and returns a BuildSummary.
 *       Respects --check (no writes) and --strict (fail on warnings/errors).
 *
 * Template variable injection (7-layer merge order, later layers win):
 *
 *  1. BuildConfig.variables    — global defaults; available to every suite
 *  2. SuiteConfig.variables    — suite-level overrides
 *  3. _shared.yaml fields      — shared metadata for the suite
 *  4. Per-persona YAML fields  — per-persona metadata
 *  5. Derived fields           — version fallback, tools serialisation, etc.
 *  6. Cross-suite agent map    — agent_<slug> / agent_slug_<slug> entries
 *  7. Target flags             — target_<name> booleans; always highest precedence
 *
 * Callers inject global or suite-scoped variables via `BuildConfig.variables`
 * and `SuiteConfig.variables` respectively. Both fields are forwarded by
 * buildPersona() to the internal buildContext() function as the two
 * lowest-priority layers in the merge chain.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { resolvePartials, collectPartialReferences } from '../engine/partials.js';
import { resolveConditionals } from '../engine/conditionals.js';
import { resolveVariables } from '../engine/variables.js';
import {
  collapseBlankLines,
  ensureBlankLineBeforeHeadings,
  normalizeNewlines,
} from '../engine/postProcessor.js';
import { serializeTools, serializeToolsList, serializeToolsBlock } from '../engine/serializer.js';
import { loadPartials } from '../loaders/partials-loader.js';
import {
  runSuiteInit,
  runPartials,
  runBuildContext,
  runPersonaPartials,
  runPostRender,
  runValidate,
} from '../plugins/runner.js';

import { resolveFrontmatterTemplate, renderFrontmatter } from './frontmatter.js';
import { resolveChangelogMeta } from '../utils/changelog.js';
import type { BuildConfig, BuildResult, BuildSummary, SkippedBuild } from './types.js';
import type { PersonaBuildPlugin, PersonaMetadata, SuiteConfig, TargetType, ValidationResult } from '../plugins/types.js';
import { defaultRegistry } from '../targets/built-in.js';
import { pickToolList, resolveTargetTools, resolveCapabilities } from '../targets/tools.js';
import type { TargetDefinition } from '../targets/types.js';
import type { TargetRegistry } from '../targets/registry.js';
import { discoverSuitePersonaYamls, loadPersonaYaml, loadRawYaml } from './persona-files.js';
import { agentNameMapFromIndex, scanPersonas } from './persona-index.js';
import type { PersonaIndex } from './persona-index.js';
import { validateSubagentRefs } from '../validators/subagent-validator.js';
import {
  validateToolRequirements,
  SUBAGENT_DISPATCH_REQUIREMENT,
} from '../validators/tool-requirements-validator.js';
import type { ToolRequirement } from '../validators/tool-requirements-validator.js';
import { validateToolParity } from '../validators/tool-parity-validator.js';
import type { TargetCapabilitySet } from '../validators/tool-parity-validator.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the output directory for a given target from a suite configuration.
 *
 * Resolution order (first match wins):
 *   1. `suiteConfig.outputDirs[definition.outputDirKey]` — generic map, takes precedence.
 *   2. `suiteConfig.outVscode` — deprecated fallback for the built-in 'vscode' key.
 *   3. `suiteConfig.outClaudeCode` — deprecated fallback for the built-in 'claude-code' key.
 *
 * The lookup key is `definition.outputDirKey` when a registry definition is
 * provided, falling back to the raw `target` name for unregistered targets
 * (where `outputDirKey` equals the name by convention).
 *
 * @param target      The build target name.
 * @param suiteConfig The suite configuration to resolve from.
 * @param definition  Optional registry definition for the target. When present,
 *                    `definition.outputDirKey` is used as the output dir map key.
 * @returns           Resolved output directory path.
 * @throws {Error}    When no output directory is configured for the target.
 */
function resolveOutputDir(
  target: string,
  suiteConfig: SuiteConfig,
  definition?: TargetDefinition,
): string {
  // Build a merged map: deprecated named fields provide the base, outputDirs overrides.
  const merged: Record<string, string> = {};
  if (suiteConfig.outVscode) merged['vscode'] = suiteConfig.outVscode;
  if (suiteConfig.outClaudeCode) merged['claude-code'] = suiteConfig.outClaudeCode;
  if (suiteConfig.outputDirs) Object.assign(merged, suiteConfig.outputDirs);

  // Use outputDirKey from the registry definition when available, falling back
  // to the target name for unregistered targets where outputDirKey === name.
  const lookupKey = definition?.outputDirKey ?? target;
  const dir = merged[lookupKey];
  if (dir) return dir;

  throw new Error(
    `buildPersona: no output directory configured for target "${target}". ` +
      `Add outputDirs['${lookupKey}'] to the suite config, or, for the built-in ` +
      `targets, provide the outVscode / outClaudeCode fields.`,
  );
}

/**
 * Build the merged template context for a single persona.
 *
 * Merge order (later values win):
 *   1. configVariables (lowest priority — global BuildConfig.variables)
 *   2. suiteVariables  (suite-level SuiteConfig.variables)
 *   3. sharedMeta      (parsed _shared.yaml fields)
 *   4. personaMeta     (per-persona YAML fields)
 *   5. derived/computed fields (version fallback, tools serialisation, etc.)
 *   6. agentMap entries (only for keys not already present)
 *   7. target flags    (injected last; always win)
 *
 * @param options.personaMeta      Per-persona YAML as a plain record
 * @param options.sharedMeta       Parsed `_shared.yaml` fields
 * @param options.agentMap         Cross-suite agent name map (injected by build())
 * @param options.target           The current build target (forwarded to plugins)
 * @param options.registry         Target registry for context-flag injection
 * @param options.configVariables  Optional global variables from BuildConfig.variables
 *                                 (lowest precedence; overridden by all other layers)
 * @param options.suiteVariables   Optional suite-level variables from SuiteConfig.variables
 *                                 (overrides configVariables; overridden by sharedMeta and personaMeta)
 * @returns                        Merged rendering context
 */
interface BuildContextOptions {
  personaMeta: Record<string, unknown>;
  sharedMeta: Record<string, unknown>;
  agentMap?: Record<string, string>;
  target?: TargetType;
  registry?: TargetRegistry;
  configVariables?: Record<string, unknown>;
  suiteVariables?: Record<string, unknown>;
}

function buildContext(options: BuildContextOptions): Record<string, unknown> {
  const {
    personaMeta,
    sharedMeta,
    agentMap = {},
    target,
    registry,
    configVariables,
    suiteVariables,
  } = options;
  const clMeta = resolveChangelogMeta(personaMeta['changelog']);
  const version =
    clMeta?.version ??
    (typeof sharedMeta['default_version'] === 'string' ? sharedMeta['default_version'] : '0.0.0');

  // Merge base: configVariables first (lowest priority), then suiteVariables,
  // then sharedMeta, then personaMeta (highest priority among YAML sources).
  const merged: Record<string, unknown> = {
    ...(configVariables ?? {}),
    ...(suiteVariables ?? {}),
    ...sharedMeta,
    ...personaMeta,
    version,
  };

  // Derive last_updated from changelog date when not already provided by YAML
  if (!('last_updated' in merged)) {
    merged['last_updated'] = clMeta?.date ?? '';
  }

  // ── Derived convenience fields (only set when not already provided) ───────
  // tools_list / tools_json — serialized from the `tools` array if present
  const tools = pickToolList(merged, 'tools') ?? [];
  if (!('tools_list' in merged)) {
    merged['tools_list'] = serializeToolsList(tools);
  }
  if (!('tools_json' in merged)) {
    merged['tools_json'] = serializeTools(tools);
  }

  // cc_tools_list / cc_tools_json — from `cc_tools` or fall back to `tools`
  const ccTools = pickToolList(merged, 'cc_tools') ?? [];
  if (!('cc_tools_list' in merged)) {
    merged['cc_tools_list'] = serializeToolsList(ccTools);
  }
  if (!('cc_tools_json' in merged)) {
    merged['cc_tools_json'] = serializeTools(ccTools);
  }

  // tools_block — block sequence from `tools` array
  if (!('tools_block' in merged)) {
    merged['tools_block'] = serializeToolsBlock(tools);
  }

  // cc_tools_block — block sequence from `cc_tools` or fall back to `tools`
  if (!('cc_tools_block' in merged)) {
    merged['cc_tools_block'] = serializeToolsBlock(ccTools);
  }

  // cc_file_name_stem — stem of cc_file_name (for default CC frontmatter template)
  if (!('cc_file_name_stem' in merged) && typeof merged['cc_file_name'] === 'string') {
    const ccFileName = merged['cc_file_name'] as string;
    merged['cc_file_name_stem'] = ccFileName.replace(/\.md$/, '');
  }

  // da_file_name_stem — stem of da_file_name (for deep-agents output)
  if (!('da_file_name_stem' in merged) && typeof merged['da_file_name'] === 'string') {
    const daFileName = merged['da_file_name'] as string;
    merged['da_file_name_stem'] = daFileName.replace(/\.md$/, '');
  }

  // da_tools_list / da_tools_json — from `da_tools` or fall back to `tools`
  // Intentionally gated on da_file_name: unlike cc_tools_list/cc_tools_json (always emitted for
  // every persona), da_* fields are absent when the persona has no deep-agents output file (AC-4).
  if (typeof merged['da_file_name'] === 'string') {
    const daTools = pickToolList(merged, 'da_tools') ?? [];
    if (!('da_tools_list' in merged)) {
      merged['da_tools_list'] = serializeToolsList(daTools);
    }
    if (!('da_tools_json' in merged)) {
      merged['da_tools_json'] = serializeTools(daTools);
    }
    if (!('da_tools_block' in merged)) {
      merged['da_tools_block'] = serializeToolsBlock(daTools);
    }
  }

  // ── Cross-suite agent name variables ──────────────────────────────────────
  for (const [key, value] of Object.entries(agentMap)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }

  // ── Target flag injection ─────────────────────────────────────────────────
  if (target !== undefined) {
    if (registry && registry.has(target)) {
      // Inject all contextFlags declared in the target's registry definition.
      const flags = registry.get(target).contextFlags ?? {};
      for (const [key, value] of Object.entries(flags)) {
        merged[key] = value;
      }
    } else {
      // Fallback for targets not present in the registry.
      merged[`target_${target.replace(/-/g, '_')}`] = true;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Tool requirements — applied-list computation and trigger detection
// ---------------------------------------------------------------------------

/**
 * Compute the effective list of `ToolRequirement`s for a build: the built-in
 * `SUBAGENT_DISPATCH_REQUIREMENT` first, then `config.toolRequirements`
 * entries. A config entry sharing an `id` with the built-in (or with an
 * earlier config entry) replaces it — only one requirement per `id` ever
 * applies.
 *
 * @param config  Top-level BuildConfig, whose optional `toolRequirements`
 *                supplies consumer-declared requirements.
 * @returns       The applied requirements, deduplicated by `id`.
 */
function computeAppliedToolRequirements(config: BuildConfig): ToolRequirement[] {
  const byId = new Map<string, ToolRequirement>();
  byId.set(SUBAGENT_DISPATCH_REQUIREMENT.id, SUBAGENT_DISPATCH_REQUIREMENT);

  for (const requirement of config.toolRequirements ?? []) {
    byId.set(requirement.id, requirement);
  }

  return Array.from(byId.values());
}

/**
 * Determine whether a `ToolRequirement` is triggered for the current
 * persona build.
 *
 *   - `{ field }` fires when the named key in the post-`onBuildContext`
 *     `context` is a non-empty array or a non-empty string.
 *   - `{ partial }` fires when the persona's raw content template
 *     transitively references the named partial (directly, or via one level
 *     of nesting — see `collectPartialReferences()`), using **this target's**
 *     `personaPartialsMap` — partial content can differ per target when an
 *     `onPersonaPartials` plugin injects target-specific overrides, so the
 *     same trigger check can, in principle, give a different answer per
 *     target even though `bodyTemplate` itself does not vary by target.
 *
 * @param requirement        The requirement to test.
 * @param context             Post-`onBuildContext` rendering context.
 * @param bodyTemplate        Raw (unrendered) content template for this persona.
 * @param personaPartialsMap  This target's persona-scoped partials map.
 * @returns                   `true` when the requirement's trigger condition holds.
 */
function isToolRequirementTriggered(
  requirement: ToolRequirement,
  context: Record<string, unknown>,
  bodyTemplate: string,
  personaPartialsMap: Record<string, string>,
): boolean {
  if ('field' in requirement.when) {
    const value = context[requirement.when.field];
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.length > 0;
    return false;
  }

  const referenced = collectPartialReferences(bodyTemplate, personaPartialsMap);
  return referenced.has(requirement.when.partial);
}

// ---------------------------------------------------------------------------
// buildPersona — single persona × single target
// ---------------------------------------------------------------------------

/**
 * Build a single persona for a single output target.
 *
 * **Does not apply `targets`.** Per-persona target filtering (see
 * `resolvePersonaTargets()` in `src/builders/persona-index.ts`) is a
 * `buildSuite()`/`build()` concern only — `buildPersona()` always renders
 * and (unless `check` mode) writes the requested persona × target
 * combination, regardless of the persona's declared or resolved `targets`.
 * A direct `buildPersona()` call is an explicit request to build exactly
 * that one combination, so it is never silently skipped.
 *
 * Pipeline:
 *   1. Load sharedMeta + personaMeta (callers supply pre-loaded values)
 *   2. Build merged context
 *   3. Run onBuildContext plugin hooks (context accumulation)
 *   4. Run onPersonaPartials plugin hooks (shallow-copy partials map, persona-scoped)
 *   5. Render frontmatter template → render frontmatter
 *   6. Load content template
 *   7. Render body: partials → conditionals → variables → post-process
 *   8. Assemble final output (frontmatter + body)
 *   9. Run onPostRender plugin hooks (output chain)
 *  10. Run onValidate plugin hooks (validation collection)
 *  11. Determine output file path
 *  12. Write output file (unless check mode)
 *  13. Return BuildResult
 *
 * @param personaYamlPath  Absolute path to the persona YAML source file
 * @param suiteName        Identifier for the suite this persona belongs to
 * @param suiteConfig      Suite configuration object. `suiteConfig.variables`
 *                         is forwarded to `buildContext()` as the
 *                         `suiteVariables` layer (layer 2 of 7) — these values
 *                         override any `config.variables` but are themselves
 *                         overridden by `_shared.yaml` and per-persona fields.
 * @param sharedMeta       Pre-loaded `_shared.yaml` contents
 * @param partialsMap      Pre-loaded partials map (shared + suite-local merged).
 *                         This map is **not** passed directly to rendering.
 *                         Instead, a shallow copy (`{ ...partialsMap }`) is
 *                         created at step 3b and passed to the `onPersonaPartials`
 *                         plugin hooks — the hooks' accumulated output map is what
 *                         reaches `resolvePartials`, not `partialsMap` itself.
 *                         This ensures that persona-level overrides or injections
 *                         do not leak back into the caller's reference or into
 *                         subsequent personas in the same suite.
 * @param config           Top-level BuildConfig. `config.variables` is
 *                         forwarded to `buildContext()` as the
 *                         `configVariables` layer (layer 1 of 7, lowest
 *                         priority) — global defaults available to every
 *                         persona across all suites.
 * @param plugins          Registered plugins
 * @param target           Target output format
 * @param agentMap         Pre-built cross-suite agent name map. Unchanged in
 *                         role and position: still the sole source of the
 *                         `agent_*` context variables (layer 6 of 7), and
 *                         still the key source for the sub-agent
 *                         unknown-slug check regardless of whether
 *                         `personaIndex` is supplied.
 * @param registry         Target registry to use. Defaults to `defaultRegistry`.
 *   **Two-registry limitation:** If you pass a custom `TargetRegistry` only
 *   to `build()` (via `config.targetRegistry`) and call `buildPersona()`
 *   directly without also passing that registry here, your custom targets
 *   will not be visible — `defaultRegistry` will be used instead. Either
 *   pass the same registry instance explicitly, or call `build()` to have
 *   the registry forwarded automatically.
 * @param personaIndex     Optional cross-suite `PersonaIndex` (see
 *   `src/builders/persona-index.ts`), enabling `validateSubagentRefs()`'s
 *   target-aware check — a declared sub-agent slug that exists but is not
 *   built for `target` becomes a second, independent error. When omitted,
 *   only the unknown-slug check (keyed on `agentMap`) runs, exactly as
 *   before this parameter existed. Note this is unrelated to per-persona
 *   `targets` filtering: `buildPersona()` never applies `targets` to itself
 *   (see the note above) — `personaIndex` here only informs the sub-agent
 *   reference check.
 * @returns                BuildResult for this persona × target combination
 */
export async function buildPersona(
  personaYamlPath: string,
  suiteName: string,
  suiteConfig: SuiteConfig,
  sharedMeta: Record<string, unknown>,
  partialsMap: Record<string, string>,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap: Record<string, string> = {},
  registry: TargetRegistry = defaultRegistry,
  personaIndex?: PersonaIndex,
): Promise<BuildResult> {
  // ── 1. Load persona metadata ──────────────────────────────────────────────
  const personaMeta = await loadPersonaYaml(personaYamlPath);

  // ── 2. Build merged context ───────────────────────────────────────────────
  let context = buildContext({
    personaMeta,
    sharedMeta,
    agentMap,
    target,
    registry,
    configVariables: config.variables,
    suiteVariables: suiteConfig.variables,
  });

  // ── 3. Plugin onBuildContext ──────────────────────────────────────────────
  // Cast context to PersonaMetadata for the plugin runner (it requires a
  // name field which is guaranteed by loadPersonaYaml above).
  const personaMetaTyped = personaMeta as PersonaMetadata;
  context = runBuildContext(plugins, context, personaMetaTyped, suiteConfig, target);

  // ── 4. Plugin onPersonaPartials ──────────────────────────────────────────────
  // Create a shallow copy of the suite-level partials map so that any
  // persona-level overrides or injections do not leak to other personas.
  // The copy is then mutated (accumulated) by onPersonaPartials plugins and
  // used exclusively for this persona's rendering pass.
  const personaPartialsMap = runPersonaPartials(
    plugins,
    { ...partialsMap },
    personaMetaTyped,
    context,
    suiteConfig,
    target,
  );

  // ── 5. Render frontmatter ─────────────────────────────────────────────────
  const fmTemplate = resolveFrontmatterTemplate(target, plugins, config.frontmatter, registry);
  const contentBasename = path.basename(personaYamlPath, '.yaml') + '.md';
  const frontmatter = renderFrontmatter(fmTemplate, context, contentBasename);

  // ── 6. Load content template ──────────────────────────────────────────────
  const contentSubdir = suiteConfig.contentSubdir ?? 'content';
  const contentPath = path.join(suiteConfig.srcDir, contentSubdir, contentBasename);
  const bodyTemplate = normalizeNewlines(await readFile(contentPath, 'utf8'));

  // ── 7. Render body ────────────────────────────────────────────────────────
  let body = resolvePartials(bodyTemplate, personaPartialsMap);
  body = resolveConditionals(body, context);
  body = resolveVariables(body, context, contentBasename);
  body = collapseBlankLines(body);
  body = ensureBlankLineBeforeHeadings(body);
  body = body.trimEnd();

  // ── 8. Assemble output ────────────────────────────────────────────────────
  let output = normalizeNewlines(`${frontmatter}\n\n${body}\n`);

  // ── 9. Plugin onPostRender ────────────────────────────────────────────────
  output = runPostRender(plugins, output, personaMetaTyped, target);

  // ── 10. Plugin onValidate + subagent ref validation + tool requirements ──
  // Resolve the registry definition once — used for tool-requirement
  // validation here, and for outputDirKey / filenameContextKey below (step 11).
  const def = registry.has(target) ? registry.get(target) : undefined;

  // effectiveTools feeds both validateToolRequirements() and the returned
  // BuildResult — a target absent from the registry (no TargetDefinition)
  // has no capability map to resolve against, so effectiveTools stays
  // undefined and the tool-requirements check is skipped entirely for it.
  const effectiveTools = def ? resolveTargetTools(context, def) : undefined;

  const appliedToolRequirements = computeAppliedToolRequirements(config);
  const triggeredToolRequirements = appliedToolRequirements.filter((requirement) =>
    isToolRequirementTriggered(requirement, context, bodyTemplate, personaPartialsMap),
  );

  const validationResults: ValidationResult[] = [
    ...runValidate(plugins, personaMetaTyped, suiteConfig, target),
    ...validateSubagentRefs(personaMetaTyped, agentMap, personaIndex, target),
    ...(def
      ? validateToolRequirements({
          personaName: personaMetaTyped.name,
          target,
          effectiveTools,
          triggered: triggeredToolRequirements,
          definition: def,
          registry,
        })
      : []),
  ];

  // ── 11. Determine output file path ────────────────────────────────────────
  const outputDir = resolveOutputDir(target, suiteConfig, def);
  // Use the filename context key declared in the target's registry definition,
  // falling back to the content basename when absent or unset in context.
  const fnKey = def?.filenameContextKey;
  const outputBasename =
    fnKey && typeof context[fnKey] === 'string'
      ? (context[fnKey] as string)
      : contentBasename;
  const outputPath = path.join(outputDir, outputBasename);

  // ── 12. Write (unless check mode) ─────────────────────────────────────────
  const check = config.check ?? false;
  let written = false;

  if (!check) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, output, 'utf8');
    written = true;
  }

  return {
    suite: suiteName,
    target,
    personaYamlPath,
    outputPath,
    content: output,
    validationResults,
    written,
    effectiveTools,
  };
}

// ---------------------------------------------------------------------------
// buildSuite — all personas in one suite × one target
// ---------------------------------------------------------------------------

/**
 * Build all personas in a suite for a single output target.
 *
 * Pipeline:
 *   1. Load `_shared.yaml` for the suite
 *   2. Load merged partials (config.partials → shared → suite-local)
 *   3. Run `onSuiteInit` on all plugins
 *   4. Run `onPartials` on all plugins (highest priority: may override any file-based partial)
 *   5. Discover all persona YAML files
 *   6. Call `buildPersona()` for each persona resolved to build for `target`
 *      (see `personaIndex` below) — an excluded persona is skipped entirely:
 *      no context is built, no plugin hooks run, and nothing is written.
 *      `build()` records these skips in `BuildSummary.skipped`; a direct
 *      `buildSuite()` caller sees only the (already-filtered) `BuildResult[]`.
 *
 * @param suiteName    Identifier for this suite
 * @param suiteConfig  Suite configuration
 * @param config       Top-level BuildConfig
 * @param plugins      Registered plugins
 * @param target       Target output format
 * @param agentMap     Pre-built cross-suite agent name map
 * @param registry     Target registry to use. Defaults to `defaultRegistry`.
 *   **Two-registry limitation:** If you pass a custom `TargetRegistry` only
 *   to `build()` (via `config.targetRegistry`) and call `buildSuite()`
 *   directly without also passing that registry here, your custom targets
 *   will not be visible — `defaultRegistry` will be used instead. Either
 *   pass the same registry instance explicitly, or call `build()` to have
 *   the registry forwarded automatically.
 * @param personaIndex Optional cross-suite `PersonaIndex` (see
 *   `src/builders/persona-index.ts`), used to look up each persona's
 *   resolved `targets` by YAML path without re-scanning. When omitted,
 *   `buildSuite()` scans its own suite alone (`scanPersonas()` over a
 *   single-suite `BuildConfig`) to resolve the same information — a direct
 *   `buildSuite()` call therefore still filters correctly, at the cost of
 *   one extra suite-local scan. Note this differs from `buildPersona()`,
 *   which never applies `targets` regardless of whether an index is
 *   available — target filtering is a `buildSuite()`/`build()` concern only,
 *   since a direct `buildPersona()` call is an explicit request to build
 *   exactly that one persona × target combination. The same index (given or
 *   self-scanned) is also forwarded to every `buildPersona()` call, enabling
 *   `validateSubagentRefs()`'s target-aware check there.
 * @returns            Array of BuildResult objects, one per persona resolved
 *                     to build for `target` (excluded personas are omitted,
 *                     not represented by a null or failed entry)
 */
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap: Record<string, string> = {},
  registry: TargetRegistry = defaultRegistry,
  personaIndex?: PersonaIndex,
): Promise<BuildResult[]> {
  // ── 1. Load shared metadata ───────────────────────────────────────────────
  const metaSubdir = suiteConfig.metaSubdir ?? 'meta';
  const sharedYamlPath = path.join(suiteConfig.srcDir, metaSubdir, '_shared.yaml');
  const sharedMeta = await loadRawYaml(sharedYamlPath);

  // ── 2. Load partials (three-layer: config.partials → shared → suite-local) ─
  // Start with config.partials as the lowest-priority base layer.
  let partialsMap: Record<string, string> = { ...(config.partials ?? {}) };

  if (config.sharedPartialsDir && existsSync(config.sharedPartialsDir)) {
    partialsMap = { ...partialsMap, ...(await loadPartials(config.sharedPartialsDir)) };
  }

  const partialsSubdir = suiteConfig.partialsSubdir ?? 'partials';
  const suitePartialsDir = path.join(suiteConfig.srcDir, partialsSubdir);
  if (existsSync(suitePartialsDir)) {
    partialsMap = { ...partialsMap, ...(await loadPartials(suitePartialsDir)) };
  }

  // ── 3. Plugin onSuiteInit ─────────────────────────────────────────────────
  runSuiteInit(plugins, suiteConfig, sharedMeta);

  // ── 4. Plugin onPartials ────────────────────────────────────────────────────
  // Invoked after onSuiteInit and after all file-based partials are loaded.
  // Plugins may inject new partials or override any file-based entry.
  partialsMap = runPartials(plugins, partialsMap, suiteName, suiteConfig);

  // ── 5. Discover persona YAML files ───────────────────────────────────────
  const personaYamlPaths = await discoverSuitePersonaYamls(suiteConfig);

  // Resolve each persona's `targets`, reusing the given cross-suite index
  // when available. Without one, self-scan this suite alone — this is what
  // lets a direct buildSuite() call (no index) still filter correctly (see
  // the `personaIndex` @param note above).
  const index = personaIndex ?? (await scanPersonas({ suites: { [suiteName]: suiteConfig } }, registry));
  const resolvedTargetsByYamlPath = new Map<string, string[]>();
  for (const entry of index.entries) {
    if (entry.suite === suiteName) {
      resolvedTargetsByYamlPath.set(entry.yamlPath, entry.targets);
    }
  }

  // ── 6. Build each persona resolved to build for `target` ─────────────────
  const results: BuildResult[] = [];
  for (const yamlPath of personaYamlPaths) {
    const resolvedTargets = resolvedTargetsByYamlPath.get(yamlPath);
    // A persona absent from the index (should not normally happen — the
    // index was scanned from the same suite directory) is built rather than
    // silently dropped: an unresolvable filtering decision must not delete
    // output.
    if (resolvedTargets && !resolvedTargets.includes(target)) {
      continue;
    }

    const result = await buildPersona(
      yamlPath,
      suiteName,
      suiteConfig,
      sharedMeta,
      partialsMap,
      config,
      plugins,
      target,
      agentMap,
      registry,
      index,
    );
    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// build — top-level entry point
// ---------------------------------------------------------------------------

/**
 * Top-level build orchestrator.
 *
 * Iterates all `config.suites × config.targets` combinations, calls
 * `buildSuite()` for each, and aggregates the results into a `BuildSummary`.
 * A persona whose resolved `targets` (see `resolvePersonaTargets()`) exclude
 * a given target is not built for it — `buildSuite()` skips it, and `build()`
 * records the skip in `BuildSummary.skipped` (derived from the same
 * `PersonaIndex` `buildSuite()` used, so the two cannot disagree). Errors
 * found while resolving `targets` (unknown target, non-string entry, empty
 * array) — and unrecognised `tool_parity_exceptions` names — are surfaced in
 * `BuildSummary.issues`.
 *
 * After every suite × target has built, a **capability parity post-pass**
 * groups results by `personaYamlPath` and runs `validateToolParity()` across
 * every target the persona was actually built for (only targets with a
 * capability map and a defined `effectiveTools` participate) — this cannot
 * run inside `buildPersona()`/`buildSuite()`, since a single-target build
 * never sees another target's effective tool list. Findings are appended
 * directly to the lacking target's own `BuildResult.validationResults`.
 *
 * Modes:
 *   - Normal: renders and writes all personas.
 *   - `check: true`: renders without writing; useful for CI staleness checks.
 *   - `strict: true`: throws when any ValidationResult has severity `'error'`
 *     or `'warning'`. All suites are processed before the throw, so output
 *     files **will** be written to disk even when the build ultimately fails.
 *     **For CI usage, combine `strict: true` with `check: true`** to avoid
 *     leaving partial artefacts on disk when validation fails.
 *
 * @param config  Typed build configuration
 * @returns       Aggregated BuildSummary
 * @throws        `Error` when `strict: true` and validation failures exist
 */
export async function build(config: BuildConfig): Promise<BuildSummary> {
  const plugins = config.plugins ?? [];
  const registry = config.targetRegistry ?? defaultRegistry;
  // When a custom registry is supplied and targets are not explicit, build all
  // registered targets. When using the default registry without an explicit
  // targets list, build only targets with defaultEnabled !== false. This
  // preserves the historical two-target default (vscode + claude-code) for
  // existing suite configs that do not configure deep-agents output.
  const targets = config.targets ?? registry.names().filter(n => registry.get(n).defaultEnabled !== false);
  const allResults: BuildResult[] = [];

  // Pre-scan: index every persona once (targets, parity exceptions, and the
  // data the cross-suite agent name map is derived from), then derive the
  // agent map from it. Deriving both from a single scan means they cannot
  // disagree — see persona-index.ts.
  const personaIndex = await scanPersonas(config, registry);
  const agentMap = agentNameMapFromIndex(personaIndex);

  const skipped: SkippedBuild[] = [];

  for (const [suiteName, suiteConfig] of Object.entries(config.suites)) {
    for (const target of targets) {
      const suiteResults = await buildSuite(
        suiteName,
        suiteConfig,
        config,
        plugins,
        target,
        agentMap,
        registry,
        personaIndex,
      );
      allResults.push(...suiteResults);
    }
  }

  // Every persona × active-target combination whose resolved `targets`
  // excluded that target was skipped by buildSuite() above (never built,
  // never written). Derived directly from the same index buildSuite() used,
  // so this list cannot disagree with what was actually skipped.
  for (const entry of personaIndex.entries) {
    for (const target of targets) {
      if (!entry.targets.includes(target)) {
        skipped.push({ suite: entry.suite, target, personaYamlPath: entry.yamlPath });
      }
    }
  }

  // ── Capability parity post-pass ────────────────────────────────────────────
  // Runs after every suite × target has built, since a single-target
  // buildPersona() call never sees another target's effective tool list.
  // Groups results by personaYamlPath — a persona excluded from a given
  // target via `targets` simply has no BuildResult for it, so it naturally
  // never participates against that target.
  const resultsByYamlPath = new Map<string, BuildResult[]>();
  for (const result of allResults) {
    const bucket = resultsByYamlPath.get(result.personaYamlPath);
    if (bucket) {
      bucket.push(result);
    } else {
      resultsByYamlPath.set(result.personaYamlPath, [result]);
    }
  }

  const entryByYamlPath = new Map(personaIndex.entries.map((entry) => [entry.yamlPath, entry]));

  for (const [yamlPath, results] of resultsByYamlPath) {
    // Only targets with a capability map and a defined effective tool list
    // take part — this is what keeps deep-agents (no capability map) and
    // any result with no resolved tool list out of the comparison entirely.
    const perTarget: TargetCapabilitySet[] = [];

    for (const result of results) {
      if (result.effectiveTools === undefined) continue;
      const def = registry.has(result.target) ? registry.get(result.target) : undefined;
      if (!def?.toolCapabilities) continue;

      perTarget.push({
        target: result.target,
        capabilities: resolveCapabilities(result.effectiveTools, def),
        toolCapabilities: def.toolCapabilities,
      });
    }

    const entry = entryByYamlPath.get(yamlPath);
    const personaLabel = entry?.name ?? yamlPath;
    const exceptions = entry?.toolParityExceptions ?? [];

    const findings = validateToolParity(personaLabel, perTarget, exceptions);

    for (const finding of findings) {
      const targetResult = results.find((r) => r.target === finding.target);
      targetResult?.validationResults.push(finding.result);
    }
  }

  // Collect every error/warning-severity finding — both per-result
  // validationResults (plugin onValidate, subagent refs, tool requirements,
  // tool parity) and index-level issues (resolvePersonaTargets errors,
  // unrecognised tool_parity_exceptions names). Unlike before, this is no
  // longer gated behind `config.strict`: errors now fail every build by
  // default (see plan §G), so the CLI and any caller need this list
  // regardless of strict mode to know what to print and why `success` is
  // false. `strictFailures` keeps its name and its error/warning-only
  // filter, but now always includes `issues` too.
  const strictFailures: ValidationResult[] = [
    ...allResults.flatMap((r) => r.validationResults),
    ...personaIndex.issues,
  ].filter((v) => v.severity === 'error' || v.severity === 'warning');

  const errors = strictFailures.filter((v) => v.severity === 'error').length;
  const warnings = strictFailures.filter((v) => v.severity === 'warning').length;

  // Errors always fail the build now — the sole prior consumer (AI Insights)
  // and the library's own CLI have no other reason to see an error-severity
  // result and continue silently. `strict` additionally fails on warnings.
  const success = errors === 0 && (!config.strict || warnings === 0);

  const summary: BuildSummary = {
    success,
    results: allResults,
    strictFailures,
    totalBuilt: allResults.length,
    totalWritten: allResults.filter((r) => r.written).length,
    skipped,
    issues: personaIndex.issues,
    errors,
    warnings,
  };

  // The strict throw is unchanged: it only fires in strict mode. A
  // non-strict build with errors returns `success: false` without throwing
  // — callers (e.g. the CLI) check `summary.success` themselves.
  if (config.strict && !success) {
    const messages = strictFailures.map((f) => `[${f.severity}] ${f.message}`).join('\n');
    throw new Error(
      `Build failed in strict mode — ${strictFailures.length} validation issue(s):\n${messages}`,
    );
  }

  return summary;
}
