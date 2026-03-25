/**
 * tests/loaders/partials-loader.test.ts
 *
 * Unit tests for src/loaders/partials-loader.ts — loadPartials()
 *
 * Strategy: create real temp directories for each test so there are
 * no path-separator assumptions and no mocking of the fs layer.
 *
 * Covers:
 *   - Returns empty object for empty directory
 *   - Keys are filename stems (no ".md" suffix)
 *   - Content is read correctly
 *   - Non-.md files are ignored
 *   - Multiple files returned as a single map
 *   - Directory does not exist → throws (ENOENT)
 *   - Paths constructed with path.join are handled correctly (cross-platform)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPartials } from '../../src/loaders/partials-loader.js';

// ---------------------------------------------------------------------------
// Temp-dir helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  // Create a unique temp directory for each test
  testDir = path.join(tmpdir(), `persona-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadPartials()', () => {
  it('returns an empty object when the directory contains no .md files', async () => {
    const result = await loadPartials(testDir);
    expect(result).toEqual({});
  });

  it('returns a single entry keyed by filename stem', async () => {
    await writeFile(path.join(testDir, 'greeting.md'), 'Hello, {{name}}!');

    const result = await loadPartials(testDir);
    expect(result).toEqual({ greeting: 'Hello, {{name}}!' });
  });

  it('strips the .md extension for the key', async () => {
    await writeFile(path.join(testDir, 'my-partial.md'), 'content');

    const result = await loadPartials(testDir);
    expect(Object.keys(result)).toContain('my-partial');
    expect(Object.keys(result)).not.toContain('my-partial.md');
  });

  it('returns multiple entries for multiple .md files', async () => {
    await writeFile(path.join(testDir, 'alpha.md'), 'Alpha content');
    await writeFile(path.join(testDir, 'beta.md'), 'Beta content');
    await writeFile(path.join(testDir, 'gamma.md'), 'Gamma content');

    const result = await loadPartials(testDir);
    expect(Object.keys(result).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(result['alpha']).toBe('Alpha content');
    expect(result['beta']).toBe('Beta content');
    expect(result['gamma']).toBe('Gamma content');
  });

  it('ignores non-.md files', async () => {
    await writeFile(path.join(testDir, 'keep.md'), 'kept');
    await writeFile(path.join(testDir, 'ignore.yaml'), 'ignored');
    await writeFile(path.join(testDir, 'ignore.txt'), 'ignored');
    await writeFile(path.join(testDir, '.hidden'), 'ignored');

    const result = await loadPartials(testDir);
    expect(Object.keys(result)).toEqual(['keep']);
  });

  it('preserves full file content including newlines', async () => {
    const multiline = 'Line one\nLine two\n\nLine four';
    await writeFile(path.join(testDir, 'multi.md'), multiline);

    const result = await loadPartials(testDir);
    expect(result['multi']).toBe(multiline);
  });

  it('handles filenames with dots before .md correctly', async () => {
    // e.g. "my.partial.md" → key should be "my.partial"
    await writeFile(path.join(testDir, 'my.partial.md'), 'dotted');

    const result = await loadPartials(testDir);
    expect(result['my.partial']).toBe('dotted');
  });

  it('throws when the directory does not exist', async () => {
    const nonExistent = path.join(testDir, 'does-not-exist');
    await expect(loadPartials(nonExistent)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Path-separator independence
  // -------------------------------------------------------------------------

  it('resolves paths correctly regardless of separator style (uses path.join internally)', async () => {
    // Verify the function works when the input path is constructed with
    // platform-native separators (path.join handles this).
    const subDir = path.join(testDir, 'sub', 'partials');
    await mkdir(subDir, { recursive: true });
    await writeFile(path.join(subDir, 'footer.md'), 'Footer text');

    const result = await loadPartials(subDir);
    expect(result).toEqual({ footer: 'Footer text' });
  });

  it('returns a Record<string, string> (values are strings, not Buffers)', async () => {
    await writeFile(path.join(testDir, 'check.md'), 'string value');

    const result = await loadPartials(testDir);
    expect(typeof result['check']).toBe('string');
  });
});
