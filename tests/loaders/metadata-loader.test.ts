/**
 * tests/loaders/metadata-loader.test.ts
 *
 * Unit tests for src/loaders/metadata-loader.ts
 *   — discoverPersonaYamls()
 *   — loadMetadata()
 *
 * Strategy: create real temp directories and YAML files for each test to
 * exercise actual file I/O without any path-separator assumptions.
 *
 * Covers:
 *   discoverPersonaYamls:
 *     - Returns [] for an empty directory
 *     - Finds top-level YAML files
 *     - Finds YAML files recursively in nested subdirectories
 *     - Returns absolute paths
 *     - Sorts results lexicographically
 *     - Ignores non-.yaml files
 *     - Throws when root directory does not exist
 *
 *   loadMetadata:
 *     - Returns a PersonaMetadata object with all YAML fields
 *     - Required "name" field is correctly typed as string
 *     - Throws when file does not exist (ENOENT)
 *     - Throws when YAML is empty (null parse result)
 *     - Throws when YAML parses to a non-object (e.g., array, scalar)
 *     - Throws when "name" field is missing
 *     - Handles optional fields gracefully
 *     - Path-separator independence: works with path.join-constructed paths
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPersonaYamls, loadMetadata } from '../../src/loaders/metadata-loader.js';

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
// discoverPersonaYamls
// ---------------------------------------------------------------------------

describe('discoverPersonaYamls()', () => {
  it('returns an empty array when the directory has no .yaml files', async () => {
    const result = await discoverPersonaYamls(testDir);
    expect(result).toEqual([]);
  });

  it('finds a single top-level .yaml file', async () => {
    const yamlPath = path.join(testDir, 'persona.yaml');
    await writeFile(yamlPath, 'name: test');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(path.resolve(yamlPath));
  });

  it('finds multiple top-level .yaml files', async () => {
    await writeFile(path.join(testDir, 'alpha.yaml'), 'name: alpha');
    await writeFile(path.join(testDir, 'beta.yaml'), 'name: beta');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(2);
  });

  it('finds .yaml files recursively in nested subdirectories', async () => {
    const sub1 = path.join(testDir, 'suite-a', 'meta');
    const sub2 = path.join(testDir, 'suite-b', 'meta');
    await mkdir(sub1, { recursive: true });
    await mkdir(sub2, { recursive: true });

    await writeFile(path.join(sub1, 'persona-a.yaml'), 'name: persona-a');
    await writeFile(path.join(sub2, 'persona-b.yaml'), 'name: persona-b');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(2);
    // All paths must be absolute
    for (const p of result) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });

  it('returns absolute paths', async () => {
    await writeFile(path.join(testDir, 'abs-check.yaml'), 'name: abs');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(1);
    expect(path.isAbsolute(result[0]!)).toBe(true);
  });

  it('sorts results lexicographically', async () => {
    await writeFile(path.join(testDir, 'charlie.yaml'), 'name: charlie');
    await writeFile(path.join(testDir, 'alpha.yaml'), 'name: alpha');
    await writeFile(path.join(testDir, 'bravo.yaml'), 'name: bravo');

    const result = await discoverPersonaYamls(testDir);
    const names = result.map((p) => path.basename(p));
    expect(names).toEqual(['alpha.yaml', 'bravo.yaml', 'charlie.yaml']);
  });

  it('ignores non-.yaml files', async () => {
    await writeFile(path.join(testDir, 'persona.yaml'), 'name: keep');
    await writeFile(path.join(testDir, 'readme.md'), '# Ignore me');
    await writeFile(path.join(testDir, 'config.json'), '{}');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(1);
    expect(path.basename(result[0]!)).toBe('persona.yaml');
  });

  it('throws when the root directory does not exist', async () => {
    const nonExistent = path.join(testDir, 'does-not-exist');
    await expect(discoverPersonaYamls(nonExistent)).rejects.toThrow();
  });

  it('handles deeply nested paths without path-separator assumptions', async () => {
    const deep = path.join(testDir, 'a', 'b', 'c', 'd');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(deep, 'deep.yaml'), 'name: deep');

    const result = await discoverPersonaYamls(testDir);
    expect(result).toHaveLength(1);
    expect(path.isAbsolute(result[0]!)).toBe(true);
    expect(result[0]!.endsWith('deep.yaml')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadMetadata
// ---------------------------------------------------------------------------

describe('loadMetadata()', () => {
  it('parses a minimal YAML file with only the required "name" field', async () => {
    const yamlPath = path.join(testDir, 'minimal.yaml');
    await writeFile(yamlPath, 'name: my-persona');

    const result = await loadMetadata(yamlPath);
    expect(result.name).toBe('my-persona');
  });

  it('parses a full persona YAML into a PersonaMetadata object', async () => {
    const yamlPath = path.join(testDir, 'full.yaml');
    await writeFile(yamlPath, [
      'name: example-persona',
      'displayName: Example Persona',
      'description: A test persona',
      'version: 1.2.3',
      'tools:',
      '  - read',
      '  - write',
    ].join('\n'));

    const result = await loadMetadata(yamlPath);
    expect(result.name).toBe('example-persona');
    expect(result.displayName).toBe('Example Persona');
    expect(result.description).toBe('A test persona');
    expect(result.version).toBe('1.2.3');
    expect(result.tools).toEqual(['read', 'write']);
  });

  it('preserves extra (unknown) fields via the index signature', async () => {
    const yamlPath = path.join(testDir, 'extra.yaml');
    await writeFile(yamlPath, [
      'name: extra-fields',
      'custom_key: custom_value',
      'nested:',
      '  foo: bar',
    ].join('\n'));

    const result = await loadMetadata(yamlPath);
    expect(result['custom_key']).toBe('custom_value');
    expect(result['nested']).toEqual({ foo: 'bar' });
  });

  it('throws when the file does not exist (ENOENT)', async () => {
    const nonExistent = path.join(testDir, 'missing.yaml');
    await expect(loadMetadata(nonExistent)).rejects.toThrow();
  });

  it('throws a descriptive error when the YAML is empty', async () => {
    const yamlPath = path.join(testDir, 'empty.yaml');
    await writeFile(yamlPath, '');

    await expect(loadMetadata(yamlPath)).rejects.toThrow(/loadMetadata/);
  });

  it('throws a descriptive error when the YAML parses to an array', async () => {
    const yamlPath = path.join(testDir, 'array.yaml');
    await writeFile(yamlPath, '- item1\n- item2\n');

    await expect(loadMetadata(yamlPath)).rejects.toThrow(/loadMetadata/);
  });

  it('throws a descriptive error when the YAML parses to a scalar', async () => {
    const yamlPath = path.join(testDir, 'scalar.yaml');
    await writeFile(yamlPath, 'just a plain string\n');

    await expect(loadMetadata(yamlPath)).rejects.toThrow(/loadMetadata/);
  });

  it('throws a descriptive error when the "name" field is missing', async () => {
    const yamlPath = path.join(testDir, 'no-name.yaml');
    await writeFile(yamlPath, 'description: no name here');

    await expect(loadMetadata(yamlPath)).rejects.toThrow(/name/);
  });

  it('throws when "name" is an empty string', async () => {
    const yamlPath = path.join(testDir, 'empty-name.yaml');
    await writeFile(yamlPath, "name: ''");

    await expect(loadMetadata(yamlPath)).rejects.toThrow(/name/);
  });

  it('works with a path constructed via path.join (cross-platform)', async () => {
    // Simulate the kind of path that a caller would construct on any OS
    const subDir = path.join(testDir, 'meta');
    await mkdir(subDir, { recursive: true });

    const yamlPath = path.join(subDir, 'cross-platform.yaml');
    await writeFile(yamlPath, 'name: cross-platform-persona');

    const result = await loadMetadata(yamlPath);
    expect(result.name).toBe('cross-platform-persona');
  });

  it('returns a typed PersonaMetadata — name is always a string', async () => {
    const yamlPath = path.join(testDir, 'typed.yaml');
    await writeFile(yamlPath, 'name: typed-check');

    const result = await loadMetadata(yamlPath);
    // TypeScript type check (compile-time) is validated by tsc --noEmit;
    // this is a runtime sanity check.
    expect(typeof result.name).toBe('string');
  });
});
