# Tech Stack & Patterns

## Language & Runtime

| Property | Value |
|----------|-------|
| Language | TypeScript 5.8.2 |
| Target | ES2022 |
| Module System | ESM (Node.js) with dual CJS + ESM distribution |
| Module Resolution | `bundler` (tsconfig) |
| Strict Mode | `strict: true` in `tsconfig.json` |
| Minimum Node.js | ≥ 18.17 (required by `readdir` with `{ recursive: true }`) |

## Build Tooling

| Tool | Purpose |
|------|---------|
| **tsup** | Bundles `src/index.ts` and `src/cli.ts` into dual CJS + ESM outputs with `.d.ts` declarations. Configured in `tsup.config.ts`. |
| **tsc** | Type-checking only (`tsc --noEmit`). Not used for production builds. |
| **Vitest** | Test runner. Configured in `vitest.config.ts` with `globals: true`, Node environment. |

## Dependencies

### Production

| Package | Purpose |
|---------|---------|
| `js-yaml` | Parse YAML metadata files (`_shared.yaml`, per-persona YAML). Sole production dependency. |

### Development

| Package | Purpose |
|---------|---------|
| `tsup` | Build tool (CJS + ESM bundling, declaration generation). |
| `typescript` | Type-checking (`tsc --noEmit`). |
| `vitest` | Test framework. |
| `@vitest/coverage-v8` | Code coverage provider for Vitest. |
| `@types/js-yaml` | Type declarations for `js-yaml`. |
| `@types/node` | Node.js type declarations. |

## Architectural Patterns

### Layered Architecture

The codebase is organised into five layers, each with a clear responsibility boundary:

```
  builders/     ← Orchestration layer (build(), buildSuite(), buildPersona())
      ↓ uses
  plugins/      ← Extension hooks (PersonaBuildPlugin interface + runner)
      ↓ uses
  engine/       ← Pure template rendering (partials, conditionals, variables, post-processing)
  loaders/      ← File I/O (YAML parsing, content loading, partials loading)
  validators/   ← Pure validation (filename rules, strict marker checks)
```

### Key Patterns

| Pattern | Where Used |
|---------|------------|
| **Pure functions (zero-dependency engine)** | All five engine modules (`partials.ts`, `conditionals.ts`, `variables.ts`, `postProcessor.ts`, `serializer.ts`) have zero imports — no Node built-ins, no external packages. |
| **Plugin hooks with sequential chaining** | Plugins are invoked in registration order. `onBuildContext` and `onPostRender` are accumulating hooks (each receives the previous plugin's output). `onValidate` is a collecting hook (results are concatenated). |
| **Barrel re-exports** | Each layer has an `index.ts` that re-exports public symbols. The top-level `src/index.ts` re-exports from all layers. |
| **Dual frontmatter template system** | Built-in defaults → config-level overrides → plugin-level overrides (highest precedence). |
| **Synchronous plugin runner** | All plugin hooks are synchronous. The async boundary exists only in the builders layer (file I/O). |
| **Convention over configuration** | Default sub-directory names (`meta/`, `content/`, `partials/`) can be overridden but rarely need to be. |
| **Pure validator / impure orchestrator** | `validateToolParity()` (`src/validators/tool-parity-validator.ts`) is a plain-data validator: it takes already-collected `TargetCapabilitySet[]` and returns findings, with no knowledge of *how* those sets were assembled or *when* to run. `build()` (`src/builders/persona-builder.ts`) is the impure orchestrator: it owns grouping (by `personaYamlPath`) and filtering (only targets with a capability map and a defined `effectiveTools` participate) as a post-pass once every suite × target has built, then hands the assembled data to the validator. New cross-cutting checks should follow this split — keep the comparison logic pure and push data assembly/timing decisions into the builder that has visibility across targets. |
| **Single capability-map vocabulary** | `TargetDefinition.toolCapabilities` (`src/targets/types.ts`) — a capability → granting-tool-names map — is the single shared vocabulary consumed by `buildContext()` (context flags), `validateToolRequirements()` (dispatch-grant and foreign-notation checks, `src/validators/tool-requirements-validator.ts`), and `validateToolParity()` (cross-target parity checks, `src/validators/tool-parity-validator.ts`). No target-name branching exists in any of the three — each reads the same map to answer "what tool grants this capability on this target?" New tool-aware logic should read `toolCapabilities` rather than introducing a parallel per-target lookup. |

## Package Distribution

The library ships as a dual-format npm package:

| Entry | Format | File |
|-------|--------|------|
| `main` | CommonJS | `dist/index.cjs` |
| `module` | ESM | `dist/index.js` |
| `types` | TypeScript declarations | `dist/index.d.ts` |
| `bin` (CLI) | ESM | `dist/cli.js` |

The `exports` map in `package.json` uses conditional exports (`import` / `require` / `types`).

## npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsup` | Production build. |
| `dev` | `tsup --watch` | Watch-mode build. |
| `test` | `vitest run` | Run all tests once. |
| `test:watch` | `vitest` | Run tests in watch mode. |
| `typecheck` | `tsc --noEmit` | Type-check without emitting. |
