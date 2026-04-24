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

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import { resolvePartials } from '../engine/partials.js';
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
import type { BuildConfig, BuildResult, BuildSummary } from './types.js';
import type { PersonaBuildPlugin, PersonaMetadata, SuiteConfig, TargetType, ValidationResult } from '../plugins/types.js';
import { defaultRegistry } from '../targets/built-in.js';
import type { TargetDefinition } from '../targets/types.js';
import type { TargetRegistry } from '../targets/registry.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Discover all persona YAML files in the `meta/` subdirectory of a suite.
 *
 * Excludes files whose names start with `_` (shared metadata files such as
 * `_shared.yaml`).  Results are sorted lexicographically.
 *
 * @param suiteConfig  Suite configuration (used to locate `metaSubdir`)
 * @returns            Absolute paths to each persona YAML file, sorted.
 */
async function discoverSuitePersonaYamls(suiteConfig: SuiteConfig): Promise<string[]> {
  const metaSubdir = suiteConfig.metaSubdir ?? 'meta';
  const metaDir = path.join(suiteConfig.srcDir, metaSubdir);

  const entries = await readdir(metaDir, { withFileTypes: true });

  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.yaml') && !e.name.startsWith('_'))
    .map((e) => path.join(metaDir, e.name))
    .sort();
}

/**
 * Load and parse a raw YAML file into a plain object.
 * Used for `_shared.yaml` which does not conform to PersonaMetadata's
 * `name` requirement.
 *
 * @param filePath  Absolute path to the YAML file
 * @returns         Parsed object, or {} when the file is empty/absent
 */
async function loadRawYaml(filePath: string): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) return {};
  const raw = await readFile(filePath, 'utf8');
  const parsed: unknown = yaml.load(raw);
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

/**
 * Load a persona YAML file and return it as a plain metadata record.
 * The `name` field is derived from the filename stem when absent.
 *
 * @param yamlPath  Absolute path to the persona YAML file
 * @returns         Merged metadata record ready for context building
 */
async function loadPersonaYaml(yamlPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(yamlPath, 'utf8');
  const parsed: unknown = yaml.load(raw);

  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`buildPersona: expected a YAML object in "${yamlPath}"`);
  }

  const record = parsed as Record<string, unknown>;

  // Derive name from filename stem if not present in YAML
  if (!record['name']) {
    record['name'] = path.basename(yamlPath, '.yaml');
  }

  return record;
}

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
 * Pre-scan all suites and build a cross-suite agent name map.
 *
 * For each persona across all configured suites, creates a context variable:
 *   key:   `agent_` + slug (hyphens → underscores)
 *   value: `"<name> v<version>"`
 *
 * Slug is taken from the persona YAML's `slug` field, falling back to the
 * filename stem. Version falls back to the suite's `default_version`, then
 * to `'0.0.0'`.
 *
 * @param config  Top-level BuildConfig with all suite definitions
 * @returns       Map of agent variable keys to display strings
 */
