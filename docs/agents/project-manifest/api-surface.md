# Public API Surface

All public symbols are exported from the package entry point `@mistralys/persona-builder` (via `src/index.ts`).

---

## Constants

### `VERSION`

```ts
export const VERSION: string;
```

Package version string sourced from `package.json` at runtime via `createRequire`.

---

## Top-Level Functions

### `build(config)`

```ts
export async function build(config: BuildConfig): Promise<BuildSummary>;
```

Main entry point. Pre-scans all suites via `scanPersonas()` to build a `PersonaIndex` (see **Persona Index and Target Resolution** below), derives the cross-suite agent name map from it via `agentNameMapFromIndex()` (`agent_*` display-name variables and `agent_slug_*` raw-slug variables), then iterates all suites × targets, orchestrates the full pipeline (discover → load → render → validate → write), and returns an aggregated summary. Respects `check` (no writes) and `strict` (fail on warnings/errors) flags.

### `buildSuite(suiteName, suiteConfig, config, plugins, target, agentMap?, registry?, personaIndex?)`

```ts
export async function buildSuite(
  suiteName: string,
  suiteConfig: SuiteConfig,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap?: Record<string, string>,
  registry?: TargetRegistry,
  personaIndex?: PersonaIndex,
): Promise<BuildResult[]>;
```

Builds all personas in a single suite for a single target. Loads `_shared.yaml`, merges partials, fires `onSuiteInit` and `onPartials` hooks, discovers persona YAMLs, and delegates to `buildPersona()` **only for personas whose resolved `targets` (see **Persona Index and Target Resolution** below) include `target`** — an excluded persona is skipped entirely: no context is built, no plugin hooks run, and nothing is written. The optional `agentMap` is forwarded to each persona build.

**Filtering source:** The optional trailing `personaIndex` supplies each persona's resolved `targets` by YAML path without re-scanning — `build()` always passes the pre-scanned index it already built. When omitted (a direct `buildSuite()` call), `buildSuite()` self-scans its own suite alone (a single-suite `scanPersonas()` call) to resolve the same information, so a direct call still filters correctly at the cost of one extra suite-local scan. This filtering is a `buildSuite()`/`build()`-only concern — `buildPersona()` never applies `targets`, since calling it directly is an explicit request to build exactly that one persona × target combination.

**Also forwarded to validation:** The same `personaIndex` (given or self-scanned) is passed straight through to every `buildPersona()` call, so it doubles as the index that enables `validateSubagentRefs()`'s target-aware check (see `buildPersona()` below) — a `buildSuite()`/`build()` caller gets both target filtering and target-aware sub-agent validation from one index.

**Two-registry limitation:** `registry` defaults to `defaultRegistry`. If you pass a custom `TargetRegistry` only to `build()` (via `config.targetRegistry`) and call `buildSuite()` directly without the same registry argument, your custom targets will not be visible. Either pass the registry instance explicitly here, or use `build()` to have it forwarded automatically.

### `buildPersona(personaYamlPath, suiteName, suiteConfig, sharedMeta, partialsMap, config, plugins, target, agentMap?, registry?, personaIndex?)`

```ts
export async function buildPersona(
  personaYamlPath: string,
  suiteName: string,
  suiteConfig: SuiteConfig,
  sharedMeta: Record<string, unknown>,
  partialsMap: Record<string, string>,
  config: BuildConfig,
  plugins: PersonaBuildPlugin[],
  target: string,
  agentMap?: Record<string, string>,
  registry?: TargetRegistry,
  personaIndex?: PersonaIndex,
): Promise<BuildResult>;
```

Builds a single persona for a single target. Runs the full rendering pipeline: load metadata → build context (`onBuildContext`) → per-persona partials (`onPersonaPartials`) → frontmatter → body rendering → post-processing (`onPostRender`) → validation (`onValidate` + `validateSubagentRefs()`) → write. The optional `agentMap` (a `Record<string, string>` of `agent_slug_*` keys to raw slug values) is passed to `validateSubagentRefs()`, unchanged in role, to verify that every slug in `persona.subagents` has a corresponding entry in the map. Passing `{}` (the default) skips this unknown-slug check — no errors are emitted for unknown slugs. The optional trailing `personaIndex` (a cross-suite `PersonaIndex`, see `resolvePersonaTargets()` / `scanPersonas()` below) additionally enables `validateSubagentRefs()`'s target-aware check: a declared slug that exists in the index but whose resolved `targets` exclude the target currently being built produces a second, independent error. Omitting `personaIndex` skips only the target-aware check; the unknown-slug check is governed solely by `agentMap`.

**Two-registry limitation:** `registry` defaults to `defaultRegistry`. If you pass a custom `TargetRegistry` only to `build()` (via `config.targetRegistry`) and call `buildPersona()` directly without the same registry argument, your custom targets will not be visible. Either pass the registry instance explicitly here, or use `build()` to have it forwarded automatically.

---

## Cross-Suite Template Context Variables

Populated by `agentNameMapFromIndex()` (derived from the `scanPersonas()` pre-scan — see **Persona Index and Target Resolution** below) during the pre-scan phase of `build()`. For every persona across all configured suites, two context keys are injected:

| Key pattern | Value | Typical use |
|-------------|-------|-------------|
| `agent_<underscored_slug>` | `"<name> v<version>"` | Reference another persona by display name in template prose, e.g. `{{agent_my_persona}}` renders as `"My Persona v1.0.0"`. |
| `agent_slug_<underscored_slug>` | Raw hyphenated slug string | Invoke another persona as a subagent in templates, e.g. `task(subagent={{agent_slug_my_persona}})` renders as `task(subagent=my-persona)`. Useful with the Deep Agents target. |

**Key derivation:** The YAML `slug` field (falling back to the filename stem when absent) is transformed for the key suffix: hyphens replaced with underscores. The *value* of `agent_slug_*` keys preserves the original hyphens, since subagent names use hyphenated slugs.

**Example** — a persona with `slug: my-great-agent` produces:
- `agent_my_great_agent` → `"My Great Agent v1.2.0"`
- `agent_slug_my_great_agent` → `"my-great-agent"`

Both keys are injected at context merge step 4 (after derived fields, before plugin hooks) and are only set when not already present — explicit YAML overrides always win. See **Context Merge Order** in `data-flows.md`.

---

## Persona Index and Target Resolution

Owned by `src/builders/persona-index.ts` (file discovery helpers live alongside it in
`src/builders/persona-files.ts`). Replaces the former name-map-only pre-scan with a single pass
over every persona YAML that carries resolved targets and tool-parity exceptions alongside the
data the cross-suite agent name map is derived from — one scan, so the two cannot disagree.

### `resolvePersonaTargets(declared, registry, yamlPath)`

```ts
export function resolvePersonaTargets(
  declared: unknown,
  registry: TargetRegistry,
  yamlPath: string,
): TargetResolution;
```

