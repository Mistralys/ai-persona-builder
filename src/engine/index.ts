/**
 * src/engine/index.ts
 *
 * Barrel export for all template-engine modules.
 * Re-exports every public symbol from the engine layer.
 */

export { resolvePartials } from './partials.js';
export { resolveConditionals } from './conditionals.js';
export { resolveVariables } from './variables.js';
export {
  collapseBlankLines,
  ensureBlankLineBeforeHeadings,
  normalizeNewlines,
} from './postProcessor.js';
export { serializeTools, serializeToolsList } from './serializer.js';
