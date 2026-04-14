/**
 * tests/helpers/suite-fixture.ts
 *
 * Shared fixture helper for builder tests.
 *
 * Provides `createMinimalSuite()` — an async factory that builds a minimal
 * persona suite directory tree inside a caller-supplied temporary directory.
 * All six builder test files import this helper to eliminate the near-identical
 * local `createMinimalSuite` / `createSuite` helpers that previously lived in
 * each file.
 *
 * Usage:
 *
 * ```ts
 * import { createMinimalSuite } from '../helpers/suite-fixture.js';
 *
 * let testTmpDir: string;
 * beforeEach(async () => { testTmpDir = ... });
 * afterEach(async () => { await rm(testTmpDir, { recursive: true, force: true }); });
 *
 * it('...', async () => {
 *   const { suiteDir, outDir, yamlPath, suiteConfig, sharedPartialsDir } =
 *     await createMinimalSuite(testTmpDir, { contentMd: '# {{name}}\n' });
 *   ...
 * });
 * ```
 *
 * For two-persona suites, call the helper once (for persona A) and then write
 * the second persona's YAML and content files manually using `fixture.suiteDir`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SuiteConfig } from '../../src/plugins/types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SuiteFixtureOptions {
  /** Sub-directory name for the suite inside `baseDir` (default: `'suite'`). */
  suiteDirName?: string;
  /** Sub-directory name for the output directory inside `baseDir` (default: `'out'`). */
  outputDirName?: string;
  /** Persona file stem without extension (default: `'agent'`). */
  personaName?: string;
  /**
   * Content for `meta/_shared.yaml`.
   * Default: `default_version: "1.0.0"\n`
   */
  sharedYaml?: string;
  /**
   * Content for `meta/<personaName>.yaml`.
   * Default: minimal YAML with `name`, `vs_file_name`, `cc_file_name`, `description`.
   */
  personaYaml?: string;
  /**
   * Content for `content/<personaName>.md`.
   * Default: `# {{name}}\n`
   */
  contentMd?: string;
  /** Partial files to create in the suite's `partials/` sub-directory. */
  suitePartials?: Record<string, string>;
  /**
   * Partial files to create in a `shared-partials/` sibling directory.
   * The returned `sharedPartialsDir` path points to this directory.
   */
  sharedPartials?: Record<string, string>;
}

export interface SuiteFixture {
  /** Absolute path to the suite source directory (`<baseDir>/<suiteDirName>`). */
  suiteDir: string;
  /** Absolute path to the output directory (`<baseDir>/<outputDirName>`). */
  outDir: string;
  /** Absolute path to the persona YAML file (`<suiteDir>/meta/<personaName>.yaml`). */
  yamlPath: string;
  /**
   * Pre-configured `SuiteConfig` with `srcDir: suiteDir`,
   * `outVscode: outDir`, and `outClaudeCode: outDir`.
   */
  suiteConfig: SuiteConfig;
  /**
   * Absolute path to the shared partials directory (`<baseDir>/shared-partials`).
   * This directory is always created by the helper; it may be empty when
   * `opts.sharedPartials` is not provided.
   */
  sharedPartialsDir: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a minimal persona suite directory tree inside `baseDir` and return
 * the paths and `SuiteConfig` needed to drive `buildPersona()`, `buildSuite()`,
 * or `build()` in tests.
 *
 * The helper always creates the following structure:
 *
 * ```
 * <baseDir>/
 *   <suiteDirName>/          (default: suite/)
 *     meta/
 *       _shared.yaml
 *       <personaName>.yaml
 *     content/
 *       <personaName>.md
 *     partials/              (empty unless suitePartials provided)
 *   <outputDirName>/         (default: out/)
 *   shared-partials/         (empty unless sharedPartials provided)
 * ```
 *
 * @param baseDir  Absolute path to the temporary root directory managed by the
 *                 calling test's `beforeEach` / `afterEach` lifecycle.
 * @param opts     Optional overrides — all fields have sensible defaults.
 * @returns        Paths and `SuiteConfig` for use in builder function calls.
 */
export async function createMinimalSuite(
  baseDir: string,
  opts: SuiteFixtureOptions = {},
): Promise<SuiteFixture> {
  const suiteDirName = opts.suiteDirName ?? 'suite';
  const outputDirName = opts.outputDirName ?? 'out';
  const pName = opts.personaName ?? 'agent';

  const suiteDir = path.join(baseDir, suiteDirName);
  const outDir = path.join(baseDir, outputDirName);
  const sharedPartialsDir = path.join(baseDir, 'shared-partials');

  // Create directory structure
  await mkdir(path.join(suiteDir, 'meta'), { recursive: true });
  await mkdir(path.join(suiteDir, 'content'), { recursive: true });
  await mkdir(path.join(suiteDir, 'partials'), { recursive: true });
  await mkdir(sharedPartialsDir, { recursive: true });

  // Write _shared.yaml
  await writeFile(
    path.join(suiteDir, 'meta', '_shared.yaml'),
    opts.sharedYaml ?? 'default_version: "1.0.0"\n',
  );

  // Write persona YAML
  await writeFile(
    path.join(suiteDir, 'meta', `${pName}.yaml`),
    opts.personaYaml ??
      `name: Test Agent\nvs_file_name: ${pName}.agent.md\ncc_file_name: ${pName}.md\ndescription: ""\ntools:\n  - read\n`,
  );

  // Write content template
  await writeFile(
    path.join(suiteDir, 'content', `${pName}.md`),
    opts.contentMd ?? '# {{name}}\n',
  );

  // Write suite-local partials (if any)
  if (opts.suitePartials) {
    for (const [stem, content] of Object.entries(opts.suitePartials)) {
      await writeFile(path.join(suiteDir, 'partials', `${stem}.md`), content);
    }
  }

  // Write shared partials (if any)
  if (opts.sharedPartials) {
    for (const [stem, content] of Object.entries(opts.sharedPartials)) {
      await writeFile(path.join(sharedPartialsDir, `${stem}.md`), content);
    }
  }

  const suiteConfig: SuiteConfig = {
    srcDir: suiteDir,
    outVscode: outDir,
    outClaudeCode: outDir,
  };

  return {
    suiteDir,
    outDir,
    yamlPath: path.join(suiteDir, 'meta', `${pName}.yaml`),
    suiteConfig,
    sharedPartialsDir,
  };
}
