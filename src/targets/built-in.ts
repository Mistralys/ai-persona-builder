/**
 * src/targets/built-in.ts
 *
 * Creates and exports the defaultRegistry — a TargetRegistry pre-populated
 * with the three built-in targets: 'vscode', 'claude-code', and 'deep-agents'.
 *
 * Consumers import defaultRegistry when they need to register additional
 * custom targets or query the built-in target definitions.
 */

import { TargetRegistry } from './registry.js';
import {
  DEFAULT_FRONTMATTER_CLAUDE_CODE,
  DEFAULT_FRONTMATTER_DEEP_AGENTS,
  DEFAULT_FRONTMATTER_VSCODE,
  TARGET_CLAUDE_CODE,
  TARGET_DEEP_AGENTS,
  TARGET_VSCODE,
} from './types.js';

// ---------------------------------------------------------------------------
// Default registry
// ---------------------------------------------------------------------------

/**
 * Singleton TargetRegistry pre-populated with the three built-in targets:
 * `'vscode'`, `'claude-code'`, and `'deep-agents'`.
 *
 * Import and call `register()` on this instance to add custom targets before
 * invoking `build()`.
 *
 * **Warning:** This is a module-level singleton. Calling `register()` on it
 * in tests mutates shared state that persists across test cases. Use
 * `defaultRegistry.clone()` to obtain an isolated copy for test scenarios
 * that need to register additional targets.
 */
export const defaultRegistry = new TargetRegistry();

defaultRegistry.register({
  name: TARGET_VSCODE,
  outputDirKey: 'vscode',
  filenameContextKey: 'vs_file_name',
  defaultFrontmatter: DEFAULT_FRONTMATTER_VSCODE,
  contextFlags: { target_vscode: true },
  defaultEnabled: true,
});

defaultRegistry.register({
  name: TARGET_CLAUDE_CODE,
  outputDirKey: 'claude-code',
  filenameContextKey: 'cc_file_name',
  defaultFrontmatter: DEFAULT_FRONTMATTER_CLAUDE_CODE,
  contextFlags: { target_claude_code: true },
  defaultEnabled: true,
});

defaultRegistry.register({
  name: TARGET_DEEP_AGENTS,
  outputDirKey: 'deep-agents',
  filenameContextKey: 'da_file_name',
  defaultFrontmatter: DEFAULT_FRONTMATTER_DEEP_AGENTS,
  contextFlags: { target_deep_agents: true },
  defaultEnabled: false,
});
