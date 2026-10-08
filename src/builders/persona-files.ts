/**
 * src/builders/persona-files.ts
 *
 * Low-level persona file discovery and loading helpers.
 *
 * Relocated out of `persona-builder.ts` (previously private, unexported
 * functions) so that `persona-index.ts` can reuse them without introducing a
 * second, independently-drifting file-discovery implementation.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import type { SuiteConfig } from '../plugins/types.js';

/**
 * Discover all persona YAML files in the `meta/` subdirectory of a suite.
 *
 * Excludes files whose names start with `_` (shared metadata files such as
 * `_shared.yaml`).  Results are sorted lexicographically.
 *
 * @param suiteConfig  Suite configuration (used to locate `metaSubdir`)
 * @returns            Absolute paths to each persona YAML file, sorted.
 */
export async function discoverSuitePersonaYamls(suiteConfig: SuiteConfig): Promise<string[]> {
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
export async function loadRawYaml(filePath: string): Promise<Record<string, unknown>> {
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
export async function loadPersonaYaml(yamlPath: string): Promise<Record<string, unknown>> {
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
