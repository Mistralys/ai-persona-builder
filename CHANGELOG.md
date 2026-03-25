# Changelog

All notable changes to `@mistralys/persona-builder` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-25

First stable public release. The plugin architecture is complete and the built-in ledger plugin is fully implemented, tested, and publicly exported.

### Added

- **Ledger plugin — core helpers** (`src/plugins/ledger/`) — four internal TypeScript modules forming the foundation of the built-in ledger plugin:
  - `roster-renderer.ts` — `renderRoster(roster: RosterEntry[], activeNumber: number): string` — renders the agent roster as a numbered Markdown list with `(YOU)` suffix on the active entry. Ported from `scripts/lib/persona-helpers.js`.
  - `mcp-tools-renderer.ts` — `renderMcpToolsTable(tools: McpToolEntry[]): string` — renders MCP tools as Markdown table rows, filtering out `note_only: true` entries. Ported from `scripts/lib/persona-helpers.js`.
  - `role-validator.ts` — `validateRole(role, manifestRoles)` and `validateNoteOnlyGuard(output, mcpTools)` — pure validation helpers compatible with the `onValidate` plugin hook. `validateRole` warns when a persona role is absent from the workflow manifest; `validateNoteOnlyGuard` errors when a `note_only` tool leaks into rendered output (second-line defence after the renderer filter).
  - `frontmatter-templates.ts` — `FRONTMATTER_LEDGER_VSCODE` and `FRONTMATTER_LEDGER_CC` string constants — ledger-suite frontmatter templates for VS Code and Claude Code targets respectively. Structurally identical to the originals in `build-personas.js`; `ccFrontmatterFields()` is inlined as a named constant.
  - All four modules are pure functions with no file-system I/O, no side effects, and no global state. All exports carry explicit TypeScript types; no use of `any`.
- **Ledger plugin — factory & public export** (`src/plugins/ledger/index.ts`):
  - `ledgerPlugin(options?: LedgerPluginOptions): PersonaBuildPlugin` — factory function that composes the core helpers into a fully wired `PersonaBuildPlugin` instance.
  - `LedgerPluginOptions` interface — `manifestRoles?: ReadonlyArray<string>` (scopes role validation to a known set) and `warnOnUnknownRole?: boolean` (default: `true`).
  - Sub-path export `@mistralys/persona-builder/plugins/ledger` registered in the `exports` field of `package.json`; compiled artefacts `dist/plugins/ledger/index.{js,cjs,d.ts,d.cts}` present in dist.
- **Ledger plugin — unit tests** (`tests/plugins/ledger.test.ts`) — comprehensive test suite covering the roster renderer, MCP tools renderer, role validator, `note_only` guard, plugin hook composition, and `LedgerPluginOptions` defaults. Brings the total test count to 227 tests across 14 test files.
- **Ledger plugin documentation** (`docs/plugins.md`) — full Ledger Plugin section covering installation, configuration, `LedgerPluginOptions` reference, and usage examples.

## [0.2.0] - 2026-03-25

### Added

- **Template engine** (`src/engine/`) — pure functions for template rendering:
  - `resolvePartials(template, partials)` — injects `{{> partial}}` blocks
  - `resolveConditionals(template, flags)` — evaluates `{{#if flag}}…{{/if}}` blocks
  - `resolveVariables(template, vars)` — substitutes `{{variable}}` tokens
  - Post-processor passes: `collapseBlankLines`, `ensureBlankLineBeforeHeadings`, `normalizeNewlines`
  - Serializers: `serializeTools`, `serializeToolsList`
- **File I/O layer** (`src/loaders/`) — file discovery and loading:
  - `loadPartials(dir)` — reads all `.md` files from a directory, keyed by filename stem
  - `discoverPersonaYamls(root)` — recursively discovers all `**/*.yaml` persona files
  - `loadMetadata(yamlPath)` — parses YAML into a typed `PersonaMetadata` object
  - `loadContent(mdPath)` — reads a persona Markdown template as a raw string
  - `PersonaMetadata` type
