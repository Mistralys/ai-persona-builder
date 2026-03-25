/**
 * src/builders/persona-builder.ts
 *
 * Core build orchestrator for @smor/persona-build.
 *
 * Exports three public functions:
 *
 *  1. buildPersona(personaYamlPath, suiteName, suiteConfig, sharedMeta,
 *                  partialsMap, config, plugins)
 *     — Builds a single persona for a single target. Returns a BuildResult.
 *
 *  2. buildSuite(suiteName, suiteConfig, config, plugins)
 *     — Discovers all persona YAMLs for a suite, fires onSuiteInit, maps
 *       buildPersona() over each, and returns BuildResult[].
 *
 *  3. build(config)
 *     — Top-level entry point. Iterates all suites × targets, calls
 *       buildSuite() for each combination, and returns a BuildSummary.
 *       Respects --check (no writes) and --strict (fail on warnings/errors).
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
import { serializeTools, serializeToolsList } from '../engine/serializer.js';
import { loadPartials } from '../loaders/partials-loader.js';
import {
  runSuiteInit,
  runBuildContext,
  runPostRender,
  runValidate,
} from '../plugins/runner.js';

import { resolveFrontmatterTemplate, renderFrontmatter } from './frontmatter.js';
import type { BuildConfig, BuildResult, BuildSummary } from './types.js';
import type { PersonaBuildPlugin, PersonaMetadata, SuiteConfig, ValidationResult } from '../plugins/types.js';

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
 * Build the merged template context for a single persona.
 *
 * Merge order (later values win):
 *   1. sharedMeta (suite-level defaults)
 *   2. per-persona YAML fields
 *   3. derived/computed fields (version fallback, etc.)
 *
 * @param personaMeta  Per-persona YAML as a plain record
 * @param sharedMeta   Parsed `_shared.yaml` fields
 * @returns            Merged rendering context
 */