Resolves a persona's declared `targets` field against a `TargetRegistry`:

- `undefined` → every registered target, no issues.
- Not an array → `[]`, one `error`-severity issue.
- An empty array → `[]`, one `error`-severity issue (an empty list most likely signals an author mistake, rather than "build for nothing").
- A non-string entry → dropped, one `error`-severity issue per entry.
- An entry naming an unregistered target → dropped, one `error`-severity issue per entry.
- A duplicate of an already-accepted entry → silently dropped, no issue.

Issue messages name the persona YAML path so a build failure points directly at the offending file.

### `scanPersonas(config, registry)`

```ts
export async function scanPersonas(
  config: BuildConfig,
  registry: TargetRegistry,
): Promise<PersonaIndex>;
```

Scans every configured suite's persona YAML files once (via `discoverSuitePersonaYamls()` /
`loadPersonaYaml()` from `persona-files.ts`), resolving each persona's `targets` (via
`resolvePersonaTargets()`) and `tool_parity_exceptions` along the way. Iterates suites in
`Object.entries(config.suites)` order and, within each suite, personas in
`discoverSuitePersonaYamls()`'s sorted order — the same traversal order the former
`buildAgentNameMap()` used, so `agentNameMapFromIndex()` reproduces its output byte-for-byte.

### `agentNameMapFromIndex(index)`

```ts
export function agentNameMapFromIndex(index: PersonaIndex): Record<string, string>;
```

Derives the cross-suite agent name map (see **Cross-Suite Template Context Variables** above)
from a `PersonaIndex`. For each entry, in scan order: `agent_<underscored_slug>` → `"<name>
v<version>"`, `agent_slug_<underscored_slug>` → `<slug>` (raw, hyphens preserved). Replaces the
former, now-removed `buildAgentNameMap()`.

### `PersonaIndexEntry`

```ts
export interface PersonaIndexEntry {
  suite: string;
  yamlPath: string;
  slug: string;
  name: string;
  version: string;
  targets: string[];
  declaredTargets?: unknown;
  toolParityExceptions: string[];
}
```

One persona's entry in the cross-suite index. `declaredTargets` stores the raw YAML `targets`
value verbatim (`undefined` when the field is absent) so a consumer can distinguish "declared
nothing" from "declared something invalid" without re-parsing the YAML.

### `PersonaIndex`

```ts
export interface PersonaIndex {
  entries: PersonaIndexEntry[];
  bySlug: Map<string, PersonaIndexEntry>;
  issues: ValidationResult[];
}
```

The result of scanning every configured suite's persona YAML files once. `bySlug` resolves
cross-suite slug collisions the same way the historical agent map did — the later entry in
suite-then-filename scan order wins. `issues` collects error-severity results from resolving each
persona's `targets` field, plus a warning-severity result for each `tool_parity_exceptions` entry
that names a capability unrecognised by every registered target's `toolCapabilities` map (and
isn't an `mcp:`-prefixed form) — see `validateToolParity(personaLabel, perTarget, exceptions)`
above. `build()` copies this list verbatim into `BuildSummary.issues`, and also folds it into
`BuildSummary.strictFailures` unconditionally — an index issue (e.g. an unknown `targets` name) now
fails the build the same way an error-severity `BuildResult.validationResults` entry does, with or
without `strict: true` (see **Build success semantics** under `BuildSummary` below). Parity findings
themselves are a separate mechanism: they land directly on the affected `BuildResult.validationResults`
and participate in `strict` mode through that path instead — see `validateToolParity` above.

### `TargetResolution`

```ts
export interface TargetResolution {
  targets: string[];
  issues: ValidationResult[];
}
```

The outcome of resolving a persona's declared `targets` field against a target registry: the
resolved, deduplicated target list plus any validation issues encountered.

---

## Derived Context Fields

Fields computed by `buildContext()` at build time (merge step 3). Most are only set when not already present — YAML overrides always win. **Exception: `version` is unconditionally overwritten** — see note below.

### Standard Derived Fields (always injected)

| Field | Derived from | Format |
|-------|-------------|--------|
| `version` | `changelog` (via `resolveChangelogMeta`) → `default_version` → `'0.0.0'` | String |
| `last_updated` | `changelog` date (via `resolveChangelogMeta`) → `''` | String |
| `tools_list` | `tools` array | `'tool1', 'tool2'` |
| `tools_json` | `tools` array | `['tool1', 'tool2']` |
| `cc_tools_list` | `cc_tools` → fallback to `tools` | `'tool1', 'tool2'` |
| `cc_tools_json` | `cc_tools` → fallback to `tools` | `['tool1', 'tool2']` |
| `tools_block` | `tools` array | YAML block sequence |
| `cc_tools_block` | `cc_tools` → fallback to `tools` | YAML block sequence |
| `cc_file_name_stem` | `cc_file_name` with `.md` stripped | String |

> **`version` derivation notes:** `version` is unconditionally overwritten by `buildContext()` — any `version:` in per-persona YAML is silently ignored. Derivation chain: `changelog` field (via `resolveChangelogMeta()`) → `default_version` → `'0.0.0'`. The `last_updated` row is conditional — only injected when absent from all YAML sources.

### Deep Agents Derived Fields (gated on `da_file_name` presence)

These three fields mirror the `cc_*` pattern but apply to the `deep-agents` target. They are **only injected when `da_file_name` is present** in the merged context — personas without `da_file_name` produce no `da_*` fields and no error.

| Field | Derived from | Format |
|-------|-------------|--------|
| `da_file_name_stem` | `da_file_name` with `.md` stripped | String |
| `da_tools_list` | `da_tools` → fallback to `tools` | `'tool1', 'tool2'` |
| `da_tools_json` | `da_tools` → fallback to `tools` | `['tool1', 'tool2']` |
| `da_tools_block` | `da_tools` → fallback to `tools` | YAML block sequence |

**`da_*` gate asymmetry vs `cc_*`:** The `cc_*` tools fields are emitted unconditionally for all personas, but the `da_*` fields are gated on `da_file_name` being set. This means personas that do not produce a Deep Agents output file will never have `da_*` in their context, rather than receiving empty values.

---
## Engine Functions

All engine functions are **pure** — zero imports, no side effects, no file I/O.

### `resolvePartials(text, partialsMap, depth?)`

```ts
export function resolvePartials(
  text: string,
  partialsMap: Record<string, string>,
  depth?: number,
): string;
```

Replaces `{{> name}}` markers with content from `partialsMap`. Recursion capped at depth 2. Missing partials emit `console.warn` and are preserved as-is.

### `collectPartialReferences(text, partialsMap)`

```ts
export function collectPartialReferences(
  text: string,
  partialsMap: Record<string, string>,
): Set<string>;
```

