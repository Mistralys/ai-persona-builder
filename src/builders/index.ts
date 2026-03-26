/**
 * src/builders/index.ts
 *
 * Barrel export for all builder modules.
 * Re-exports every public symbol from the builders layer.
 */

export type { BuildConfig, BuildResult, BuildSummary } from './types.js';

export {
  DEFAULT_FRONTMATTER_VSCODE,
  DEFAULT_FRONTMATTER_CLAUDE_CODE,
  resolveFrontmatterTemplate,
  renderFrontmatter,
} from './frontmatter.js';

export {
  buildPersona,
  buildSuite,
  build,
} from './persona-builder.js';
