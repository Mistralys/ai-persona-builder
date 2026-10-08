# Releasing

How to cut a release of `@mistralys/persona-builder`. The automated pre-release checklist lives in the [`release-check` skill](../.github/skills/release-check/SKILL.md); this guide explains the flow and the reasoning behind it.

## Quick reference

Replace `X.Y.Z` with the new version. **Never create the tag yourself** — `npm version` does it.

1. Add the changelog entry as the topmost `## vX.Y.Z - Title` heading. **Do not touch the `package.json` version.**
2. Commit the changelog and any other pending changes.
3. Run the pre-release checks (or the `release-check` skill): `npm run typecheck`, `npm test`, `npm run build`, then confirm `git status --short` is empty and no `X.Y.Z` / `vX.Y.Z` tag exists.
4. `npm login` if you are not logged in.
5. `npm version X.Y.Z` — bumps `package.json`, commits, and creates the tag **`vX.Y.Z`** (with the `v`).
6. `npm publish`
7. `git push && git push origin vX.Y.Z` — push the version commit and the tag.
8. Create the GitHub release **from the existing tag `vX.Y.Z`**.

## Overview

A release is two phases:

1. **Prepare** — document the new version in `CHANGELOG.md` and commit it, then run the pre-release checks.
2. **Publish** — `npm version` bumps `package.json` and creates the commit and Git tag, then `npm publish` uploads the package.

## The changelog-first rule

The changelog is written **before** the version is bumped. At pre-release time:

- `CHANGELOG.md` already has the new version as its topmost `## vX.Y.Z - Title` heading.
- `package.json` still holds the **previous** version.
- No Git tag exists for the new version yet.

This gap is what the pre-release checks rely on. If the versions are equal, the changelog was not updated; if `package.json` is ahead, a version was bumped without a changelog entry.

### Choosing the version

Follow semver:

| Change | Bump |
|--------|------|
| Breaking change to the public API, CLI, or build behaviour (e.g. checks that newly fail builds) | Major |
| New backwards-compatible feature | Minor |
| Bug fix only | Patch |

Breaking releases need a `### Breaking Changes` section in the changelog entry and, where users must act, a migration guide (see [Migrating to v3.0.0](migrating-to-v3.md)).

## Tag naming: always `vX.Y.Z`

`npm version X.Y.Z` adds the `v` prefix on its own and creates the tag `vX.Y.Z`. All existing tags in this repository follow that form.

The trap: tagging a version by hand *without* the `v` (`git tag X.Y.Z`) and then running `npm version`. The result is two tags for one release, or a GitHub release attached to a tag that does not match the one npm created. Version and tag then disagree.

- Do not run `git tag` for releases. Let `npm version` create the tag.
- When pushing or referring to the tag, always include the `v`.
- When creating the GitHub release, select the existing `vX.Y.Z` tag; do not let GitHub create a new tag with a different name.
- If a bare `X.Y.Z` tag was created by mistake, delete it before running `npm version` (`git tag -d X.Y.Z`, and `git push origin :refs/tags/X.Y.Z` if it was pushed).

## Pre-release checks

All of these must pass before publishing:

| Check | Command / source | Expected |
|-------|------------------|----------|
| Changelog ahead | Top `## vX.Y.Z` in `CHANGELOG.md` vs `version` in `package.json` | Changelog version is strictly greater |
| No existing tag | `git tag --sort=-v:refname \| head -5` | Neither `X.Y.Z` nor `vX.Y.Z` exists for the changelog version |
| Type check | `npm run typecheck` | No errors |
| Tests | `npm test` | All pass |
| Build | `npm run build` | `dist/` produced without errors |
| Clean working tree | `git status --short` | Empty |

Run the build before the working-tree check: it must not leave tracked files modified. (`dist/` is gitignored.)

AI agents can run the whole checklist through the `release-check` skill.

## Tagging and publishing

```bash
npm version <version>   # e.g. npm version 3.0.0
npm publish
git push && git push origin v<version>
```

Then create the GitHub release from the `v<version>` tag.

`npm version` updates `package.json`, creates a commit, and creates the `v<version>` Git tag. Push that one tag by name rather than `--tags`, so a stray local tag is not published with it. The `files` field in `package.json` limits the published package to `dist/` and `docs/`.

## If something goes wrong

- **Checks fail after the changelog commit:** fix the problem, commit, and re-run the checks from the start.
- **`npm version` aborts:** the working tree was not clean. Commit or stash, then retry.
- **Tag created for the wrong version:** delete it locally (`git tag -d vX.Y.Z`) before it is pushed, and re-run `npm version`. Do not rewrite tags that have been pushed or published.