Collects the names of every partial a template transitively references, without resolving or
rendering anything. Mirrors `resolvePartials()` exactly — same `{{> name}}` regex, same depth-2
recursion cap — so a caller (e.g. a validator's `partial` trigger) can ask "would the renderer
expand this partial?" and get the same answer the renderer itself would give, including one level
of nested partial-within-partial references. A referenced name is recorded whether or not it
exists in `partialsMap` — this reports what the template *asks for*, not what successfully
resolves — but an unknown name is not recursed into further (there is nothing to recurse into).
Zero imports, no console output (unlike `resolvePartials()`, which warns on an unresolved name).

### `resolveConditionals(text, context)`

```ts
export function resolveConditionals(
  text: string,
  context: Record<string, unknown>,
): string;
```

Evaluates `{{#if flag}}…{{/if}}`, `{{#if flag}}…{{else}}…{{/if}}`, and `{{#if flag}}…{{else if flag2}}…{{else}}…{{/if}}` (chain) blocks.

Implemented as a single-pass tokenizer plus a bracket-matching block resolver (`computeMatchClose()` builds a stack-matched tag list up front, then a single recursive `renderRange()` walk renders it): `{{else if}}` is resolved natively, with no pre-processing rewrite step.

Nested `{{#if}}` blocks inside `{{else}}` branches are supported — resolved in one pass over the bracket-matched tree, correct at any nesting depth. `{{else if}}` chains may be freely mixed with traditional nested syntax. Unknown flags treated as falsy.

**Whitespace handling:** a conditional tag written standalone on its own line (only whitespace surrounding it) has its entire line, including the trailing newline, removed; an inline tag removes only the tag text, leaving the rest of the line intact. A block that resolves to nothing between two lines of content has its surrounding blank-line run merged down to a single paragraph break; blank lines that are part of a kept branch are emitted as written. **Adjacent removals merge as one:** two or more blocks that resolve to nothing, separated only by whitespace-only lines (including no gap at all), merge their combined surrounding blank-line runs into a single paragraph break rather than merging pairwise and leaving the leftover runs to add up — a kept block between two emits-nothing blocks still breaks the merge. Malformed or unterminated tags (stray `{{/if}}`, unclosed `{{#if}}`, an `{{else}}`/`{{else if}}` outside any block, a second `{{else}}` in one block, or a non-`\w+` flag name) pass through the output literally.

`resolveConditionals()` resolves conditional tags only — it does not recognise comment delimiters (`{{!-- … --}}` / `{{! … }}`), so any comment in the input passes through it as literal text. A direct caller that wants both resolved must call `stripComments()` first.

**Line endings:** `text` is normalised to LF line endings as the first step, before tokenizing, regardless of whether the input used LF, CRLF, or a lone CR. The return value is always LF-only.

### `stripComments(text)`

```ts
export function stripComments(text: string): string;
```

Removes template comments — `{{!-- … --}}` (may span lines, may contain a literal `}}`) and `{{! … }}` (may span lines, cannot contain a literal `}}`) — using the same tokenizer as `resolveConditionals()` and the identical standalone/inline/blank-run-merge whitespace contract described above, including the adjacent-removal merge: two or more standalone comments separated only by whitespace-only lines merge their surrounding blank-line runs into one. Any tag or template syntax written inside a comment (a partial, conditional, or variable reference) is removed along with it and never separately recognised — this is what makes a commented-out reference fully inert. An unterminated `{{!--` or `{{!` passes through as literal text, exactly like a malformed conditional tag.

This is the only place comments are removed: `resolveConditionals()` does not recognise comment delimiters. The builder calls `stripComments()` at every point a template reaches it — the loaded body template, the final per-persona partials map, and the frontmatter template — before partials, conditionals, or variables are resolved (see **Processing order** in `constraints.md`).

**Line endings:** like `resolveConditionals()`, `text` is normalised to LF line endings as the first step, before tokenizing. The return value is always LF-only.

### `resolveVariables(text, context, filename)`

```ts
export function resolveVariables(
  text: string,
  context: Record<string, unknown>,
  filename: string,
): string;
```

Substitutes `{{varName}}` tokens with `String(context[varName])`. Unresolved variables emit `console.warn` and are preserved.

### `collapseBlankLines(text)`

```ts
export function collapseBlankLines(text: string): string;
```

Collapses 3+ consecutive blank lines into 2.

### `ensureBlankLineBeforeHeadings(text)`

```ts
export function ensureBlankLineBeforeHeadings(text: string): string;
```

Inserts a blank line before Markdown headings and horizontal rules when missing.

### `normalizeNewlines(text)`

```ts
export function normalizeNewlines(text: string): string;
```

Converts CRLF/CR to LF.

### `serializeTools(tools)`

```ts
export function serializeTools(tools: string[]): string;
```

Returns YAML flow-sequence with outer brackets: `['tool1', 'tool2']`.

### `serializeToolsList(tools)`

```ts
export function serializeToolsList(tools: string[]): string;
```

Returns comma-separated quoted tool names without brackets: `'tool1', 'tool2'`.

### `serializeToolsBlock(tools)`

```ts
export function serializeToolsBlock(tools: string[]): string;
```

Returns YAML block sequence with leading newline for non-empty arrays (`\n  - tool1\n  - tool2`), or ` []` for empty — intended for use as `tools:{{tools_block}}` in frontmatter templates.

---

## Loader Functions

All loaders perform async file I/O via `node:fs/promises`.

### `loadPartials(dir)`

```ts
export async function loadPartials(dir: string): Promise<Record<string, string>>;
```

Reads all `.md` files in `dir` and returns a map from filename stem to content string.

### `discoverPersonaYamls(root)`

```ts
export async function discoverPersonaYamls(root: string): Promise<string[]>;
```

Recursively discovers all `*.yaml` files under `root`. Returns sorted absolute paths. Uses `readdir({ recursive: true })` (Node ≥ 18.17).

### `loadMetadata(yamlPath)`

```ts
export async function loadMetadata(yamlPath: string): Promise<PersonaMetadata>;
```

Parses a YAML file into a typed `PersonaMetadata` object. Throws if the file is not a valid object or is missing the required `name` field.

### `loadContent(mdPath)`

```ts
export async function loadContent(mdPath: string): Promise<string>;
```

Reads a Markdown content template as a raw UTF-8 string. No parsing or template resolution.

---

## Utility Functions

### `ChangelogMeta` (interface)

```ts
export interface ChangelogMeta {
  version: string; // Semver string, e.g. '1.5.0'
  date: string;    // ISO date 'YYYY-MM-DD', or '' when absent
}
```

Version and date metadata extracted from a changelog entry. `date` is an empty string when the entry has no date component.

---

### `resolveChangelogMeta(input)`

```ts
export function resolveChangelogMeta(input: unknown): ChangelogMeta | undefined;
```

Extracts `version` and `date` from the first matching line of a changelog block scalar. Accepts `unknown` input so callers can pass raw YAML values without casting. Returns `undefined` when the input is not a non-empty string or contains no recognisable semver entry line.

Lines are inspected in order; the first line that contains a recognisable `X.Y.Z (YYYY-MM-DD):` or `X.Y.Z:` entry wins. Pure function — zero imports, no I/O, no side effects.

**Supported entry formats:**
- `X.Y.Z (YYYY-MM-DD): description` → `{ version: 'X.Y.Z', date: 'YYYY-MM-DD' }`
- `X.Y.Z: description` → `{ version: 'X.Y.Z', date: '' }`

**Returns `undefined` for:** `undefined`, `null`, `''`, non-string values, strings with no recognisable version line.

```ts
resolveChangelogMeta('1.5.0 (2026-06-13): Added feature')
// => { version: '1.5.0', date: '2026-06-13' }

resolveChangelogMeta('1.5.0: Added feature')
// => { version: '1.5.0', date: '' }

resolveChangelogMeta(undefined)
// => undefined
```

Exported from the `@mistralys/persona-builder` package via the `src/utils/index.ts` barrel and the root `src/index.ts` barrel.

---

### `escapeRegExp(str)`

```ts
export function escapeRegExp(str: string): string;
```

Escapes all regex special characters in `str` for safe use inside a `new RegExp(...)` constructor. Pure function — no I/O, no side effects.

---

## Validator Functions

Both validators are pure functions — no I/O, no side effects.

### `validateFileName(filePath)`

```ts
export function validateFileName(filePath: string): ValidationResult[];
```

Validates a filename against kebab-case naming convention. Returns one `ValidationResult` (severity `'error'`) per violated rule. Rules: no uppercase, no spaces, kebab-case segments only.

### `validateStrictMarkers(renderedContent, requiredMarkers)`

```ts
export function validateStrictMarkers(
  renderedContent: string,
  requiredMarkers: string[],
): ValidationResult[];
```

Checks that every marker in `requiredMarkers` appears verbatim in `renderedContent`. Returns one error per missing marker.

### `validateSubagentRefs(persona, agentMap, index?, target?)`

```ts
export function validateSubagentRefs(
  persona: PersonaMetadata,
  agentMap: Record<string, string>,
  index?: PersonaIndex,
  target?: string,
): ValidationResult[];
```

Lives in `src/validators/subagent-validator.ts` and is exported from the validators layer (`src/validators/index.ts`) — it was previously an unexported helper inside `persona-builder.ts`; the relocation fixes the manifest/code drift the earlier revision of this document flagged. Runs two independent checks per declared slug, both severity `'error'`:

1. **Unknown slug** — a declared slug has no corresponding `agent_slug_*` key in `agentMap`. Early-exits this check (but not the target-aware check below) when `agentMap` has zero entries — an empty map is treated as "no cross-suite agent data was computed for this call", not "zero personas exist anywhere", so a direct call that doesn't supply an agent map gets no unknown-slug noise it never asked for.
2. **Target-aware** — runs only when both `index` and `target` are supplied. A declared slug that resolves to an entry in `index.bySlug` whose `targets` exclude `target` is flagged as "not built for target", since a dispatching persona built for one target should not name a sub-agent that was never written for that target. A slug absent from the index is left entirely to the unknown-slug check; this also keeps a suite-only index (as built by a direct `buildSuite()` call) from raising false target-aware errors for cross-suite slugs it never scanned.

Both checks are independent — the same slug can fail both if `agentMap` and `index` were built from different scans. `persona.subagents` absent or empty short-circuits to `[]` before either check runs. Called internally by `buildPersona()` and collects its results alongside `onValidate` hook results.

**Key derivation:** Slugs are looked up via `agent_slug_${slug.replace(/-/g, '_')}` — matching the key naming convention established by `agentNameMapFromIndex()`. Unknown slugs indicate a configuration mismatch between the persona's `subagents` declaration and the actual agent map built from the configured suites.

### `validateToolRequirements(options)`

```ts
export interface ToolRequirement {
  id: string;
  when: { field: string } | { partial: string };
  targets?: string[];
}

export const SUBAGENT_DISPATCH_REQUIREMENT: ToolRequirement;

export interface ValidateToolRequirementsOptions {
  personaName: string;
  target: string;
  effectiveTools: string[] | undefined;
  triggered: ToolRequirement[];
  definition: TargetDefinition;
  registry: TargetRegistry;
}

export function validateToolRequirements(
  options: ValidateToolRequirementsOptions,
): ValidationResult[];
```

Pure, side-effect-free validator (owned by `src/validators/tool-requirements-validator.ts`) driven entirely by the current target's `TargetDefinition.toolCapabilities` — no target-name branches. Runs two checks:

1. **Dispatch grant.** For each `ToolRequirement` in `triggered` whose `targets` (if set) include the current `target`, an error is emitted when `effectiveTools` grants none of the target's `dispatch` capability tools. A target without a capability map, or without a `dispatch` entry, is skipped entirely — nothing to validate the grant against.
2. **Foreign notation.** Any tool in `effectiveTools` that is not recognised by the current target's own capability map or `mcpToolPattern`, but *is* recognised by some other registered target's notation (via `recognizedBy()`, `src/targets/tools.ts`), produces a warning naming the recognising target and — when resolvable — the current target's equivalent tool names.

`effectiveTools === undefined` short-circuits both checks and returns `[]` — an absent effective tool list means the platform's default grant is assumed to apply, so there is nothing meaningful to compare against.

`SUBAGENT_DISPATCH_REQUIREMENT` (`{ id: 'subagent-dispatch', when: { field: 'subagents' } }`) is the built-in requirement covering the historical case: a persona that declares `subagents` must grant `dispatch` on every target it builds for. Consumers add further requirements via `BuildConfig.toolRequirements?: ToolRequirement[]` (`src/builders/types.ts`).

**Wired into the build pipeline:** `buildPersona()` step 10 computes the applied-requirements list (the built-in `SUBAGENT_DISPATCH_REQUIREMENT` first, then `config.toolRequirements`, deduplicated by `id` with config entries replacing a same-`id` built-in), determines which are triggered (`when.field` checked against the post-`onBuildContext` render context; `when.partial` checked via `collectPartialReferences(bodyTemplate, personaPartialsMap)`), resolves `effectiveTools` via `resolveTargetTools()`, and calls this validator with all of it — but only when the target being built has a registered `TargetDefinition`; a target absent from the registry skips the check entirely (see `BuildResult.effectiveTools` below). Declaring `BuildConfig.toolRequirements` now directly affects `BuildResult.validationResults`.

### `validateToolParity(personaLabel, perTarget, exceptions)`

```ts
export interface TargetCapabilitySet {
  target: string;
  capabilities: Map<string, string>;
  toolCapabilities: Record<string, string[]>;
}

export interface ToolParityFinding {
  target: string;
  result: ValidationResult;
}

export function validateToolParity(
  personaLabel: string,
  perTarget: TargetCapabilitySet[],
  exceptions: string[],
): ToolParityFinding[];
```

Pure, side-effect-free validator (owned by `src/validators/tool-parity-validator.ts`, exported from `src/validators/index.ts`) comparing a persona's granted capabilities across every target it was built for. `perTarget.length < 2` short-circuits to `[]` — a single mapped target has nothing to compare against. For each capability granted on at least one `perTarget` entry but missing on another, and not present in `exceptions`, emits one **error**-severity `ToolParityFinding` per lacking target, naming every granting target and its granting tool plus the lacking target's own equivalent tool names (from its `toolCapabilities` map — named even when none of those tools are currently granted). Capabilities never granted anywhere among the participating targets, or granted on all of them, produce no finding.

**Wired into the build pipeline as a post-pass:** `build()` cannot run this inside `buildPersona()` — a single-target build never sees another target's effective tool list. After all suites × targets have built, `build()` groups `BuildResult`s by `personaYamlPath`, filters to results whose target has a registered `TargetDefinition` (a capability map to resolve against) and a defined `effectiveTools`, computes each surviving result's granted capabilities via `resolveCapabilities()`, and calls `validateToolParity()` with the persona's resolved `tool_parity_exceptions` (from the pre-scan `PersonaIndex`). Each returned finding is appended to its `target`'s own `BuildResult.validationResults` — before `strictFailures` is computed, so parity errors participate in `strict: true`. A persona excluded from a target via its resolved `targets` field was never built for that target, so it has no `BuildResult` there and is not compared against it; a `deep-agents` result (no capability map) never participates on either side of a comparison.

**Unknown exception names:** `scanPersonas()` flags any `tool_parity_exceptions` entry that is neither a capability name recognised by some registered target's `toolCapabilities` map nor an `mcp:`-prefixed form as a warning-severity issue in `PersonaIndex.issues` (see `PersonaMetadata` below) — a typo'd exception name silently stops exempting anything, so it is surfaced rather than swallowed.

---

## Frontmatter Quick Reference

This section consolidates the frontmatter essentials that are otherwise spread across `data-flows.md`, `metadata-reference.md`, and `target-differences.md`. For the full story on any item, follow the cross-references.

### Default Frontmatter Templates

The library ships three built-in frontmatter templates. Consumers can override them via `BuildConfig.frontmatter` (config-level) or `PersonaBuildPlugin.frontmatterTemplates` (plugin-level). See **Frontmatter Template Precedence** in `data-flows.md` §3.

**VS Code** (`DEFAULT_FRONTMATTER_VSCODE`):

```yaml
---
name: '{{name}} v{{version}}'
description: '{{description}}'
tools: [{{tools_list}}]
---
```

**Claude Code** (`DEFAULT_FRONTMATTER_CLAUDE_CODE`):

```yaml
---
name: {{cc_file_name_stem}}
description: {{description}}
model: {{cc_model}}
memory: {{cc_memory}}
tools:{{cc_tools_block}}
---
```

**Deep Agents** (`DEFAULT_FRONTMATTER_DEEP_AGENTS`):

```yaml
---
name: {{name}}
description: {{description}}
---
```

### Metadata → Frontmatter Field Map

Which YAML fields feed which frontmatter fields in the default templates:

| Frontmatter field | Target | YAML source → derivation |
|-------------------|--------|--------------------------|
| `name` | VS Code | `name` + `version` (auto-derived from `changelog`) |
| `name` | Claude Code | `cc_file_name` → `cc_file_name_stem` (`.md` stripped) |
| `name` | Deep Agents | `name` (plain) |
| `description` | all | `description` (pass-through) |
| `tools` | VS Code | `tools[]` → `tools_list` (comma-separated, quoted) |
| `tools` | Claude Code | `cc_tools[]` → `cc_tools_block` (YAML block seq); falls back to `tools[]` |
| `model` | Claude Code | `cc_model` — **not auto-derived**; must be in YAML or `_shared.yaml` |
| `memory` | Claude Code | `cc_memory` — **not auto-derived**; must be in YAML or `_shared.yaml` |

### Common Pitfalls

- **`version` is always overwritten.** Never set `version:` manually in per-persona YAML — use the `changelog` block scalar instead. See `metadata-reference.md` Tier 5.
- **`cc_model` and `cc_memory` are not auto-derived.** They must be supplied explicitly (typically via `_shared.yaml`). Missing values produce `[WARN]` unless `strict: true` is set.
- **No frontmatter schema validation.** The library warns about unresolved `{{variables}}` but does not validate that rendered frontmatter is valid YAML or that required fields for a target platform are present.
- **Deep Agents template is minimal.** Only `name` and `description`. Any additional fields (tools, model, etc.) require a custom template via config or plugin.
- **Custom target fallback.** Targets not named `'vscode'`, `'claude-code'`, or `'deep-agents'` receive the Claude Code default template unless overridden.

### What Each Platform Consumes

| Field | VS Code reads? | Claude Code reads? | Deep Agents reads? |
|-------|---------------|-------------------|-------------------|
| `name` | Yes — display name in agent picker | Yes — `@agent-<name>` routing | Yes — agent identifier |
| `description` | Yes — placeholder text in chat input | Yes — trigger text for auto-delegation | Yes — agent description |
| `tools` | Yes — controls tool permissions | Yes — tool allowlist (omit to inherit) | No |
| `disallowedTools` | No | Yes — tool denylist | No |
| `model` | Yes — single model or prioritized array | Yes — selects the LLM | No |
| `effort` | No | Yes — reasoning effort override | No |
| `maxTurns` | No | Yes — caps agentic turns | No |
| `memory` | No | Yes — `project` / `user` / `local` / `false` | No |
| `permissionMode` | No | Yes — edit approval mode | No |
| `mcpServers` | No | Yes — scoped MCP servers | No |
| `agents` | Yes — subagent access control | No (uses `Agent()` in `tools`) | No |
| `background` | No | Yes — run as background task | No |
| `isolation` | No | Yes — `worktree` for git worktree isolation | No |
| `skills` | No | Yes — preload skill content | No |
| `handoffs` | Yes — suggested next-step buttons | No | No |
| `hooks` | Preview (requires setting) | Yes — lifecycle hooks | No |
| `id` | Yes — `@id` subagent routing | No | No |

> **Note:** Fields like `role`, `author`, `version`, `last_updated`, and `vs_file_name` are metadata for human/agent orientation — they are not consumed by the host platforms' runtime.
>
> See [Target Differences](../../target-differences.md) for the complete field references: [VS Code Agent Fields](../../target-differences.md#complete-vs-code-agent-field-reference), [Claude Code Agent Fields](../../target-differences.md#complete-claude-code-field-reference), and [Skill Frontmatter (Cross-Platform)](../../target-differences.md#skill-frontmatter-cross-platform).

---

## Frontmatter Functions

### `resolveFrontmatterTemplate(target, plugins, configTemplates?)`

```ts
export function resolveFrontmatterTemplate(
  target: string,
  plugins: PersonaBuildPlugin[],
  configTemplates?: Record<string, string>,
): string;
```

Resolves the frontmatter template for a target. Precedence: plugin `frontmatterTemplates` (first plugin wins) → config-level templates → library defaults. For custom target names (neither `'vscode'` nor `'claude-code'`), the library-default fallback returns the Claude Code template unless overridden via a plugin or `configTemplates`.

### `renderFrontmatter(template, context, filename)`

```ts
export function renderFrontmatter(
  template: string,
  context: Record<string, unknown>,
  filename: string,
): string;
```

Renders a frontmatter template string by applying, in order, `stripComments()`, `resolveConditionals()`, then `resolveVariables()`. No partials step — frontmatter templates have none.

### `DEFAULT_FRONTMATTER_VSCODE`

```ts
export const DEFAULT_FRONTMATTER_VSCODE: string;
```

Built-in VS Code frontmatter template (`name`, `description`, `tools`). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` for API continuity.

### `DEFAULT_FRONTMATTER_CLAUDE_CODE`

```ts
export const DEFAULT_FRONTMATTER_CLAUDE_CODE: string;
```

Built-in Claude Code frontmatter template (`name`, `description`, `model`, `memory`, `tools` as block sequence). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` for API continuity.

### `DEFAULT_FRONTMATTER_DEEP_AGENTS`

```ts
export const DEFAULT_FRONTMATTER_DEEP_AGENTS: string;
```

Built-in Deep Agents frontmatter template (added by WP-001). Owned by `src/targets/types.ts`; re-exported from `src/builders/frontmatter.ts` and the package entry point.

---

## Target Registry

Provides extensible, named build targets. All symbols are exported from the package entry point.

### `TARGET_VSCODE`

```ts
export const TARGET_VSCODE: 'vscode';
```

Constant string `'vscode'` — the well-known name for the built-in VS Code target.

### `TARGET_CLAUDE_CODE`

```ts
export const TARGET_CLAUDE_CODE: 'claude-code';
```

Constant string `'claude-code'` — the well-known name for the built-in Claude Code target.

### `TARGET_DEEP_AGENTS`

```ts
export const TARGET_DEEP_AGENTS: 'deep-agents';
```

Constant string `'deep-agents'` — the well-known name for the built-in Deep Agents target.

### `defaultRegistry`

```ts
export const defaultRegistry: TargetRegistry;
```

Singleton `TargetRegistry` pre-populated with the three built-in targets (`'vscode'`, `'claude-code'`, `'deep-agents'`), in registration order. Import and call `register()` on this instance to add custom targets before invoking `build()`.

**Warning:** This is a module-level singleton. Calling `register()` on it in tests mutates shared state that persists across test cases. Use `defaultRegistry.clone()` to obtain an isolated copy.

### `TargetRegistry`

```ts
export class TargetRegistry {
  register(definition: TargetDefinition): void;
  get(name: string): TargetDefinition;
  has(name: string): boolean;
  names(): string[];
  allDefinitions(): TargetDefinition[];
  clone(): TargetRegistry;
}
```

Holds `TargetDefinition` entries keyed by name. Preserves insertion order — `names()` and `allDefinitions()` are deterministic.

- **`register(definition)`** — Registers a target. Throws if a target with the same `name` is already registered. Also throws if `definition.mcpToolPattern` is a `RegExp` carrying the `g` or `y` flag — a global/sticky pattern has mutable `lastIndex` state that would make `exec()`/`test()` results depend on call order once the same `RegExp` instance is shared across registry copies (see `clone()`).
- **`get(name)`** — Returns a copy of the `TargetDefinition` for `name`, **deep-copying `toolCapabilities`** (each capability's tool-name array is a fresh array). Throws (listing known names) if not registered. Mutating the returned object, including pushing into a `toolCapabilities` array, does not affect the registry.
- **`has(name)`** — Returns `true` if a target with the given name is registered.
- **`names()`** — Returns all registered target names in registration order.
- **`allDefinitions()`** — Returns copies of all `TargetDefinition` objects in registration order, with the same deep-copy of `toolCapabilities` as `get()`. Mutating a returned definition does not affect the registry.
- **`clone()`** — Returns a new `TargetRegistry` pre-populated with copies of the same definitions (same deep-copy guarantee for `toolCapabilities`). Useful for test isolation.

---

## Plugin Runner Functions

All runner functions are synchronous.

### `runPartials(plugins, partialsMap, suiteName, suite)`

```ts
export function runPartials(
  plugins: PersonaBuildPlugin[],
  partialsMap: Record<string, string>,
  suiteName: string,
  suite: SuiteConfig,
): Record<string, string>;
```

Suite-level accumulating hook — each plugin receives the partials map returned by the previous plugin. Called once per suite after partials are loaded from disk and after any `BuildConfig.partials` inline map has been applied, but before any persona is rendered. Returns the final accumulated partials map.

### `runPersonaPartials(plugins, partialsMap, persona, context, suite, target?)`

```ts
export function runPersonaPartials(
  plugins: PersonaBuildPlugin[],
  partialsMap: Record<string, string>,
  persona: PersonaMetadata,
  context: Record<string, unknown>,
  suite: SuiteConfig,
  target?: TargetType,
): Record<string, string>;
```

Per-persona accumulating hook — each plugin receives the partials map returned by the previous plugin. Called for each persona (and target) after `onBuildContext`, before template rendering. The `partialsMap` argument is already a shallow copy of the suite-level map (persona-scoped isolation). Returns the final accumulated partials map.

### `runSuiteInit(plugins, suite, sharedMeta)`

```ts
export function runSuiteInit(
  plugins: PersonaBuildPlugin[],
  suite: SuiteConfig,
  sharedMeta: Record<string, unknown>,
): void;
```

Invokes `onSuiteInit` on each plugin in order. `sharedMeta` is mutable (passed by reference).

### `runBuildContext(plugins, ctx, persona, suite, target?)`

```ts
export function runBuildContext(
  plugins: PersonaBuildPlugin[],
  ctx: Record<string, unknown>,
  persona: PersonaMetadata,
  suite: SuiteConfig,
  target?: TargetType,
): Record<string, unknown>;
```

Accumulating hook — each plugin receives the previous plugin's returned context. The optional `target` parameter is forwarded to each plugin's `onBuildContext` call. Returns the final context.

### `runPostRender(plugins, rendered, persona, target)`

```ts
export function runPostRender(
  plugins: PersonaBuildPlugin[],
  rendered: string,
  persona: PersonaMetadata,
  target: TargetType,
): string;
```

Accumulating hook — each plugin receives the previous plugin's returned output string.

### `runValidate(plugins, persona, suite)`

```ts
export function runValidate(
  plugins: PersonaBuildPlugin[],
  persona: PersonaMetadata,
  suite: SuiteConfig,
): ValidationResult[];
```

Collecting hook — concatenates all `ValidationResult[]` from all plugins into a flat array.

---

## Types

### `BuildConfig`

```ts
export interface BuildConfig {
  suites: Record<string, SuiteConfig>;
  sharedPartialsDir?: string;
  plugins?: PersonaBuildPlugin[];
  /** Defaults to both built-in targets when omitted. Accepts any registered target name. */
  targets?: string[];
  check?: boolean;
  strict?: boolean;
  /** Keyed by target name. Accepts any string key, including custom targets. */
  frontmatter?: Record<string, string>;
  /**
   * Optional map of global template variables (lowest-priority layer in the 7-layer merge chain).
   * Overridden by SuiteConfig.variables, _shared.yaml, per-persona YAML, derived fields,
   * the agent name map, and target flags. See Context Merge Order in data-flows.md.
   */
  variables?: Record<string, unknown>;
  /**
   * Optional map of inline partials (lowest-priority layer in the 5-layer partials merge chain).
   * Overridden by sharedPartialsDir, suite-local partials, onPartials hooks, and onPersonaPartials hooks.
   * See Partials Resolution in data-flows.md.
   */
  partials?: Record<string, string>;
  targetRegistry?: TargetRegistry;
  /**
   * Additional `ToolRequirement`s (beyond the built-in `SUBAGENT_DISPATCH_REQUIREMENT`)
   * that personas can trigger to declare their own dispatch requirements — e.g. a
   * handoff partial that implies the persona must dispatch sub-agents. See
   * `validateToolRequirements()` above. Wired into `buildPersona()` step 10: entries
   * here are merged with the built-in requirement (a same-`id` entry replaces it) and
   * checked on every build.
   */
  toolRequirements?: ToolRequirement[];
}
```

### `SuiteConfig`

```ts
export interface SuiteConfig {
  srcDir: string;
  /** @deprecated Use outputDirs['vscode']. */
  outVscode?: string;
  /** @deprecated Use outputDirs['claude-code']. */
  outClaudeCode?: string;
  /** Generic output directory map keyed by outputDirKey. Takes precedence over deprecated fields. */
  outputDirs?: Record<string, string>;
  personaMode?: string;
  partialsSubdir?: string;   // default: 'partials'
  metaSubdir?: string;       // default: 'meta'
  contentSubdir?: string;    // default: 'content'
  /**
   * Optional map of suite-level template variables (second-lowest layer in the 7-layer merge chain,
   * above BuildConfig.variables but below _shared.yaml). See Context Merge Order in data-flows.md.
   */
  variables?: Record<string, unknown>;
}
```

### `BuildResult`

```ts
export interface BuildResult {
  suite: string;
  /** Target name this result was generated for (e.g. `'vscode'`, `'claude-code'`, or a custom target). */
  target: string;
  personaYamlPath: string;
  outputPath: string;
  content: string;
  validationResults: ValidationResult[];
  written: boolean;
  effectiveTools?: string[];
}
```

**`effectiveTools`:** The persona's effective (post-`onBuildContext`) tool list for `target`, resolved via `resolveTargetTools()` — the same list `validateToolRequirements()` validated against in step 10. `undefined` when `target` has no registered `TargetDefinition` (no capability map to resolve against, so the tool-requirements check is skipped entirely for that result too). Consumed by `build()`'s capability-parity post-pass (`validateToolParity()`, see **`validateToolParity(personaLabel, perTarget, exceptions)`** above), which compares tool grants across a persona's built targets — a result with `effectiveTools === undefined` is excluded from that comparison on either side.

### `BuildSummary`

```ts
export interface BuildSummary {
  success: boolean;
  results: BuildResult[];
  strictFailures: ValidationResult[];
  totalBuilt: number;
  totalWritten: number;
  skipped: SkippedBuild[];
  issues: ValidationResult[];
  errors: number;
  warnings: number;
}
```

`skipped` holds one entry per persona × active-target combination whose resolved `targets` excluded that target — `buildPersona()` is never called for these (see `buildSuite()`'s per-persona target filtering above). `issues` is the same `ValidationResult[]` recorded on the pre-scan `PersonaIndex` (unknown target name, non-string entry, or empty array in a persona's `targets` field).

`strictFailures` collects every `ValidationResult` with severity `'error'` or `'warning'` found anywhere in the build — each result's `validationResults` plus `issues` — and is now populated unconditionally, not only in `strict` mode. `errors`/`warnings` are the error-severity and warning-severity counts within `strictFailures`. **Build success semantics:** `success = errors === 0 && (!config.strict || warnings === 0)` — an error-severity result fails every build by default, with or without `strict: true`; `strict` additionally requires zero warnings. The `strict: true` throw behaviour (throwing after all suites have built, with output files still written to disk) is unchanged and only fires in `strict` mode.

### `SkippedBuild`

```ts
export interface SkippedBuild {
  suite: string;
  target: string;
  personaYamlPath: string;
}
```

One persona × target combination that `buildSuite()` skipped because the persona's resolved `targets` excluded that target.

### `PersonaMetadata`

```ts
export interface PersonaMetadata {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  tools?: string[];
  subagents?: string[];
  targets?: string[];
  tool_parity_exceptions?: string[];
  [key: string]: unknown;
}
```

`targets` and `tool_parity_exceptions` are resolved by `resolvePersonaTargets()` / `scanPersonas()` — see **Persona Index and Target Resolution** below. `targets` is used by `buildSuite()`/`build()` to filter build output (an excluded persona is skipped and recorded in `BuildSummary.skipped`); `tool_parity_exceptions` is recorded per-persona in the `PersonaIndex` and consumed by `build()`'s capability-parity post-pass (see **`validateToolParity(personaLabel, perTarget, exceptions)`** above) — a capability named here is exempt from that persona's parity check on every target.

### `PersonaBuildPlugin`

```ts
export interface PersonaBuildPlugin {
  name: string;
  onSuiteInit?(suite: SuiteConfig, sharedMeta: Record<string, unknown>): void;
  /**
   * Suite-level accumulating hook. Called once per suite after partials are loaded.
   * Executes within the same registry context as the enclosing `buildSuite()` call —
   * if you passed a custom `TargetRegistry` to `buildSuite()`, your registered targets
   * are visible during this hook. See the **Two-registry limitation** note on `buildSuite()`.
   */
  onPartials?(
    partialsMap: Record<string, string>,
    suiteName: string,
    suite: SuiteConfig,
  ): Record<string, string>;
  onBuildContext?(
    context: Record<string, unknown>,
    persona: PersonaMetadata,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, unknown>;
  /**
   * Per-persona accumulating hook. Called after `onBuildContext`, before rendering.
   * Receives a shallow copy of the suite-level partialsMap (isolated per persona, so
   * changes made here do not leak to other personas).
   * Executes within the same registry context as the enclosing `buildPersona()` call —
   * if you passed a custom `TargetRegistry` to `buildPersona()`, your registered targets
   * are visible during this hook. See the **Two-registry limitation** note on `buildPersona()`.
   */
  onPersonaPartials?(
    partialsMap: Record<string, string>,
    persona: PersonaMetadata,
    context: Record<string, unknown>,
    suite: SuiteConfig,
    target?: TargetType,
  ): Record<string, string>;
  onPostRender?(output: string, persona: PersonaMetadata, target: TargetType): string;
  onValidate?(persona: PersonaMetadata, suite: SuiteConfig, target?: TargetType): ValidationResult[];
  frontmatterTemplates?: Partial<Record<TargetType, string>>;
}
```

### `TargetType`

```ts
export type TargetType = string;
```

Resolves to `string` to allow custom targets alongside the three built-in well-known values (`'vscode'`, `'claude-code'`, `'deep-agents'`). Use the exported constants `TARGET_VSCODE`, `TARGET_CLAUDE_CODE`, and `TARGET_DEEP_AGENTS` for type-safe references to the built-in targets.

### `TargetDefinition`

```ts
export interface TargetDefinition {
  name: string;
  outputDirKey: string;
  filenameContextKey?: string;
  defaultFrontmatter: string;
  contextFlags?: Record<string, unknown>;
  defaultEnabled?: boolean;
  toolsContextKey?: string;
  toolCapabilities?: Record<string, string[]>;
  mcpToolPattern?: RegExp;
}
```

Describes a build target. `name` is the unique target identifier (e.g. `'vscode'`). `outputDirKey` maps to the suite's output directory key. `filenameContextKey` names the build-context field holding a custom output filename for this target. `defaultFrontmatter` is the template used when no plugin or `BuildConfig` override is provided. `contextFlags` is a **declarative** map of context injections (e.g. `{ target_vscode: true }`) — consumed by the runtime via registry-driven lookup (`registry.get(target).contextFlags`). Each key-value pair is injected into the build context for the corresponding target, enabling conditional template rendering. When a target is not present in the registry, the engine falls back to injecting a single boolean via string replacement (`target_${name.replace(/-/g, '_')} = true`). `defaultEnabled` controls whether the target is included in the default build when no explicit `targets` array is configured — defaults to `true` when omitted; set to `false` for opt-in targets (e.g. `'deep-agents'`).

`toolsContextKey`, `toolCapabilities`, and `mcpToolPattern` (added for tool-capability resolution, see **Target Tool Capability Resolution** below) are all optional — a custom target registered without them still registers and builds; it simply grants no resolvable capabilities and is invisible to `recognizedBy()`/`resolveCapabilities()`.

> **Custom targets for non-persona content:** `TargetDefinition` is not limited to personas — any document type with its own frontmatter schema (e.g. skills) can be built by registering a custom target with the appropriate `defaultFrontmatter` template. See the [Building Skills](../../building-skills.md) guide for an end-to-end example.

---

## Target Tool Capability Resolution

Owned by `src/targets/tools.ts`. A shared resolver so rendering (`buildContext()`'s `cc_tools`/
`da_tools` fallback) and validation (dispatch-grant, capability-parity, and foreign-notation
checks — later steps) read the same capability → tool vocabulary instead of each maintaining its
own target-name branches or hand-copied tool list.

**Built-in capability coverage:** Only seven basic capabilities are mapped —
`execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo` — plus `mcp:<server>` via
`mcpToolPattern`. Tool names with no counterpart on another target (e.g. VS Code's `vscode`,
`browser`) are absent from every capability list and ignored by every check; this correspondence
is intentionally rough (deliberate scope decision, 2026-09-29).

| Target | `toolsContextKey` | `toolCapabilities` | `mcpToolPattern` |
|--------|-------------------|---------------------|-------------------|
| `vscode` | `tools` | `execute→execute`, `read→read`, `edit→edit`, `search→search`, `web→web`, `dispatch→agent`, `todo→todo` | `/^([\w-]+)\/.+$/` (`server/tool` notation) |
| `claude-code` | `cc_tools` | `execute→Bash`, `read→Read`, `edit→Edit,Write`, `search→Grep,Glob`, `web→WebFetch,WebSearch`, `dispatch→Task,Agent`, `todo→TodoWrite,TodoRead` | `/^mcp__([\w-]+?)(?:__.+)?$/` (`mcp__server[__tool]` notation) |
| `deep-agents` | `da_tools` | *(none)* | *(none)* |

### `pickToolList(record, key)`

```ts
export function pickToolList(record: Record<string, unknown>, key: string): string[] | undefined;
```

Picks a tool list out of a record by `key`, falling back to `record['tools']` when `record[key]`
is not an array. Returns `undefined` when neither is an array.

### `resolveTargetTools(context, definition)`

```ts
export function resolveTargetTools(
  context: Record<string, unknown>,
  definition: TargetDefinition,
): string[] | undefined;
```

Resolves the effective tool list for a target: reads `definition.toolsContextKey` (defaulting to
`'tools'` when the definition omits the field), applying `pickToolList()`'s own `tools` fallback.

### `resolveCapabilities(tools, definition)`

```ts
export function resolveCapabilities(
  tools: string[] | undefined,
  definition: TargetDefinition,
): Map<string, string>;
```

Resolves which capabilities a tool list grants on a target, per `definition.toolCapabilities` and
`definition.mcpToolPattern`. For each mapped capability, records the first tool — in the
persona's declared tool-list order — that grants it, so a validator message can name a concrete
tool the persona actually declared (not just the capability map's canonical name). Every
`mcpToolPattern` match yields a `mcp:<server>` capability entry (first match wins per server).
Returns an empty `Map` when `tools` is absent/empty or the target has neither a capability map nor
an MCP pattern.

### `recognizedBy(tool, registry, excludeTarget)`

```ts
export function recognizedBy(
  tool: string,
  registry: TargetRegistry,
  excludeTarget: string,
): string[];
```

Finds which other registered targets (excluding `excludeTarget`) recognise `tool` — either via a
`toolCapabilities` entry or an `mcpToolPattern` match. Used for the foreign-notation check: a tool
spelled in another target's notation (e.g. `read` appearing in a claude-code tool list) is
recognised by `vscode` but not by `claude-code`. Returns target names in registry order.

### `ValidationResult`

```ts
export interface ValidationResult {
  severity: 'error' | 'warning' | 'info';
  message: string;
}
```


