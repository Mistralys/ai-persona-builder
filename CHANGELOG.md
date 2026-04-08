# Changelog

All notable changes to @mistralys/persona-builder will be documented in this file.

## v2.2.0 - Deep-Agents Target & Target Variable Bugfix
- Targets: Added extensible `TargetRegistry` class for registering custom build targets.
- Targets: Added built-in `deep-agents` target with `DEFAULT_FRONTMATTER_DEEP_AGENTS` template.
- Targets: Added `TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, `TARGET_DEEP_AGENTS` name constants.
- Targets: Added `defaultRegistry` singleton pre-populated with all three built-in targets.
- Targets: Exported `TargetDefinition` interface and `TargetRegistry` from the package root.
- Builder: `BuildConfig.targets` widened to `string[]` to accept any registered target name.
- Builder: `BuildConfig.frontmatter` widened to `Record<string, string>` for custom targets.
- Builder: Added optional `BuildConfig.targetRegistry` for supplying a custom target registry.
- Builder: Added `da_file_name`, `da_file_name_noext` computed context fields for deep-agents.
- Builder: Injects `target_deep_agents` boolean flag when building the deep-agents target.
- Builder: Fixed target type variables being ignored.
- Docs: Updated `metadata-reference.md` with `da_*` computed context fields.
- Docs: Updated `configuration.md` with `targetRegistry` config option and three-target usage.
- Docs: Updated `api-surface.md` with new target exports and widened `BuildConfig` types.
- Tests: Added `da-computed-fields.test.ts` (7 tests covering all `da_*` computed fields).
- Tests: Added `target-registry.test.ts` covering registry registration and metadata.
- Tests: Added deep-agents build tests (output dir, filename, frontmatter, flag injection).
- Tests: Added three-target integration test (vscode + claude-code + deep-agents).
- Tests: Added `target_deep_agents` injection tests to `target-variable-injection.test.ts`.

## v2.1.2 - Documentation Update
- Docs: Removed stale ledger plugin references.
- Docs: Optimized docs for use as a library in other projects.

## v2.1.1 - Manifest Update
- Docs: Updated the Manifest docs.

## v2.1.0 - Cross-Suite Agent Name Variables
- Builder: Added agent name map pre-scan across all configured suites.
- Builder: Injects `agent_<slug>` context variables for every persona.
- Tests: Added dedicated agent name map test suite.
- Tests: Extended integration tests for agent name variable resolution.
- Docs: Updated api-surface and data-flows for new signatures.
- Dependencies: Updated to remove vulnerable versions.

## v2.0.0 - Ledger Plugin Removal (Breaking-M)
- LedgerPlugin: Removed from this library (migrated to ai-insights-dev workspace).
- Package: Removed ./plugins/ledger sub-path export and build entries.
- Tests: Removed ledger plugin test suite.

### Breaking Changes

The ledger plugin and its ./plugins/ledger sub-path export have been completely removed. It has been migrated to the ai-insights-dev workspace as a local project module. External consumers will need to implement their own ledger plugin.

## v1.0.1 - Tech Debt & Bug Fixes
- Docs: Corrected the warnOnUnknownRole escalation contract documentation.
- Exports: Eliminated duplicate TargetType re-export.
- Utils: Extracted escapeRegExp into a shared module.
- PluginRunner: Added target parameter to onValidate hook for better cache keying.
- Scripts: Fixed version logging in persona build script.
- Scripts: Ensured catch blocks propagate the library's exit code instead of defaulting to 1.
- Scripts: Removed orphaned empty directories.

## v1.0.0 - Stable Release
- LedgerPlugin: Added core helpers for rendering rosters and MCP tools.
- LedgerPlugin: Added validateRole and validateNoteOnlyGuard validation helpers.
- LedgerPlugin: Added frontmatter templates for VS Code and Claude Code targets.
- LedgerPlugin: Added factory function and plugins/ledger sub-path export.
- Docs: Added full documentation on installing and configuring the ledger plugin.
- Tests: Added comprehensive test suite for the new ledger plugin features.

## v0.2.0 - Core Engine Architecture
- Engine: Added pure functions for resolving partials, conditionals, and variables.
- Engine: Added post-processor passes and serializer utilities.
- Loaders: Added file discovery and typed loading for Markdown, YAML, and partials.
- Plugins: Added PersonaBuildPlugin interface with pipeline hooks and validation types.
- Plugins: Added runner functions to invoke hooks in registration order.
- Validators: Added kebab-case filename validation and strict-marker scanning.
- Builder: Added top-level build orchestration for executing persona suites.
- CLI: Added persona-build executable with --config, --check, and --strict flags.
- API: Added main barrel exporting builder functions, plugins, and types.
- Package: Exported runtime VERSION reading directly from package configuration.
- Tests: Added integration test suite asserting correct build output generation.
- Docs: Added comprehensive README.md with usage instructions and API references.

## v0.1.0 - Initial Scaffold
- Package: Scaffolded repository with dual CJS/ESM exports and CLI bin entry.
- Package: Added js-yaml as the sole production dependency.
- Build: Configured 	sup pipeline and 	sconfig.json for ES2022 / Node 18.
- Tests: Configured vitest workflow and added initial test fixtures.
- Project: Created directory skeleton for source code and test files.
- API: Added placeholder index barrel and CLI entry points.
- Repo: Configured .gitignore for standard exclusions.
