# Changelog

All notable changes to @mistralys/persona-builder will be documented in this file.

## v2.4.0 - Dynamic Partials & Subagent Declarations
- Builder: Added `BuildConfig.partials` inline partials map as lowest-precedence layer.
- Builder: Added global `BuildConfig.variables` and per-suite `SuiteConfig.variables` template maps.
- Builder: Extended partials to a five-layer stack; context merge to a seven-layer stack.
- Builder: Subagent usage is now validated in personas to ensure they exist.
- Metadata: Added the `subagents` field to specify an agent's possible subagents.
- Plugins: Added `onPartials` hook for suite-level partial injection after disk load.
- Plugins: Added `onPersonaPartials` hook for per-persona partial overrides.
- Tests: Added suites for partials config, suite variables, persona hooks, and integration.
- Docs: Added dynamic partials and plugins guides; updated configuration and template-syntax docs.
- Agents: Added release-check skill.

## v2.3.0 - Else-If Chain Support
- Engine: Added `{{else if flag}}` chain syntax; arbitrary depth, first truthy branch wins.
- Engine: `{{else if}}` composes correctly with existing nested `{{#if}}` syntax.
- Tests: Added test cases covering all else-if acceptance criteria.
- Docs: Added else-if chain documentation with truth table to the template syntax guide.
- Docs: Updated API surface and constraints docs for the new syntax.

## v2.2.0 - Deep-Agents Target & Target Variable Bugfix
- Targets: Added extensible target registry with `deep-agents` as a third built-in target.
- Builder: Added `da_*` computed context fields and `target_deep_agents` flag.
- Builder: Fixed target type variables being ignored.
- Tests: Added registry, deep-agents build, and three-target integration tests.
- Docs: Updated metadata reference, configuration, and API surface for new target support.

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
