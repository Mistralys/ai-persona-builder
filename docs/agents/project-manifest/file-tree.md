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
│   │   └── persona-builder.ts      # build(), buildSuite(), buildPersona() orchestrators
│   │
│   ├── targets/                    # Target registry and built-in target definitions
│   │   ├── index.ts                # Barrel re-export
│   │   ├── types.ts                # TargetDefinition interface + TARGET_* + DEFAULT_FRONTMATTER_* constants
│   │   ├── registry.ts             # TargetRegistry class
│   │   └── built-in.ts             # defaultRegistry singleton (vscode, claude-code, and deep-agents targets)
│   │
│   ├── validators/                 # Validation functions
│   │   ├── index.ts                # Barrel re-export
│   │   ├── filename-validator.ts   # Kebab-case filename validation
│   │   └── strict-validator.ts     # Required-marker presence validation
│   │
│   └── utils/                      # Shared utility functions
│       ├── index.ts                # Barrel re-export
│       └── regex.ts                # escapeRegExp() — safe RegExp string escaping
│
├── tests/
│   ├── README.md                   # Test suite documentation
│   ├── engine/                     # Engine module tests (90 tests)
│   │   ├── partials.test.ts
│   │   ├── conditionals.test.ts
│   │   ├── variables.test.ts
│   │   ├── postProcessor.test.ts
│   │   └── serializer.test.ts
│   ├── loaders/                    # Loader tests (40 tests)
│   │   ├── partials-loader.test.ts
│   │   ├── metadata-loader.test.ts
│   │   └── content-loader.test.ts
│   ├── plugins/                    # Plugin system tests (46 tests)
│   │   └── plugin-runner.test.ts   # runSuiteInit, runBuildContext, runPostRender, runValidate, runPartials, runPersonaPartials
│   ├── targets/                    # Target registry tests (41 tests)
│   │   └── target-registry.test.ts
│   ├── builders/                   # Builder tests (125 tests)
│   │   ├── agent-name-map.test.ts
│   │   ├── build-config-variables-and-partials.test.ts
│   │   ├── config-partials-and-on-partials.test.ts
│   │   ├── config-suite-variables.test.ts
│   │   ├── da-computed-fields.test.ts
│   │   ├── on-persona-partials.test.ts
│   │   ├── persona-builder.test.ts
│   │   ├── persona-builder-edge-cases.test.ts
│   │   └── target-variable-injection.test.ts
│   ├── validators/                 # Validator tests (46 tests)
│   │   ├── filename-validator.test.ts
│   │   └── strict-validator.test.ts
│   └── integration/                # End-to-end integration tests (20 tests)
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
    ├── cli.md                      # CLI flags and config file format
    ├── configuration.md            # BuildConfig / SuiteConfig / BuildSummary reference
    ├── directory-convention.md     # Expected source layout
    ├── plugins.md                  # PersonaBuildPlugin interface and examples
    ├── template-syntax.md          # Variables, partials, conditionals, built-in context vars
    └── agents/
        └── project-manifest/       # This manifest
```
