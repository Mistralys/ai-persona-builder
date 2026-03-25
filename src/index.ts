/**
 * @smor/persona-build
 *
 * Public API barrel export.
 * Feature modules will be exported from here as they are implemented in subsequent WPs.
 */

import { createRequire } from 'node:module';

// Engine exports (WP-002)
export * from './engine/index.js';

// Loader exports (WP-003)
export * from './loaders/index.js';

// Plugin exports (WP-003/WP-004)
export * from './plugins/index.js';

// Builder exports (WP-006)
export * from './builders/index.js';

// Validator exports (WP-005)
export * from './validators/index.js';

/** Package version — sourced from package.json (single source of truth). */
const _pkgRequire = createRequire(import.meta.url);
export const VERSION = (_pkgRequire('../package.json') as { version: string }).version;