- **Plugin architecture** (`src/plugins/`) — extension interface for the build pipeline:
  - `PersonaBuildPlugin` interface with hooks: `onSuiteInit`, `onBuildContext`, `onPostRender`, `onValidate`, `frontmatterTemplates`
  - `ValidationResult` type (`severity: 'error' | 'warning' | 'info'`, `message: string`)
  - Plugin runner functions: `runSuiteInit`, `runBuildContext`, `runPostRender`, `runValidate` — all invoke hooks in registration order
- **Built-in validators** (`src/validators/`):
  - `validateFileName(filePath)` — enforces kebab-case naming convention; returns `ValidationResult[]` with `severity: 'error'` for violations
  - Strict-marker validator — scans rendered output for unresolved `{{…}}` tokens outside code fences
- **Builder core** (`src/builders/`) — the primary build orchestration layer:
  - `build(config: BuildConfig): Promise<BuildSummary>` — top-level entry point; orchestrates suite discovery, rendering, plugin hooks, validation, and file writes
  - `buildSuite(config, plugins)` — processes all personas in a single suite
  - `buildPersona(personaYamlPath, config, plugins)` — processes a single persona through the full pipeline
  - Frontmatter registry (`src/builders/frontmatter.ts`) with built-in templates for `vscode` and `claude-code` targets; overridable via plugin `frontmatterTemplates`
  - `BuildConfig`, `BuildResult`, `BuildSummary`, `TargetType` types
- **CLI entry point** (`src/cli.ts`) — `persona-build` executable:
  - `--config <path>` — load build config from `.js` (ESM), `.cjs`, or `.json`
  - `--check` — render personas but skip writing output files; always exits 0 alone
  - `--strict` — exit 1 if any `ValidationResult` has severity `error` or `warning`; combine with `--check` for a safe CI dry-run
  - `--help` — print usage and exit 0
  - `--version` — print package version (sourced from `package.json`) and exit 0
- **Public API barrel** (`src/index.ts`) — named exports: `build`, `BuildConfig`, `BuildSummary`, `PersonaBuildPlugin`, `TargetType`, `ValidationResult`, `VERSION`
- `VERSION` export — reads from `package.json` at runtime (single source of truth)
- Integration test suite in `tests/integration/` — calls `build(config)` against `fixtures/` and asserts output files are written with correct content
- Comprehensive `README.md` — installation, quick-start (programmatic + CLI), `BuildConfig` reference, `SuiteConfig` reference, `BuildSummary` reference, CLI flags reference, `PersonaBuildPlugin` interface with three code examples, directory conventions, and template syntax guide

## [0.1.0] - 2026-03-25

### Added

- Initial repository scaffold for `@mistralys/persona-builder` TypeScript library
- `package.json` with `@mistralys/persona-builder` package name, dual CJS + ESM exports, and `persona-build` CLI bin entry
- `js-yaml` as the sole production dependency
- `tsup` build pipeline producing both CJS (`dist/index.cjs`) and ESM (`dist/index.js`) outputs with TypeScript declarations
- `tsconfig.json` with `strict: true`, `ES2022` target, `bundler` module resolution, and `node18` engine target
- `vitest.config.ts` configured for Node environment with `passWithNoTests: true` so the test suite exits cleanly before test files are written
- Placeholder `src/index.ts` exporting `VERSION = "0.1.0"` — future module exports are scaffolded as commented-out barrel re-exports with WP references
- Placeholder `src/cli.ts` documenting all planned CLI flags (`--config`, `--suite`, `--target`, `--check`, `--dry-run`, `--strict`) and exiting cleanly
- Full directory skeleton: `src/engine/`, `src/loaders/`, `src/plugins/`, `src/validators/`, `src/builders/` with `.gitkeep` trackers
- Full test skeleton: `tests/engine/`, `tests/builders/`, `tests/loaders/`, `tests/plugins/`, `tests/validators/` with `.gitkeep` trackers
- Fixture suite under `fixtures/`: `shared/partials/greeting.md`, `sample-suite/meta/_shared.yaml`, `sample-suite/meta/example-persona.yaml`, `sample-suite/content/example-persona.md`, `sample-suite/partials/suite-specific.md`
- `.gitignore` entry for `dist/` (in addition to the existing `node_modules/` entry)

[Unreleased]: https://github.com/Mistralys/ai-persona-builder/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Mistralys/ai-persona-builder/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/Mistralys/ai-persona-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Mistralys/ai-persona-builder/releases/tag/v0.1.0
