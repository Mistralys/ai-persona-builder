# Migrating to v3.0.0

> **Audience:** Consumers of `@mistralys/persona-builder` upgrading from v2.x to the
> `v3.0.0 - Persona Targets & Tool Validation` release. Each section below covers one behavior
> change: **What changed**, **Who is affected**, and **What to do**. A final
> ["No action needed"](#no-action-needed) section lists everything in the release that is
> additive and safe to ignore during an upgrade.
>
> Every code example on this page was executed against the built library (`dist/index.cjs`)
> before this guide was committed — the shown output is real, not illustrative.

## 1. Error-severity results now fail every build

**What changed:** Before v3.0.0, a `ValidationResult` with `severity: 'error'` only failed the
build when `--strict` (or `BuildConfig.strict`) was set — outside strict mode it was reported but
`BuildSummary.success` stayed `true` and the CLI exited `0`. In v3.0.0, **any** error-severity
result fails the build and exits the CLI with `1`, with or without `--strict`. `--strict`
continues to *additionally* fail on warning-severity results — its meaning for warnings is
unchanged.

This includes the unknown-sub-agent-slug error (see §2 below), which was silently ignored outside
`strict` mode until now — a persona that references a non-existent sub-agent slug now fails every
build, not only strict ones.

**Who is affected:** Any consumer running `persona-build` (or calling `build()` /
`buildSuite()` / `buildPersona()` directly) **without** `--strict`, whose persona set currently
produces error-severity validation results that were previously silently tolerated.

**What to do:**
- Run a build once before upgrading CI pipelines and inspect `BuildSummary.errors` /
  `BuildSummary.strictFailures` (or the CLI's printed error list) for any pre-existing
  error-severity findings.
- Fix each one (most commonly: an unknown sub-agent slug, or one of the new checks in §2) — they
  were real problems before v3.0.0 too, just not build-breaking ones.
- If you relied on errors being non-fatal outside `--strict` as an interim state during
  development, there is no opt-out: pin to a `v2.x` release until the underlying persona issues
  are resolved.

## 2. New error-emitting (and warning-emitting) checks

**What changed:** Six new validation checks were added. Five emit `error`-severity results (and
therefore fail every build per §1); one emits a `warning` (and only fails the build under
`--strict`):

| Check | Severity | Emitted by |
|---|---|---|
| Unknown sub-agent slug | error | `validateSubagentRefs()` |
| Sub-agent slug exists but isn't built for the current target | error | `validateSubagentRefs()` |
| Missing `dispatch`-capability grant for a persona that requires dispatching | error | `validateToolRequirements()` |
| Capability-parity mismatch across a persona's built targets | error | `validateToolParity()` |
| Invalid `targets` entry (non-string, unregistered, or empty array) | error | `resolvePersonaTargets()` (via the `scanPersonas()` pre-scan) |
| Tool name spelled in another target's notation (foreign notation) | warning | `validateToolRequirements()` |

**Who is affected:** Any persona that:
- Declares `subagents: [...]` naming a slug that doesn't exist anywhere, or that exists but isn't
  built for the target currently being built.
- Declares `subagents`, or otherwise triggers a `BuildConfig.toolRequirements` dispatch rule,
  without granting a `dispatch`-capability tool on every target it's mapped to.
- Is built for two or more mapped targets but grants different capabilities
  (`execute`, `read`, `edit`, `search`, `web`, `dispatch`, `todo`, `mcp:<server>`) on each, and
  doesn't list the difference in `tool_parity_exceptions`.
- Declares a `targets: [...]` entry that isn't a registered target name, isn't a string, or is an
  empty array.
- Lists a tool spelled using another target's notation (e.g. a VS Code-style tool name on a
  Claude Code persona).

**What to do:**
- Unknown/not-built-for-target sub-agent slug: correct the slug, or add the target to the
  referenced sub-agent's `targets` list.
- Missing dispatch grant: add the target's dispatch-capability tool (e.g. `Task` on Claude Code)
  to the persona's `tools` for that target.
- Capability-parity mismatch: grant the missing capability on the lacking target, or — if the
  difference is intentional — add the capability name to the persona's `tool_parity_exceptions`.
- Invalid `targets` entry: use only registered target names as plain strings in a non-empty array,
  or omit `targets` entirely to build for every registered target.
- Foreign notation (warning only, non-fatal unless `--strict`): replace the tool name with the
  current target's own notation.

Verified example — an invalid `targets` entry:

```js
const { resolvePersonaTargets, defaultRegistry } = require('@mistralys/persona-builder');

resolvePersonaTargets(['vscode', 'not-a-real-target'], defaultRegistry, '/fixtures/example.yaml');
// =>
// {
//   targets: ['vscode'],
//   issues: [{
//     severity: 'error',
//     message: 'Persona "/fixtures/example.yaml" declares unknown target "not-a-real-target" in "targets".'
//   }]
// }
```

Verified example — an unknown sub-agent slug:

```js
const { validateSubagentRefs } = require('@mistralys/persona-builder');

validateSubagentRefs({ subagents: ['ghost-agent'] }, { agent_slug_real_agent: 'Real Agent' });
// => [{
//   severity: 'error',
//   message: "Persona 'undefined' declares subagent 'ghost-agent' but no persona with that slug exists in any configured suite."
// }]
```
(The persona's own `slug` field — omitted from this minimal example — is what fills in the
`'undefined'` placeholder above in a real build.)

## 3. `BuildSummary` required-field additions

**What changed:** `BuildSummary` gained four fields that are always populated (not optional):
`skipped`, `issues`, `errors`, and `warnings`. `BuildResult` gained one optional field,
`effectiveTools`. None of these were present on `BuildSummary` / `BuildResult` in v2.x.

**Who is affected:** Any consumer with a TypeScript type that mirrors, extends, narrows, or
destructures `BuildSummary` / `BuildResult` instead of importing them directly — including a
custom plugin, reporter, or CI script that pattern-matches on the summary shape.

**What to do:**
- Prefer importing `BuildSummary` / `BuildResult` from `@mistralys/persona-builder` instead of
  re-declaring a local shape, so future field additions stay source-compatible.
- If you must keep a local type, add the four new `BuildSummary` fields
  (`skipped: SkippedBuild[]`, `issues: ValidationResult[]`, `errors: number`,
  `warnings: number`) and the optional `BuildResult.effectiveTools?: string[]`.
- `strictFailures` (pre-existing) is now populated unconditionally rather than only in `strict`
  mode — if your code treated an empty `strictFailures` array as "not in strict mode", switch to
  checking `BuildSummary.success` instead.

## 4. Rendered-whitespace changes

**What changed:** Two whitespace behaviors around removed template content changed:

- An **inline** conditional tag (e.g. `` Use the {{#if a}}Task{{else}}task{{/if}} tool. ``) now
  removes only the tag itself, without inserting a line break — previously it could leave an
  unwanted break in the rendered line.
- **Merged adjacency fix:** `mergeMarkers()` now resolves a whole cluster of adjacent
  vanished `{{#if}}` blocks or standalone comments — separated only by whitespace-only lines, or
  by no gap at all — in a single replacement. Two or more emits-nothing blocks next to each other
  now collapse to exactly **one** paragraph break, the same guarantee a single vanished block
  already had. Before this fix, each removal was merged only against its immediate neighbour,
  so a cluster of three or more adjacent removed blocks could leave extra blank-line runs between
  them. A kept block's content still breaks the merge, as before.

**Who is affected:** Any persona whose Markdown content template has two or more adjacent
`{{#if}}…{{/if}}` blocks (or standalone comments, see §5) that can simultaneously evaluate to
"remove everything" for some variable combination. Rendered output for those combinations will
have fewer blank lines than it did in v2.x.

**What to do:**
- Re-render personas with multiple adjacent conditional blocks and diff the output. If your
  review process depended on the previous (over-generous) blank-line spacing, update any snapshot
  tests accordingly — the new output is the intended, corrected behavior per
  [`docs/template-syntax.md`](template-syntax.md).
- No config change is needed; this is a pure rendering fix.

Verified example — two adjacent vanished `{{#if}}` blocks collapse to one paragraph break:

```js
const { resolveConditionals } = require('@mistralys/persona-builder');

const tpl = 'Paragraph A.\n\n{{#if flagA}}Only if A{{/if}}\n{{#if flagB}}Only if B{{/if}}\n\nParagraph B.';
resolveConditionals(tpl, { flagA: false, flagB: false });
// => 'Paragraph A.\n\nParagraph B.'
```

## 5. `{{!…}}` comment syntax

**What changed:** Template comments (`{{!-- … --}}` and `{{! … }}`) are new in v3.0.0, applied by
`stripComments()` before partials, frontmatter, and tool-requirement scans run. A commented-out
`{{> partial}}` or `{{variable}}` neither expands nor warns, and shares the conditional tags'
standalone/inline whitespace contract (a standalone comment's own line is removed cleanly; an
inline comment leaves the rest of its line intact). `stripComments()` is wired into every template
a persona build renders: the loaded body template, the final per-persona partials map, and the
frontmatter template.

Before v3.0.0, a literal `{{! ... }}` or `{{!-- ... --}}` sequence in a content template was not
recognized as syntax at all and passed through to the rendered output unchanged (it is not valid
variable-marker syntax, so it wasn't substituted, but it also wasn't a recognized marker that
triggered an unresolved-variable warning).

**Who is affected:** Any persona content template, partial, or frontmatter template that
currently contains a literal `{{!` or `{{!--` sequence not intended as a comment (for example, if
it appears inside a fenced code block showing template syntax as an example, or inside
documentation prose embedded in a template). That text is now stripped from the rendered output
instead of passing through.

**What to do:**
- Search your persona content templates, partials, and frontmatter templates for `{{!` to find
  anything that will now be treated as a comment.
- If you want to show the literal comment-opening sequence in rendered output (e.g. in a template
  syntax example), escape it the same way you'd escape a variable marker, or restructure the text
  so `{{!` isn't contiguous (e.g. insert a space: `{{ !`).
- Otherwise, no action is needed — this is purely additive for templates that don't already
  contain `{{!` sequences.

Verified example:

```js
const { stripComments } = require('@mistralys/persona-builder');

stripComments('Line one.\n{{! this whole line is a comment }}\nLine two.');
// => 'Line one.\nLine two.'

stripComments('Use the {{tool}} tool. {{!-- TODO: revisit --}}');
// => 'Use the {{tool}} tool. '
```

## No action needed

The following v3.0.0 changes are purely additive and require no changes from existing
consumers:

- **`targets: [...]` persona field** — personas that don't declare it continue to build for
  every registered target, exactly as before.
- **`tool_parity_exceptions` persona field** — personas that don't declare it are checked for
  parity across all capabilities, which was already the only behavior available in v2.x (there
  was no parity check at all, so nothing fails that previously passed, aside from the new check
  itself — see §2 if a parity mismatch is newly flagged).
- **`scanPersonas()` / `PersonaIndex`** — an internal cross-suite pre-scan; no public API a
  consumer previously called is removed or changed shape.
- **`TargetDefinition.toolsContextKey`, `toolCapabilities`, `mcpToolPattern`** — new optional
  fields on a type consumers only read from (via `defaultRegistry`), or supply when registering a
  fully custom target. Built-in targets (`vscode`, `claude-code`, `deep-agents`) already populate
  them.
- **`collectPartialReferences()`** — a new pure export; nothing existing changed shape.
- **`BuildResult.effectiveTools`** — optional and additive (see §3).
- **CLI output grouping** — errors and warnings are now printed grouped by suite/target/persona
  plus index-level issues and totals; this is a readability improvement to stderr/stdout text, not
  a machine-readable interface.

## Related documentation

- [Template Syntax](template-syntax.md) — full whitespace-merging and comment-syntax reference.
- [Target Differences](target-differences.md) — VS Code vs. Claude Code tool notation.
- [Configuration Reference](configuration.md) — `BuildConfig`, `SuiteConfig`, `BuildSummary`.
