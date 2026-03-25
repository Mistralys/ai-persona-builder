/**
 * src/loaders/content-loader.ts
 *
 * File-system loader for persona Markdown content templates.
 *
 * Provides a single `loadContent` function that reads the raw string content
 * of a persona Markdown file from disk.  The content is returned exactly as
 * stored — no template substitution, no post-processing.  Those concerns
 * belong to the engine layer.
 *
 * All I/O is asynchronous.  Path construction uses `node:path` so the
 * implementation is path-separator–agnostic.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Read a persona Markdown content file and return its raw string content.
 *
 * The file is read with UTF-8 encoding.  No parsing, template resolution,
 * or post-processing is applied — that is the engine layer's responsibility.
 *
 * @param mdPath  Absolute (or resolvable relative) path to the `.md` file.
 * @returns       Raw UTF-8 string content of the file.
 * @throws        An `ENOENT` error (from `fs/promises`) if the file does not
 *                exist, or any other I/O error the OS reports.
 *
 * @example
 * const body = await loadContent('/project/content/my-persona.md');
 * // '{{> greeting}}\n\n## About\n\nThis is {{name}}...'
 */
export async function loadContent(mdPath: string): Promise<string> {
  const absPath = path.resolve(mdPath);
  return readFile(absPath, 'utf8');
}
