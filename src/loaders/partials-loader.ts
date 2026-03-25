/**
 * src/loaders/partials-loader.ts
 *
 * File-system loader for Handlebars-style partial snippets.
 *
 * Reads every `.md` file in `dir`, keys each entry by the filename stem
 * (i.e. the portion before the final `.md` extension), and returns the
 * map.  Callers that need a two-layer (shared → suite-local override)
 * setup should call `loadPartials` twice and merge the results themselves,
 * with the suite-local result spreading last.
 *
 * All file reads are performed asynchronously.  Path construction uses
 * `path.join` and `path.posix`-compatible operations so no path-separator
 * assumptions are baked in.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Load all `.md` files in `dir` and return them as a `Record<string, string>`
 * keyed by filename stem.
 *
 * Files whose names do not end in `.md` are silently ignored.
 * The directory must exist; a missing directory throws an `ENOENT` error from
 * the underlying `readdir` call (let callers decide how to handle absence).
 *
 * @param dir  Absolute (or relative) path to the directory to scan.
 * @returns    A map from filename stem → file content string.
 *
 * @example
 * const partials = await loadPartials('/project/partials');
 * // { greeting: 'Hello, {{name}}!', footer: '---\nEnd of file' }
 */
export async function loadPartials(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true });

  const mdFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith('.md'),
  );

  const pairs = await Promise.all(
    mdFiles.map(async (entry) => {
      const stem = entry.name.slice(0, -'.md'.length); // strip trailing ".md"
      const filePath = path.join(dir, entry.name);
      const content = await readFile(filePath, 'utf8');
      return [stem, content] as [string, string];
    }),
  );

  return Object.fromEntries(pairs);
}
