/**
 * src/loaders/index.ts
 *
 * Barrel export for all file-system loader modules.
 * Re-exports every public symbol from the loaders layer.
 */

export { loadPartials } from './partials-loader.js';
export { discoverPersonaYamls, loadMetadata } from './metadata-loader.js';
export type { PersonaMetadata } from './metadata-loader.js';
export { loadContent } from './content-loader.js';