function buildContext(
  personaMeta: Record<string, unknown>,
  sharedMeta: Record<string, unknown>,
): Record<string, unknown> {
  const version =
    typeof personaMeta['version'] === 'string'
      ? personaMeta['version']
      : typeof sharedMeta['default_version'] === 'string'
        ? sharedMeta['default_version']
        : '0.0.0';

  // Merge base: shared first, persona overrides
  const merged: Record<string, unknown> = {
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

  // cc_file_name_stem — stem of cc_file_name (for default CC frontmatter template)
  if (!('cc_file_name_stem' in merged) && typeof merged['cc_file_name'] === 'string') {
    const ccFileName = merged['cc_file_name'] as string;
    merged['cc_file_name_stem'] = ccFileName.replace(/\.md$/, '');
  }

  return merged;
}

// ---------------------------------------------------------------------------
// buildPersona — single persona × single target
// ---------------------------------------------------------------------------

/**
 * Build a single persona for a single output target.
 *
 * Pipeline:
 *   1. Load sharedMeta + personaMeta (callers supply pre-loaded values)
 *   2. Build merged context
 *   3. Run onBuildContext plugin hooks (context accumulation)
 *   4. Resolve frontmatter template → render frontmatter
 *   5. Load content template
 *   6. Render body: partials → conditionals → variables → post-process
 *   7. Assemble final output (frontmatter + body)
 *   8. Run onPostRender plugin hooks (output chain)
 *   9. Run onValidate plugin hooks (validation collection)
 *  10. Determine output file path
 *  11. Write output file (unless check mode)
 *  12. Return BuildResult
 *
 * @param personaYamlPath  Absolute path to the persona YAML source file
 * @param suiteName        Identifier for the suite this persona belongs to
 * @param suiteConfig      Suite configuration object
 * @param sharedMeta       Pre-loaded `_shared.yaml` contents
 * @param partialsMap      Pre-loaded partials map (shared + suite-local merged)
 * @param config           Top-level BuildConfig
 * @param plugins          Registered plugins
 * @param target           Target output format
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
  target: 'vscode' | 'claude-code',
): Promise<BuildResult> {
  // ── 1. Load persona metadata ──────────────────────────────────────────────
  const personaMeta = await loadPersonaYaml(personaYamlPath);

  // ── 2. Build merged context ───────────────────────────────────────────────
  let context = buildContext(personaMeta, sharedMeta);

  // ── 3. Plugin onBuildContext ──────────────────────────────────────────────
  // Cast context to PersonaMetadata for the plugin runner (it requires a
  // name field which is guaranteed by loadPersonaYaml above).
  const personaMetaTyped = personaMeta as PersonaMetadata;
  context = runBuildContext(plugins, context, personaMetaTyped, suiteConfig);

  // ── 4. Render frontmatter ─────────────────────────────────────────────────
  const fmTemplate = resolveFrontmatterTemplate(target, plugins, config.frontmatter);
  const contentBasename = path.basename(personaYamlPath, '.yaml') + '.md';
  const frontmatter = renderFrontmatter(fmTemplate, context, contentBasename);

  // ── 5. Load content template ──────────────────────────────────────────────
  const contentSubdir = suiteConfig.contentSubdir ?? 'content';
  const contentPath = path.join(suiteConfig.srcDir, contentSubdir, contentBasename);
  const bodyTemplate = normalizeNewlines(await readFile(contentPath, 'utf8'));

  // ── 6. Render body ────────────────────────────────────────────────────────
  let body = resolvePartials(bodyTemplate, partialsMap);
  body = resolveConditionals(body, context);
  body = resolveVariables(body, context, contentBasename);
  body = collapseBlankLines(body);
  body = ensureBlankLineBeforeHeadings(body);
  body = body.trimEnd();

  // ── 7. Assemble output ────────────────────────────────────────────────────
  let output = normalizeNewlines(`${frontmatter}\n\n${body}\n`);

  // ── 8. Plugin onPostRender ────────────────────────────────────────────────
  output = runPostRender(plugins, output, personaMetaTyped, target);

  // ── 9. Plugin onValidate ──────────────────────────────────────────────────
  const validationResults: ValidationResult[] = runValidate(plugins, personaMetaTyped, suiteConfig);

  // ── 10. Determine output file path ────────────────────────────────────────
  const outputDir = target === 'vscode' ? suiteConfig.outVscode : suiteConfig.outClaudeCode;
  // Use declared output filename fields when present (vs_file_name / cc_file_name),
  // falling back to the content basename.
  let outputBasename: string;
  if (target === 'vscode' && typeof context['vs_file_name'] === 'string') {
    outputBasename = context['vs_file_name'];
  } else if (target === 'claude-code' && typeof context['cc_file_name'] === 'string') {
    outputBasename = context['cc_file_name'];
  } else {
    outputBasename = contentBasename;
  }
  const outputPath = path.join(outputDir, outputBasename);

  // ── 11. Write (unless check mode) ─────────────────────────────────────────
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
 *   2. Load merged partials (shared → suite-local)
 *   3. Run `onSuiteInit` on all plugins
 *   4. Discover all persona YAML files
 *   5. Call `buildPersona()` for each
 *
 * @param suiteName    Identifier for this suite
 * @param suiteConfig  Suite configuration
 * @param config       Top-level BuildConfig
 * @param plugins      Registered plugins
 * @param target       Target output format
 * @returns            Array of BuildResult objects, one per persona
 */
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: 'vscode' | 'claude-code',
): Promise<BuildResult[]> {
  // ── 1. Load shared metadata ───────────────────────────────────────────────
  const metaSubdir = suiteConfig.metaSubdir ?? 'meta';
  const sharedYamlPath = path.join(suiteConfig.srcDir, metaSubdir, '_shared.yaml');
  const sharedMeta = await loadRawYaml(sharedYamlPath);

  // ── 2. Load partials (two-layer: shared base → suite-local override) ──────
  let partialsMap: Record<string, string> = {};

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

  // ── 4. Discover persona YAML files ────────────────────────────────────────
  const personaYamlPaths = await discoverSuitePersonaYamls(suiteConfig);

  // ── 5. Build each persona ─────────────────────────────────────────────────
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
  const targets = config.targets ?? ['vscode', 'claude-code'];
  const allResults: BuildResult[] = [];

  for (const [suiteName, suiteConfig] of Object.entries(config.suites)) {
    for (const target of targets) {
      const suiteResults = await buildSuite(suiteName, suiteConfig, config, plugins, target);
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
