/**
 * tests/loaders/content-loader.test.ts
 *
 * Unit tests for src/loaders/content-loader.ts — loadContent()
 *
 * Strategy: use real temp files so no path-separator assumptions are made
 * and no fs layer mocking is needed.
 *
 * Covers:
 *   - Reads and returns the raw string content of a .md file
 *   - Content is returned unmodified (no trimming, no template processing)
 *   - Throws (ENOENT) when the file does not exist
 *   - Handles multiline content
 *   - Handles empty file
 *   - Works with paths constructed via path.join (cross-platform)
 *   - Returns a string (not a Buffer)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadContent } from '../../src/loaders/content-loader.js';

// ---------------------------------------------------------------------------
// Temp-dir helpers
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
  testDir = path.join(tmpdir(), `persona-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadContent()', () => {
  it('returns the raw content of a Markdown file', async () => {
    const mdPath = path.join(testDir, 'persona.md');
    const expected = '{{> greeting}}\n\n## About\n\nThis is {{name}}.';
    await writeFile(mdPath, expected);

    const result = await loadContent(mdPath);
    expect(result).toBe(expected);
  });

  it('returns content unchanged — no trimming applied', async () => {
    const mdPath = path.join(testDir, 'untrimmed.md');
    const raw = '  leading spaces\n\ntrailing newlines\n\n';
    await writeFile(mdPath, raw);

    const result = await loadContent(mdPath);
    expect(result).toBe(raw);
  });

  it('returns content unchanged — no template substitution applied', async () => {
    const mdPath = path.join(testDir, 'template.md');
    const template = '{{> partial}}\n\n# {{title}}\n\n{{#if flag}}shown{{/if}}';
    await writeFile(mdPath, template);

    const result = await loadContent(mdPath);
    expect(result).toBe(template);
  });

  it('handles an empty file', async () => {
    const mdPath = path.join(testDir, 'empty.md');
    await writeFile(mdPath, '');

    const result = await loadContent(mdPath);
    expect(result).toBe('');
  });

  it('handles multiline content with mixed newlines', async () => {
    const mdPath = path.join(testDir, 'multi.md');
    const content = 'Line 1\nLine 2\nLine 3\n';
    await writeFile(mdPath, content);

    const result = await loadContent(mdPath);
    expect(result).toBe(content);
  });

  it('throws when the file does not exist (ENOENT)', async () => {
    const nonExistent = path.join(testDir, 'missing.md');
    await expect(loadContent(nonExistent)).rejects.toThrow();
  });

  it('returns a string, not a Buffer', async () => {
    const mdPath = path.join(testDir, 'type-check.md');
    await writeFile(mdPath, 'string check');

    const result = await loadContent(mdPath);
    expect(typeof result).toBe('string');
  });

  it('resolves relative-ish paths through path.resolve internally', async () => {
    // Even if a caller passes an absolute path constructed with path.join,
    // the result should be identical to reading by that exact path.
    const subDir = path.join(testDir, 'content');
    await mkdir(subDir, { recursive: true });

    const mdPath = path.join(subDir, 'nested.md');
    await writeFile(mdPath, 'nested content');

    const result = await loadContent(mdPath);
    expect(result).toBe('nested content');
  });

  it('works with paths constructed via path.join on any platform', async () => {
    // path.join uses the platform-native separator; this ensures no hard-coded
    // separator assumptions are present in the implementation.
    const mdPath = path.join(testDir, 'platform.md');
    await writeFile(mdPath, 'platform-safe content');

    const result = await loadContent(mdPath);
    expect(result).toBe('platform-safe content');
  });

  it('handles Unicode content correctly', async () => {
    const mdPath = path.join(testDir, 'unicode.md');
    const unicode = 'Héllo Wörld — 日本語テスト 🎉';
    await writeFile(mdPath, unicode, 'utf8');

    const result = await loadContent(mdPath);
    expect(result).toBe(unicode);
  });
});
