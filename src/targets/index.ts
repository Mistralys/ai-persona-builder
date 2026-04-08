/**
 * src/targets/index.ts
 *
 * Barrel export for the targets module.
 *
 * Re-exports:
 *   - TargetDefinition interface and TARGET_* constants (types.ts)
 *   - TargetRegistry class (registry.ts)
 *   - defaultRegistry singleton (built-in.ts)
 */

export type { TargetDefinition } from './types.js';
export { TARGET_VSCODE, TARGET_CLAUDE_CODE, TARGET_DEEP_AGENTS } from './types.js';
export { TargetRegistry } from './registry.js';
export { defaultRegistry } from './built-in.js';
