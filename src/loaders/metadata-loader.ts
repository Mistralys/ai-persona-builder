/**
 * src/loaders/metadata-loader.ts
 *
 * File-system loader for persona YAML metadata files.
 *
 * Provides two exports:
 *
 *  1. `discoverPersonaYamls(root)` — recursively walks `root` and returns
 *     absolute paths for every `*.yaml` file found, regardless of nesting
 *     depth.  Uses Node's built-in `fs.readdir` with `recursive: true`
 *     (available since Node 18.17).  No glob library is required.
 *
 *  2. `loadMetadata(yamlPath)` — reads a single YAML file and parses it
 *     with `js-yaml` into a fully typed `PersonaMetadata` object.
 *
 * Path construction relies exclusively on `node:path` so the output is
 * correct on both POSIX and Windows.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { PersonaMetadata } from '../plugins/types.js';

// Re-export the type so consumers can import it directly from this module
export type { PersonaMetadata };

// ---------------------------------------------------------------------------
// YAML discovery
// ---------------------------------------------------------------------------

/**
 * Recursively discover all `*.yaml` files under `root` and return their
 * absolute paths sorted lexicographically.
 *
 * Uses `readdir` with `{ recursive: true }` (Node ≥ 18.17).  Each returned
 * path is normalised through `path.resolve` so callers always receive
 * absolute, platform-consistent paths.
 *
 * @param root  The directory to search (absolute or resolvable relative path).
 * @returns     Sorted array of absolute paths to every `*.yaml` file found.
 *
 * @example
 * const yamls = await discoverPersonaYamls('/project/personas/ledger/src/meta');
 * // ['/project/personas/ledger/src/meta/alpha.yaml', ...]
 */
export async function discoverPersonaYamls(root: string): Promise<string[]> {
  const absRoot = path.resolve(root);

  // Node ≥ 18.17: readdir with recursive returns relative paths from root
  const allEntries = await readdir(absRoot, { recursive: true, withFileTypes: false });

  const yamlPaths = (allEntries as string[])
    .filter((entry) => entry.endsWith('.yaml'))
    .map((entry) => path.join(absRoot, entry))
    .sort();

  return yamlPaths;
}

// ---------------------------------------------------------------------------
// YAML parsing
// ---------------------------------------------------------------------------

/**
 * Load and parse a single persona YAML file into a typed `PersonaMetadata`
 * object.
 *
 * The YAML is parsed using `js-yaml`'s safe `load` function.  The result
 * is validated to be a non-null object; if the YAML is empty or does not
 * parse to an object, an `Error` is thrown.
 *
 * `PersonaMetadata` requires a `name` field.  If the YAML does not contain
 * a `name` key the function throws an `Error` with a descriptive message.
 *
 * @param yamlPath  Absolute path to the YAML file.
 * @returns         Parsed and validated `PersonaMetadata` object.
 * @throws          `Error` when the file is unparseable, not an object, or
 *                  is missing the required `name` field.
 *
 * @example
 * const meta = await loadMetadata('/project/meta/my-persona.yaml');
 * // { name: 'my-persona', description: '...', tools: [...] }
 */
export async function loadMetadata(yamlPath: string): Promise<PersonaMetadata> {
  const raw = await readFile(yamlPath, 'utf8');

  const parsed: unknown = yaml.load(raw);

  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `loadMetadata: expected a YAML object in "${yamlPath}", got ${
        Array.isArray(parsed) ? 'array' : String(parsed)
      }`,
    );
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record['name'] !== 'string' || record['name'].trim() === '') {
    throw new Error(
      `loadMetadata: YAML file "${yamlPath}" is missing a required string field "name"`,
    );
  }

  return record as PersonaMetadata;
}
