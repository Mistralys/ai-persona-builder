# Curation Log

Why this manifest looks the way it does, and when it was last verified.
Read freely — Standing Decisions explains the deliberate gaps and conventions.
Written by the Manifest Curator only; no other agent edits this file.

## Standing Decisions

| Date | Decision | Rationale |
|---|---|---|
| — | — | None settled with the user yet. |

## History

### 2026-10-19 · Update · Curator v1.6.2

**Scope:** Partial upgrade, addition only: new `curation-log.md`, its row in the `README.md` Manifest Sections table, and removal of the hand-maintained "Manifest last revised" line from `README.md`. No other document was reconciled; the staleness spot-check below was a sample, not a verification.
**Commit:** 4602155
**Changes:**
- Created this log. The manifest had none, so the trail says nothing about earlier maintenance.
- `README.md` index gained a Curation Log row; the "Manifest last revised: 2026-09-30" line was removed (the log supersedes hand-maintained dates).

**Notes:** The reverted-decision search and changed-code intersection were not run (partial pass by instruction, no floor commit); the next full pass should run both, reading history from the commit above. Working tree was clean when scanned. No `context.yaml` exists and CTX is not planned. The project tracks no generated files (`dist/` is git-ignored build output), so no `generated-artefacts.md` is warranted. Spot-check, observed but left untouched: every `src/` file name checked appears in `file-tree.md`; `constraints.md` (Node floor note) still matches `package.json` `engines.node` of `>=18.0.0`; the `VERSION` constant and tsup entry points match their documentation. Drift found: `README.md` index describes the Node floor as "≥ 18.17" while `package.json` declares `>=18.0.0` (`constraints.md` documents this gap, the index table does not); the index property table contains a stray blank line splitting it in two; `file-tree.md` coverage of `docs/` and `tests/` was not checked beyond file-name presence. The adjacent-document check was out of scope for this dispatch.
