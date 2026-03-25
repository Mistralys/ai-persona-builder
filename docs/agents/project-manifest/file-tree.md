# File Tree

```
@mistralys/persona-builder/
├── package.json                    # npm package config (dual CJS + ESM exports, bin entry)
├── tsconfig.json                   # TypeScript config (strict, ES2022, bundler resolution)
├── tsup.config.ts                  # Build config (dual format, three entry points: index, cli, plugins/ledger/index)
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
│   │   ├── runner.ts               # Hook invocation: runSuiteInit, runBuildContext, etc.
│   │   └── ledger/                 # Ledger plugin (sub-path: @mistralys/persona-builder/plugins/ledger)
│   │       ├── index.ts            # ledgerPlugin(options) factory — LedgerPluginOptions type
│   │       ├── roster-renderer.ts  # renderRoster() — numbered Markdown list with (YOU) marker
│   │       ├── mcp-tools-renderer.ts # renderMcpToolsTable() — filters note_only entries
│   │       ├── role-validator.ts   # validateRole() + validateNoteOnlyGuard()
│   │       └── frontmatter-templates.ts # FRONTMATTER_LEDGER_VSCODE, FRONTMATTER_LEDGER_CC
│   │
│   ├── builders/                   # Build orchestration
│   │   ├── index.ts                # Barrel re-export
│   │   ├── types.ts                # BuildConfig, BuildResult, BuildSummary types
│   │   ├── frontmatter.ts          # Default frontmatter templates + resolution + rendering
│   │   └── persona-builder.ts      # build(), buildSuite(), buildPersona() orchestrators
│   │
│   └── validators/                 # Validation functions
│       ├── index.ts                # Barrel re-export
│       ├── filename-validator.ts   # Kebab-case filename validation
│       └── strict-validator.ts     # Required-marker presence validation
│
├── tests/
│   ├── README.md                   # Test suite documentation
│   ├── engine/                     # Engine module tests (74 tests)
│   │   ├── partials.test.ts
│   │   ├── conditionals.test.ts
│   │   ├── variables.test.ts
│   │   ├── postProcessor.test.ts
│   │   └── serializer.test.ts
│   ├── loaders/                    # Loader tests (40 tests)
│   │   ├── partials-loader.test.ts
│   │   ├── metadata-loader.test.ts
│   │   └── content-loader.test.ts
│   ├── plugins/                    # Plugin system tests (27 tests)
│   │   └── plugin-runner.test.ts
│   ├── builders/                   # Builder tests (33 tests)
│   │   ├── persona-builder.test.ts
│   │   └── persona-builder-edge-cases.test.ts
│   ├── validators/                 # Validator tests (46 tests)
│   │   ├── filename-validator.test.ts
│   │   └── strict-validator.test.ts
│   └── integration/                # End-to-end integration tests (7 tests)
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
    └── agents/
        └── project-manifest/       # This manifest
```
