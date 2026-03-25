#!/usr/bin/env node
/**
 * src/cli.ts — @smor/persona-build CLI entry point
 *
 * Flags:
 *   --config <path>  Path to config file (JS/CJS/JSON). Default: persona-build.config.js
 *   --check          Run the build pipeline but do not write output files.
 *                    Always exits 0 unless combined with --strict, which causes
 *                    exit 1 when any ValidationResult has severity 'error' or
 *                    'warning'.
 *   --strict         Fail (exit 1) if any ValidationResult has severity
 *                    'error' or 'warning'.
 *   --help           Print usage and exit 0.
 *   --version        Print package version and exit 0.
 *
 * No heavy CLI framework — args are parsed with a hand-rolled loop.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { build } from './builders/persona-builder.js';
import type { BuildConfig, BuildSummary } from './builders/types.js';

// ---------------------------------------------------------------------------
// Version — sourced from package.json (single source of truth).
// createRequire is already imported above for config loading; reuse it here.
// ---------------------------------------------------------------------------

const _pkgRequire = createRequire(import.meta.url);
const VERSION = (_pkgRequire('../package.json') as { version: string }).version;

// ---------------------------------------------------------------------------
// Usage / help text
// ---------------------------------------------------------------------------

const USAGE = `
@smor/persona-build v${VERSION}

Build AI persona documents from YAML metadata and Markdown content templates.

USAGE
  persona-build [options]

OPTIONS
  --config <path>   Path to the build config file.
                    Supports .js (ESM), .cjs, and .json formats.
                    Default: persona-build.config.js in the current directory.
  --check           Render personas but skip writing output files.
                    Always exits 0 on its own. Combine with --strict to
                    exit 1 when validators report errors or warnings.
  --strict          Exit 1 if any validation result has severity 'error'
                    or 'warning'.
  --help            Show this help message and exit.
  --version         Print the package version and exit.

EXAMPLES
  persona-build                            # Build with default config
  persona-build --config ./my-config.js   # Build with a custom config
  persona-build --check                   # CI staleness check (no file writes)
  persona-build --strict                  # Fail on warnings or errors
  persona-build --check --strict          # Safe CI check — no writes + strict
`.trim();

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  configPath?: string;
  check: boolean;
  strict: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // strip 'node' + script path

  const result: ParsedArgs = {
    configPath: undefined,
    check: false,
    strict: false,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--version':
      case '-v':
        result.version = true;
        break;
      case '--check':
        result.check = true;
        break;
      case '--strict':
        result.strict = true;
        break;
      case '--config': {
        const next = args[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('Error: --config requires a path argument.');
          process.exit(1);
        }
        result.configPath = next;
        i++; // consume the value
        break;
      }
      default:
        // Unknown flag — warn but do not exit so older configs stay forward-compatible
        if (arg.startsWith('--')) {
          console.warn(`Warning: Unknown flag "${arg}" — ignored.`);
        }
    }
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Resolve the config file path from the user-supplied value or the default
 * discovery chain.
 *
 * Discovery order (when --config is not supplied):
 *   1. persona-build.config.js   (ESM)
 *   2. persona-build.config.cjs  (CJS)
 *   3. persona-build.config.json (JSON)
 */
function resolveConfigPath(cliValue?: string): string {
  if (cliValue) {
    const resolved = path.resolve(cliValue);
    if (!existsSync(resolved)) {
      console.error(`Error: Config file not found: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }

  const candidates = [
    'persona-build.config.js',
    'persona-build.config.cjs',
    'persona-build.config.json',
  ];

  for (const name of candidates) {
    const candidate = path.resolve(name);
    if (existsSync(candidate)) return candidate;
  }

  console.error(
    'Error: No config file found. ' +
      'Create persona-build.config.js in the current directory or pass --config <path>.',
  );
  process.exit(1);
}

/**
 * Load and validate the config file.
 *
 * Supports:
 *   - ESM .js   → dynamic import()
 *   - CJS .cjs  → createRequire()
 *   - JSON .json → createRequire()
 *
 * The config module must export a default export (or be a plain JSON object)
 * that conforms to BuildConfig.
 */
async function loadConfig(configPath: string): Promise<BuildConfig> {
  const ext = path.extname(configPath).toLowerCase();

  let rawConfig: unknown;

  if (ext === '.cjs' || ext === '.json') {
    const require = createRequire(import.meta.url);
    rawConfig = require(configPath);
  } else {
    // ESM default — use dynamic import with a file URL
    const fileUrl = pathToFileURL(configPath).href;
    const mod = await import(fileUrl);
    rawConfig = mod.default ?? mod;
  }

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    console.error(
      `Error: Config file "${configPath}" must export a plain object (BuildConfig).`,
    );
    process.exit(1);
  }

  const config = rawConfig as BuildConfig;

  if (!config.suites || typeof config.suites !== 'object') {
    console.error(
      `Error: Config file "${configPath}" must have a "suites" property (record of suite configs).`,
    );
    process.exit(1);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function printSummary(summary: BuildSummary, check: boolean): void {
  const mode = check ? ' [check mode — no files written]' : '';
  const status = summary.success ? '✓ Build succeeded' : '✗ Build failed';
  console.log(`${status}${mode}`);
  console.log(`  Personas processed : ${summary.totalBuilt}`);
  if (!check) {
    console.log(`  Files written      : ${summary.totalWritten}`);
  }
  if (summary.strictFailures.length > 0) {
    console.log(`\n  Validation failures (${summary.strictFailures.length}):`);
    for (const f of summary.strictFailures) {
      console.log(`    [${f.severity}] ${f.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Short-circuit flags
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
  }

  // Resolve and load config
  const configPath = resolveConfigPath(args.configPath);
  let config: BuildConfig;

  try {
    config = await loadConfig(configPath);
  } catch (err) {
    console.error(`Error loading config: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Apply CLI flag overrides (CLI flags take precedence over config-file values)
  if (args.check) config.check = true;
  if (args.strict) config.strict = true;

  // Run the build
  let summary: BuildSummary;
  try {
    summary = await build(config);
  } catch (err) {
    // build() throws in strict mode when there are validation failures
    if (err instanceof Error) {
      console.error(`\n${err.message}`);
    } else {
      console.error('Build failed with an unexpected error:', err);
    }
    process.exit(1);
  }

  // Print results
  printSummary(summary, config.check ?? false);

  // Exit code
  if (!summary.success) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
