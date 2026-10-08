/**
 * src/targets/tools.ts
 *
 * Shared tool-list and capability resolution helpers.
 *
 * Rendering (`buildContext()`'s `cc_tools`/`da_tools` fallback) and
 * validation (dispatch-grant, capability-parity, foreign-notation checks in
 * later steps) both need "which tools does this persona grant on this
 * target, and which capabilities do they add up to". Defining that rule once
 * here — instead of once per caller — is what prevents the drift AI Insights
 * already suffered from its own separately-maintained copy.
 */

import type { TargetDefinition } from './types.js';
import type { TargetRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// pickToolList
// ---------------------------------------------------------------------------

/**
 * Pick a tool list out of a record by key, falling back to `tools`.
 *
 * @param record  The record to read from (typically a rendering context).
 * @param key     The preferred key (e.g. `'cc_tools'`, `'da_tools'`).
 * @returns       `record[key]` when it is an array; otherwise `record['tools']`
 *                when that is an array; otherwise `undefined`.
 */
export function pickToolList(record: Record<string, unknown>, key: string): string[] | undefined {
  const primary = record[key];
  if (Array.isArray(primary)) return primary as string[];

  const fallback = record['tools'];
  if (Array.isArray(fallback)) return fallback as string[];

  return undefined;
}

// ---------------------------------------------------------------------------
// resolveTargetTools
// ---------------------------------------------------------------------------

/**
 * Resolve the effective tool list for a target, applying its
 * `toolsContextKey` (falling back to `'tools'` when the definition omits the
 * field, exactly like `pickToolList()`'s own fallback).
 *
 * @param context     The rendering context (or any record) to read from.
 * @param definition  The target definition whose `toolsContextKey` selects
 *                    which context field to read.
 * @returns           The resolved tool list, or `undefined` when neither the
 *                    target's key nor `'tools'` is present as an array.
 */
export function resolveTargetTools(
  context: Record<string, unknown>,
  definition: TargetDefinition,
): string[] | undefined {
  const key = definition.toolsContextKey ?? 'tools';
  return pickToolList(context, key);
}

// ---------------------------------------------------------------------------
// resolveCapabilities
// ---------------------------------------------------------------------------

/**
 * Resolve which capabilities a tool list grants on a target, per the
 * target's `toolCapabilities` map and `mcpToolPattern`.
 *
 * For each mapped capability, the first tool in `tools` (in list order) that
 * grants it is recorded. Tool names with no counterpart in the target's
 * capability map or MCP pattern are ignored — this is deliberate: the
 * correspondence is intentionally rough (see plan §D), so a custom or
 * IDE-specific tool (e.g. VS Code's `vscode`, `browser`) does not "grant"
 * anything and is not reported as a foreign or unmapped capability by this
 * function (validators reading this map decide whether an absence matters).
 *
 * @param tools       The resolved tool list (see `resolveTargetTools()`).
 * @param definition  The target definition supplying the capability map.
 * @returns           Map of capability name → the first tool granting it.
 *                     Empty when `tools` is absent/empty or the target has
 *                     no capability map and no MCP pattern.
 */
export function resolveCapabilities(
  tools: string[] | undefined,
  definition: TargetDefinition,
): Map<string, string> {
  const result = new Map<string, string>();
  if (!tools || tools.length === 0) return result;

  const capabilityMap = definition.toolCapabilities;
  if (capabilityMap) {
    for (const [capability, grantingTools] of Object.entries(capabilityMap)) {
      for (const tool of tools) {
        if (grantingTools.includes(tool)) {
          result.set(capability, tool);
          break;
        }
      }
    }
  }

  if (definition.mcpToolPattern) {
    for (const tool of tools) {
      const match = definition.mcpToolPattern.exec(tool);
      const server = match?.[1];
      if (server) {
        const capability = `mcp:${server}`;
        if (!result.has(capability)) {
          result.set(capability, tool);
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// recognizedBy
// ---------------------------------------------------------------------------

/**
 * Find which other registered targets recognise a tool name — either
 * through a `toolCapabilities` entry or an `mcpToolPattern` match.
 *
 * Used for the foreign-notation check: a tool spelled in another target's
 * notation (e.g. `read` appearing in a claude-code tool list) is recognised
 * by `vscode` but not by `claude-code`.
 *
 * @param tool           The tool name to look up.
 * @param registry       The target registry to search.
 * @param excludeTarget  The target name to exclude from the search (typically
 *                       the tool's own target, which the caller already knows
 *                       does not recognise it).
 * @returns              Names of every other registered target that
 *                       recognises `tool`, in registry order.
 */
export function recognizedBy(
  tool: string,
  registry: TargetRegistry,
  excludeTarget: string,
): string[] {
  const recognizing: string[] = [];

  for (const definition of registry.allDefinitions()) {
    if (definition.name === excludeTarget) continue;

    let recognized = false;

    if (definition.toolCapabilities) {
      for (const grantingTools of Object.values(definition.toolCapabilities)) {
        if (grantingTools.includes(tool)) {
          recognized = true;
          break;
        }
      }
    }

    if (!recognized && definition.mcpToolPattern?.test(tool)) {
      recognized = true;
    }

    if (recognized) {
      recognizing.push(definition.name);
    }
  }

  return recognizing;
}
