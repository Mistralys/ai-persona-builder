/**
 * src/plugins/index.ts
 *
 * Barrel export for the plugin system.
 * Re-exports all public types and runner functions.
 */

export type {
  TargetType,
  PersonaMetadata,
  SuiteConfig,
  ValidationResult,
  PersonaBuildPlugin,
} from './types.js';

export {
  runSuiteInit,
  runPartials,
  runBuildContext,
  runPersonaPartials,
  runPostRender,
  runValidate,
} from './runner.js';
