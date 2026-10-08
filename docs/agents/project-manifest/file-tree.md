# File Tree

```
@mistralys/persona-builder/
├── package.json                    # npm package config (dual CJS + ESM exports, bin entry)
├── tsconfig.json                   # TypeScript config (strict, ES2022, bundler resolution)
├── tsup.config.ts                  # Build config (dual format, two entry points: index, cli)
├── vitest.config.ts                # Test runner config
├── CHANGELOG.md                    # Version history
├── README.md                       # User-facing documentation
├── LICENSE                         # MIT license
│
├── src/
│   ├── index.ts                    # Public API barrel export + VERSION constant
│   ├── cli.ts                      # CLI entry point (persona-build executable)
│   │
│   ├── engine/                     # Pure template rendering functions (zero dependencies)
│   │   ├── index.ts                # Barrel re-export
│   │   ├── partials.ts             # {{> name}} resolution (depth-2 recursion)
│   │   ├── conditionals.ts         # {{#if flag}}…{{/if}} resolution
│   │   ├── variables.ts            # {{varName}} substitution
│   │   ├── postProcessor.ts        # Blank-line collapsing, heading spacing, newline normalization
│   │   └── serializer.ts           # Tool list serialization (YAML flow format)
│   │
│   ├── loaders/                    # File I/O layer
│   │   ├── index.ts                # Barrel re-export
│   │   ├── partials-loader.ts      # Load .md files from a directory as a partials map
│   │   ├── metadata-loader.ts      # YAML discovery + parsing into PersonaMetadata
│   │   └── content-loader.ts       # Read raw Markdown content templates
│   │
│   ├── plugins/                    # Plugin system
│   │   ├── index.ts                # Barrel re-export (types + runner functions)
│   │   ├── types.ts                # Core types: TargetType, PersonaMetadata, SuiteConfig, etc.
│   │   └── runner.ts               # Hook invocation: runSuiteInit, runBuildContext, etc.
│   │
│   ├── builders/                   # Build orchestration
│   │   ├── index.ts                # Barrel re-export
│   │   ├── types.ts                # BuildConfig, BuildResult, BuildSummary types
│   │   ├── frontmatter.ts          # Default frontmatter templates + resolution + rendering
│   │   ├── persona-builder.ts      # build(), buildSuite(), buildPersona() orchestrators
│   │   ├── persona-files.ts        # Low-level persona file discovery/loading (discoverSuitePersonaYamls, loadRawYaml, loadPersonaYaml)
│   │   └── persona-index.ts        # PersonaIndex pre-scan: resolvePersonaTargets(), scanPersonas(), agentNameMapFromIndex()
│   │
│   ├── targets/                    # Target registry and built-in target definitions
│   │   ├── index.ts                # Barrel re-export
│   │   ├── types.ts                # TargetDefinition interface + TARGET_* + DEFAULT_FRONTMATTER_* constants
│   │   ├── registry.ts             # TargetRegistry class
│   │   ├── built-in.ts             # defaultRegistry singleton (vscode, claude-code, and deep-agents targets)
│   │   └── tools.ts                # Tool-list/capability resolution: pickToolList, resolveTargetTools, resolveCapabilities, recognizedBy
│   │
│   ├── validators/                 # Validation functions
│   │   ├── index.ts                        # Barrel re-export
│   │   ├── filename-validator.ts           # Kebab-case filename validation
│   │   ├── strict-validator.ts             # Required-marker presence validation
│   │   ├── subagent-validator.ts           # validateSubagentRefs() — unknown-slug + target-aware "not built for target" checks
│   │   ├── tool-requirements-validator.ts  # validateToolRequirements() — pure dispatch-grant + foreign-notation checks; ToolRequirement type, SUBAGENT_DISPATCH_REQUIREMENT constant
│   │   └── tool-parity-validator.ts        # validateToolParity() — pure cross-target capability-parity check; TargetCapabilitySet, ToolParityFinding types
│   │
│   └── utils/                      # Shared utility functions
│       ├── index.ts                # Barrel re-export
│       ├── changelog.ts            # resolveChangelogMeta() — changelog block scalar parser
│       └── regex.ts                # escapeRegExp() — safe RegExp string escaping
│
├── tests/
│   ├── README.md                   # Test suite documentation
│   ├── helpers/                    # Shared test utilities, not Vitest test files (createMinimalSuite() fixture factory)
│   ├── engine/                     # Engine module tests
│   │   ├── partials.test.ts
│   │   ├── conditionals.test.ts
│   │   ├── variables.test.ts
│   │   ├── postProcessor.test.ts
│   │   └── serializer.test.ts
│   ├── loaders/                    # Loader tests
│   │   ├── partials-loader.test.ts
│   │   ├── metadata-loader.test.ts
│   │   └── content-loader.test.ts
│   ├── plugins/                    # Plugin system tests
│   │   └── plugin-runner.test.ts   # runSuiteInit, runBuildContext, runPostRender, runValidate, runPartials, runPersonaPartials
│   ├── targets/                    # Target registry tests
│   │   ├── target-registry.test.ts
│   │   └── target-tools.test.ts    # pickToolList/resolveTargetTools/resolveCapabilities/recognizedBy
│   ├── builders/                   # Builder tests
│   │   ├── agent-name-map.test.ts
│   │   ├── build-config-variables-and-partials.test.ts
│   │   ├── build-success.test.ts       # success = errors === 0 && (!strict || warnings === 0)
│   │   ├── changelog-version.test.ts   # changelog-derived version + last_updated
│   │   ├── config-partials-and-on-partials.test.ts
│   │   ├── config-suite-variables.test.ts
│   │   ├── da-computed-fields.test.ts
│   │   ├── on-persona-partials.test.ts
│   │   ├── persona-builder.test.ts
│   │   ├── persona-builder-edge-cases.test.ts
│   │   ├── persona-index.test.ts       # scanPersonas()/agentNameMapFromIndex() cross-suite indexing
│   │   ├── persona-targets.test.ts     # resolvePersonaTargets() rule cases
│   │   ├── subagent-validation.test.ts # buildPersona()'s wired-in subagent slug validation
│   │   ├── target-variable-injection.test.ts
│   │   ├── template-whitespace-and-comments.test.ts  # stripComments() wiring at all three builder strip points
│   │   ├── tool-parity.test.ts         # build()'s capability-parity post-pass — grouping/filtering integration cases
│   │   ├── tool-requirements.test.ts   # validateToolRequirements() wiring into buildPersona()
│   │   └── tools-block-fields.test.ts  # tools_block/cc_tools_block/da_tools_block derivation
│   ├── validators/                 # Validator tests
│   │   ├── filename-validator.test.ts
│   │   ├── strict-validator.test.ts
│   │   ├── subagent-validator.test.ts           # validateSubagentRefs() unknown-slug/target-aware cases
│   │   ├── tool-requirements-validator.test.ts  # validateToolRequirements() dispatch-grant/foreign-notation cases
│   │   └── tool-parity-validator.test.ts        # validateToolParity() pure cross-target parity cases
│   ├── utils/                      # Utility tests
│   │   └── changelog.test.ts       # resolveChangelogMeta() unit tests
│   └── integration/                # End-to-end integration tests
│       └── build.test.ts
│
├── fixtures/                       # Test fixtures
│   ├── sample-suite/
│   │   ├── meta/
│   │   │   ├── _shared.yaml        # Suite-level shared defaults
│   │   │   └── example-persona.yaml
│   │   ├── content/
│   │   │   └── example-persona.md  # Markdown content template
│   │   └── partials/
│   │       └── suite-specific.md   # Suite-local partial
│   └── shared/
│       └── partials/
│           └── greeting.md         # Cross-suite shared partial
│
├── dist/                           # Build output (gitignored)
└── docs/
    ├── getting-started.md          # Step-by-step tutorial with verified rendered output
    ├── metadata-reference.md       # All recognized YAML metadata fields by tier
    ├── api.md                      # Public exports reference
    ├── building-skills.md          # Building SKILL.md files with a custom target registry
    ├── cli.md                      # CLI flags and config file format
    ├── configuration.md            # BuildConfig / SuiteConfig / BuildSummary reference
    ├── directory-convention.md     # Expected source layout
    ├── dynamic-partials.md         # Build-time variables and partial injection (global/suite/persona)
    ├── migrating-to-v3.md          # v3.0.0 upgrade guide — breaking changes and what to do
    ├── plugins.md                  # PersonaBuildPlugin interface and examples
    ├── releasing.md                # Maintainer release guide — changelog-first flow, checks, publishing
    ├── target-differences.md       # VS Code vs Claude Code — tool notation, frontmatter, filenames
    ├── template-syntax.md          # Variables, partials, conditionals, comments, built-in context vars
    └── agents/
        └── project-manifest/       # This manifest
```
