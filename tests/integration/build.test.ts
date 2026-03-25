/**
 * tests/integration/build.test.ts
 *
 * End-to-end integration test for @smor/persona-build.
 *
 * Calls build(config) against the project-level fixtures/ directory and
 * asserts that:
 *   - build() returns a successful BuildSummary
 *   - At least one output file is written to disk
 *   - The written file content matches the rendered BuildResult content
 *   - The written file contains expected persona text (variable substitution
 *     and partial resolution both worked)
 *   - check mode (config.check = true) skips file writes but still renders
 *   - The public API surface (src/index.ts) exports all required symbols
 *
 * This test is a WP-007 acceptance criterion test.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import through the public API barrel (src/index.ts) to exercise all required exports
import {
  build,
  type BuildConfig,
  type BuildSummary,
  type PersonaBuildPlugin,
  type TargetType,
  type ValidationResult,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_SUITE_DIR = path.join(FIXTURES_ROOT, 'sample-suite');
const SHARED_PARTIALS_DIR = path.join(FIXTURES_ROOT, 'shared', 'partials');
const OUT_ROOT = path.join(FIXTURES_ROOT, 'integration-out');

// ---------------------------------------------------------------------------
// Cleanup after each test (remove any written output files)
// ---------------------------------------------------------------------------

afterEach(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Public API surface check
// ---------------------------------------------------------------------------

describe('public API exports (WP-007 AC-3)', () => {
  it('exports build as a function', () => {
    expect(typeof build).toBe('function');
  });

  it('type exports compile without error (BuildConfig, BuildSummary, PersonaBuildPlugin, TargetType, ValidationResult)', () => {
    // These are compile-time checks — the fact that this file imports and uses
    // the types without error validates the export surface.
    const _configShape: Partial<BuildConfig> = { suites: {} };
    const _summaryShape: Partial<BuildSummary> = { success: true, results: [], strictFailures: [], totalBuilt: 0, totalWritten: 0 };
    const _pluginShape: Partial<PersonaBuildPlugin> = { name: 'test' };
    const _targetType: TargetType = 'vscode';
    const _validationResult: ValidationResult = { severity: 'info', message: 'ok' };

    expect(_configShape.suites).toBeDefined();
    expect(_summaryShape.success).toBe(true);
    expect(_pluginShape.name).toBe('test');
    expect(_targetType).toBe('vscode');
    expect(_validationResult.severity).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Integration test: build() against fixtures/ (VS Code target)
// ---------------------------------------------------------------------------

describe('build() integration — VS Code target (WP-007 AC-4)', () => {
  it('writes at least one output file with correct content', async () => {
    const outVscode = path.join(OUT_ROOT, 'vscode');
    const outClaudeCode = path.join(OUT_ROOT, 'claude-code');

    const config: BuildConfig = {
      suites: {
        sample: {
          srcDir: SAMPLE_SUITE_DIR,
          outVscode,
          outClaudeCode,
        },
      },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
    };

    const summary: BuildSummary = await build(config);

    // Build must succeed
    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBeGreaterThanOrEqual(1);
    expect(summary.totalWritten).toBeGreaterThanOrEqual(1);

    // At least one result must have written=true
    const written = summary.results.filter((r) => r.written);
    expect(written.length).toBeGreaterThanOrEqual(1);

    // The VS Code output for example-persona uses vs_file_name = 'example-persona.agent.md'
    const vsResult = summary.results.find(
      (r) => r.target === 'vscode' && path.basename(r.outputPath) === 'example-persona.agent.md',
    );
    expect(vsResult).toBeDefined();
    expect(vsResult!.written).toBe(true);

    // File must exist on disk
    expect(existsSync(vsResult!.outputPath)).toBe(true);

    // Disk content must match rendered content
    const diskContent = await readFile(vsResult!.outputPath, 'utf8');
    expect(diskContent).toBe(vsResult!.content);

    // Content correctness: variable substitution
    expect(diskContent).toContain('Example Persona');
    expect(diskContent).toContain('1.0.0'); // default_version from _shared.yaml
    expect(diskContent).toContain('A minimal example persona for integration testing.');

    // Content correctness: partial resolution ({{> greeting}} → greeting.md)
    expect(diskContent).toContain('Hello, I am Example Persona.');

    // Frontmatter should be present
    expect(diskContent).toMatch(/^---\n/);
    expect(diskContent).toContain("name: 'Example Persona v1.0.0'");
  });

  it('result.content matches the file written to disk', async () => {
    const outVscode = path.join(OUT_ROOT, 'vscode-content-check');
    const outClaudeCode = path.join(OUT_ROOT, 'cc-content-check');

    const config: BuildConfig = {
      suites: {
        sample: {
          srcDir: SAMPLE_SUITE_DIR,
          outVscode,
          outClaudeCode,
        },
      },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
    };

    const summary = await build(config);

    for (const result of summary.results.filter((r) => r.written)) {
      const onDisk = await readFile(result.outputPath, 'utf8');
      expect(onDisk).toBe(result.content);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration test: both targets
// ---------------------------------------------------------------------------

describe('build() integration — both targets', () => {
  it('produces both vscode and claude-code output files', async () => {
    const outVscode = path.join(OUT_ROOT, 'both', 'vscode');
    const outClaudeCode = path.join(OUT_ROOT, 'both', 'claude-code');

    const config: BuildConfig = {
      suites: {
        sample: {
          srcDir: SAMPLE_SUITE_DIR,
          outVscode,
          outClaudeCode,
        },
      },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      // targets defaults to ['vscode', 'claude-code']
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    // Two targets × one persona = 2 results
    expect(summary.totalBuilt).toBe(2);
    expect(summary.totalWritten).toBe(2);

    const vsResult = summary.results.find((r) => r.target === 'vscode');
    const ccResult = summary.results.find((r) => r.target === 'claude-code');

    expect(vsResult).toBeDefined();
    expect(ccResult).toBeDefined();

    // Both files should exist
    expect(existsSync(vsResult!.outputPath)).toBe(true);
    expect(existsSync(ccResult!.outputPath)).toBe(true);

    // VS Code output filename
    expect(path.basename(vsResult!.outputPath)).toBe('example-persona.agent.md');
    // Claude Code output filename
    expect(path.basename(ccResult!.outputPath)).toBe('example-persona.md');
  });
});

// ---------------------------------------------------------------------------
// Integration test: check mode (no writes)
// ---------------------------------------------------------------------------

describe('build() integration — check mode', () => {
  it('does not write any files to disk when check=true', async () => {
    const outVscode = path.join(OUT_ROOT, 'check', 'vscode');
    const outClaudeCode = path.join(OUT_ROOT, 'check', 'claude-code');

    const config: BuildConfig = {
      suites: {
        sample: {
          srcDir: SAMPLE_SUITE_DIR,
          outVscode,
          outClaudeCode,
        },
      },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
      check: true,
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(summary.totalBuilt).toBeGreaterThanOrEqual(1);
    // No files should be written
    expect(summary.totalWritten).toBe(0);
    expect(summary.results.every((r) => !r.written)).toBe(true);

    // Output directory must NOT have been created
    expect(existsSync(outVscode)).toBe(false);

    // Content is still rendered even in check mode
    expect(summary.results[0]?.content).toBeTruthy();
    expect(summary.results[0]?.content).toContain('Example Persona');
  });
});

// ---------------------------------------------------------------------------
// Integration test: plugin hooks are invoked
// ---------------------------------------------------------------------------

describe('build() integration — plugin hooks', () => {
  it('invokes onBuildContext and onPostRender hooks for each persona', async () => {
    const outVscode = path.join(OUT_ROOT, 'plugins', 'vscode');
    const outClaudeCode = path.join(OUT_ROOT, 'plugins', 'claude-code');

    const contextCallLog: string[] = [];
    const postRenderCallLog: string[] = [];

    const testPlugin: PersonaBuildPlugin = {
      name: 'integration-test-plugin',
      onBuildContext(context) {
        contextCallLog.push(String(context['name'] ?? 'unknown'));
        return context;
      },
      onPostRender(output, persona, target) {
        postRenderCallLog.push(`${persona.name}:${target}`);
        return output;
      },
    };

    const config: BuildConfig = {
      suites: {
        sample: {
          srcDir: SAMPLE_SUITE_DIR,
          outVscode,
          outClaudeCode,
        },
      },
      sharedPartialsDir: SHARED_PARTIALS_DIR,
      targets: ['vscode'],
      plugins: [testPlugin],
      check: true,
    };

    const summary = await build(config);

    expect(summary.success).toBe(true);
    expect(contextCallLog.length).toBeGreaterThanOrEqual(1);
    expect(postRenderCallLog.length).toBeGreaterThanOrEqual(1);

    // Plugin should have seen the example-persona name
    expect(contextCallLog).toContain('Example Persona');
    expect(postRenderCallLog).toContain('Example Persona:vscode');
  });
});
