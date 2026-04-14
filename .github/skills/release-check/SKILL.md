---
name: release-check
description: 'Pre-release readiness check for the @mistralys/persona-builder package. Run all checks before executing `npm version`. Use when: preparing a release, verifying release readiness, checking if the project is ready to publish.'
---

# Release Check

Validates that the package is ready for release via `npm version {VERSION}`. Run all steps in order and report the result of each check before continuing to the next.

---

## Release Flow Context

Releases follow a two-step sequence:

1. **Pre-release (this skill):** All checks below must pass.
2. **Tag and publish:** `npm version {VERSION}` (auto-bumps `package.json`, creates a Git commit and tag), then `npm publish`.

> `npm version` creates the Git tag automatically. Therefore at release-check time, `package.json` still holds the **old** version while `CHANGELOG.md` already documents the **new** version. The version ahead check relies on this gap.

---

## Procedure

### 1. Changelog version ahead check

Extract the topmost version from `CHANGELOG.md` (the first line matching `## vX.Y.Z`). Read the `version` field from `package.json`. Parse both as semver and verify the changelog version is **strictly greater** than the package.json version.

**Pass:** Changelog version > package.json version.  
**Fail:** They are equal (changelog not updated yet) or package.json is ahead (version was bumped without a changelog entry).

---

### 2. Git tag gap check

```bash
git tag --sort=-v:refname | head -5
```

Confirm that the changelog top version does **not** already have a corresponding Git tag (e.g., if changelog says `v2.4.0`, there must be no `v2.4.0` tag). A matching tag means this version has already been released.

**Pass:** No Git tag exists for the changelog top version.  
**Fail:** Matching tag found — changelog entry is a re-release of an already-tagged version.

---

### 3. TypeScript type check

```bash
npm run typecheck
```

Must complete with no errors. Fix all type errors before proceeding.

---

### 4. Test suite

```bash
npm test
```

All Vitest tests must pass. Zero failures and zero unresolved errors are required. Skipped tests are acceptable.

---

### 5. Build

```bash
npm run build
```

tsup must produce the `dist/` output without errors. This confirms the package is publishable and catches any compilation issues not caught by `typecheck` alone (e.g., tsup-specific entry point resolution).

---

### 5a. Plugin artefacts freshness check

After the build completes, check whether any files under `plugins/` were modified:

```bash
git diff --name-only plugins/
git status --short plugins/
```

The `plugins/` directory contains committed build artefacts (publishable plugin outputs). If the build regenerated them, they are stale and must be committed before the release.

**Pass:** No modified or untracked files under `plugins/`.  
**Fail:** One or more files under `plugins/` differ from HEAD — commit them and restart the check from step 5.

---

### 6. Git working tree

```bash
git status --short
git diff --name-only
```

The working tree must be **clean** before running `npm version`. Commit or stash any uncommitted changes first.

---

## Pass Criteria

| Check | Expected result |
|-------|-----------------|
| Changelog version ahead | CHANGELOG.md version > `package.json` version (semver) |
| Git tag gap | No existing tag for the changelog top version |
| TypeScript type check | Exit 0, no errors |
| Test suite | All tests pass, exit 0 |
| Build | `dist/` produced without errors, exit 0 |
| Plugin artefacts freshness | No modified/untracked files under `plugins/` after build |
| Git working tree | No uncommitted changes |

All 7 checks must pass before proceeding.

---

## Tagging and Publishing

Once all checks pass:

```bash
npm version <version>   # e.g. npm version 2.4.0
npm publish
```

`npm version` automatically bumps `package.json`, creates a commit, and creates the Git tag. Push the commit and tag afterward:

```bash
git push && git push --tags
```
