/**
 * @mistralys/persona-builder
 *
 * Public API barrel export.
 */

import { createRequire } from 'node:module';

export * from './engine/index.js';
export * from './loaders/index.js';
export * from './plugins/index.js';
export * from './builders/index.js';
export * from './validators/index.js';
export * from './utils/index.js';

/** Package version — sourced from package.json (single source of truth). */
const _pkgRequire = createRequire(import.meta.url);
export const VERSION = (_pkgRequire('../package.json') as { version: string }).version;