async function buildAgentNameMap(
  config: BuildConfig,
): Promise<Record<string, string>> {
  const agentMap: Record<string, string> = {};

  for (const [, suiteConfig] of Object.entries(config.suites)) {
    const metaSubdir = suiteConfig.metaSubdir ?? 'meta';
    const sharedYamlPath = path.join(suiteConfig.srcDir, metaSubdir, '_shared.yaml');
    const sharedMeta = await loadRawYaml(sharedYamlPath);
    const defaultVersion =
      typeof sharedMeta['default_version'] === 'string'
        ? sharedMeta['default_version']
        : '0.0.0';

    const personaYamls = await discoverSuitePersonaYamls(suiteConfig);

    for (const yamlPath of personaYamls) {
      const persona = await loadPersonaYaml(yamlPath);

      const slug =
        typeof persona['slug'] === 'string'
          ? persona['slug']
          : path.basename(yamlPath, '.yaml');

      const name =
        typeof persona['name'] === 'string'
          ? persona['name']
          : slug;

      const version =
        typeof persona['version'] === 'string'
          ? persona['version']
          : defaultVersion;

      const underscoredSlug = slug.replace(/-/g, '_');
      const key = `agent_${underscoredSlug}`;
      agentMap[key] = `${name} v${version}`;

      const slugKey = `agent_slug_${underscoredSlug}`;
      agentMap[slugKey] = slug;
    }
  }

  return agentMap;
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
  const version =
    typeof personaMeta['version'] === 'string'
      ? personaMeta['version']
      : typeof sharedMeta['default_version'] === 'string'
        ? sharedMeta['default_version']
        : '0.0.0';

  // Merge base: configVariables first (lowest priority), then suiteVariables,
  // then sharedMeta, then personaMeta (highest priority among YAML sources).
  const merged: Record<string, unknown> = {
    ...(configVariables ?? {}),
    ...(suiteVariables ?? {}),
    ...sharedMeta,
    ...personaMeta,
    version,
  };

  // ── Derived convenience fields (only set when not already provided) ───────
  // tools_list / tools_json — serialized from the `tools` array if present
  const tools = Array.isArray(merged['tools']) ? (merged['tools'] as string[]) : [];
  if (!('tools_list' in merged)) {
    merged['tools_list'] = serializeToolsList(tools);
  }
  if (!('tools_json' in merged)) {
    merged['tools_json'] = serializeTools(tools);
  }

  // cc_tools_list / cc_tools_json — from `cc_tools` or fall back to `tools`
  const ccTools = Array.isArray(merged['cc_tools']) ? (merged['cc_tools'] as string[]) : tools;
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
    const daTools = Array.isArray(merged['da_tools']) ? (merged['da_tools'] as string[]) : tools;
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
// buildPersona — single persona × single target
// ---------------------------------------------------------------------------

/**
 * Validate that all slugs declared in a persona's `subagents` field exist
 * in the cross-suite agent map.
 *
 * The agent map contains keys in the form `agent_slug_{underscored_slug}`
 * (hyphens replaced by underscores).  A declared slug is considered valid
 * when its corresponding key is present in the map.
 *
 * @param persona   Typed persona metadata (may or may not have `subagents`)
 * @param agentMap  Cross-suite agent name map built by `buildAgentNameMap()`
 * @returns         `ValidationResult[]` — one error per unknown slug, or `[]`
 */
function validateSubagentRefs(
  persona: PersonaMetadata,
  agentMap: Record<string, string>,
): ValidationResult[] {
  const subagents = persona.subagents;
  if (!Array.isArray(subagents) || subagents.length === 0) return [];

  const results: ValidationResult[] = [];

  for (const slug of subagents) {
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

  return results;
}

/**
 * Build a single persona for a single output target.
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
 * @param agentMap         Pre-built cross-suite agent name map
 * @param registry         Target registry to use. Defaults to `defaultRegistry`.
 *   **Two-registry limitation:** If you pass a custom `TargetRegistry` only
 *   to `build()` (via `config.targetRegistry`) and call `buildPersona()`
 *   directly without also passing that registry here, your custom targets
 *   will not be visible — `defaultRegistry` will be used instead. Either
 *   pass the same registry instance explicitly, or call `build()` to have
 *   the registry forwarded automatically.
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

  // ── 10. Plugin onValidate + subagent ref validation ─────────────────────
  const validationResults: ValidationResult[] = [
    ...runValidate(plugins, personaMetaTyped, suiteConfig, target),
    ...validateSubagentRefs(personaMetaTyped, agentMap),
  ];

  // ── 11. Determine output file path ────────────────────────────────────────
  // Resolve the registry definition once — used for both outputDirKey (map
  // lookup) and filenameContextKey (output filename override).
  const def = registry.has(target) ? registry.get(target) : undefined;
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
 *   6. Call `buildPersona()` for each
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
 * @returns            Array of BuildResult objects, one per persona
 */
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap: Record<string, string> = {},
  registry: TargetRegistry = defaultRegistry,
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

  // ── 6. Build each persona ────────────────────────────────────────────────────
  const results: BuildResult[] = [];
  for (const yamlPath of personaYamlPaths) {
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

  // Pre-scan: build cross-suite agent name map
  const agentMap = await buildAgentNameMap(config);

  for (const [suiteName, suiteConfig] of Object.entries(config.suites)) {
    for (const target of targets) {
      const suiteResults = await buildSuite(suiteName, suiteConfig, config, plugins, target, agentMap, registry);
      allResults.push(...suiteResults);
    }
  }

  // Collect strict failures (error + warning severity)
  const strictFailures: ValidationResult[] = config.strict
    ? allResults.flatMap((r) =>
        r.validationResults.filter(
          (v) => v.severity === 'error' || v.severity === 'warning',
        ),
      )
    : [];

  const success = !config.strict || strictFailures.length === 0;

  const summary: BuildSummary = {
    success,
    results: allResults,
    strictFailures,
    totalBuilt: allResults.length,
    totalWritten: allResults.filter((r) => r.written).length,
  };

  if (config.strict && !success) {
    const messages = strictFailures.map((f) => `[${f.severity}] ${f.message}`).join('\n');
    throw new Error(
      `Build failed in strict mode — ${strictFailures.length} validation issue(s):\n${messages}`,
    );
  }

  return summary;
}
