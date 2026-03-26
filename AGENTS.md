# AI Agents Operating System — @mistralys/persona-builder

> **Purpose:** Authoritative entry point for AI agents entering the `@mistralys/persona-builder` codebase. Defines how agents discover, navigate, and interact with the library to ensure architectural integrity and token efficiency.

---

## 📚 Project Manifest — Start Here!

**Core Philosophy:** The Project Manifest is the canonical documentation of this codebase. If implementation code contradicts the manifest, the **code is likely wrong**.

**Manifest location:** [`docs/agents/project-manifest/`](docs/agents/project-manifest/README.md)

| Document | Contents |
|----------|----------|
| [README.md](docs/agents/project-manifest/README.md) | Project overview, version, and manifest index. |
| [tech-stack.md](docs/agents/project-manifest/tech-stack.md) | Runtime, frameworks, architectural patterns, build tooling, distribution format. |
| [file-tree.md](docs/agents/project-manifest/file-tree.md) | Annotated directory structure (22 source files, 14 test files, fixtures). |
| [api-surface.md](docs/agents/project-manifest/api-surface.md) | All exported types, functions, and constants — signatures only. |
| [data-flows.md](docs/agents/project-manifest/data-flows.md) | Build pipeline, context merge order, plugin hooks, CLI flow. |
| [constraints.md](docs/agents/project-manifest/constraints.md) | Architectural invariants, naming rules, known limitations. |

### Quick Start Workflow

Follow this sequence before making any changes:

1. **Read [README.md](docs/agents/project-manifest/README.md)** — Understand project purpose and scope.
2. **Read [tech-stack.md](docs/agents/project-manifest/tech-stack.md)** — Understand layered architecture, zero-dependency engine, plugin patterns.
3. **Read [constraints.md](docs/agents/project-manifest/constraints.md)** — **MANDATORY** before writing any code.
4. **Consult [file-tree.md](docs/agents/project-manifest/file-tree.md) + [api-surface.md](docs/agents/project-manifest/api-surface.md)** — Find files and public interfaces.
5. **Read source code** — Only when implementation details are needed.

---

## 📝 Manifest Maintenance Rules

When you change the codebase, update the corresponding manifest documents:

| Change Made | Documents to Update |
|-------------|---------------------|
| Add/modify engine function | `api-surface.md`, verify zero-dependency invariant in `constraints.md` |
| Add/modify loader function | `api-surface.md`, `file-tree.md` (if new file) |
| Add/modify builder function | `api-surface.md`, `data-flows.md` (if pipeline changes) |
| Add/modify plugin hook | `api-surface.md`, `data-flows.md` (hook execution order) |
| Add/modify validator | `api-surface.md`, `file-tree.md` (if new file) |
| Add/modify exported type | `api-surface.md` |
| Add/remove dependency | `tech-stack.md` |
| Add new file or directory | `file-tree.md` |
| Change build pipeline flow | `data-flows.md` |
| Change frontmatter defaults | `api-surface.md`, `data-flows.md` (precedence section) |
| Change naming convention | `constraints.md` |
| Add CLI flag | `api-surface.md` (CLI section in README.md too) |
| Change architectural pattern | `tech-stack.md`, `constraints.md` |
| Discover new limitation | `constraints.md` (Known Limitations section) |

---

## ⚡ Efficiency Rules — Search Smart, Read Less

**Token efficiency is critical. Follow this search hierarchy:**

| What You Need | Search Here FIRST | Then Here | Read Source LAST |
|---------------|-------------------|-----------|------------------|
| Find a file location | `file-tree.md` | `grep` / file search | Never needed |
| Understand a function/type | `api-surface.md` | Source code | Only for implementation logic |
| Trace data flow | `data-flows.md` | Source code | Only for edge cases |
| Check a rule or convention | `constraints.md` | Source comments | Only if ambiguous |
| Identify dependencies | `tech-stack.md` | `package.json` | Never needed |
| Understand patterns | `tech-stack.md` | Source code | Only for complex logic |

### Anti-Patterns

| ❌ Inefficient | ✅ Efficient |
|---------------|-------------|
| Grep the entire codebase for a type name | Search `api-surface.md` |
| Read 5 engine files to understand template rendering | Read `data-flows.md` §7 (Render body) |
| Read source to check if a function is pure | Check `constraints.md` §1 (Zero-Dependency Engine) |
| Read `package.json` for dependencies | Check `tech-stack.md` |
| Read all builder files to understand plugin order | Read `data-flows.md` §5 (Plugin Hook Execution) |

---

## 🚨 Failure Protocol & Decision Matrix

| Scenario | Action | Priority |
|----------|--------|----------|
| **Manifest vs. code conflict** | Trust manifest. Flag code for correction. | MUST |
| **Ambiguous requirement** | Use most restrictive interpretation. Document assumption. | MUST |
| **Missing manifest documentation** | Flag gap. Do not invent facts. Draft entry for review. | MUST |
| **Untested code path** | Proceed with caution. Add test recommendation. | SHOULD |
| **New engine function needs an import** | It does NOT belong in `src/engine/`. Move it to `src/loaders/` or `src/builders/`. | MUST |
| **Plugin hook needs async** | Do NOT add `async` to existing runner functions without a plan. Flag for discussion. | MUST |
| **Adding a new npm dependency** | Justify in writing. Update `tech-stack.md`. Never add to `src/engine/`. | MUST |
| **Output file naming mismatch** | Check `vs_file_name` / `cc_file_name` context fields first, then fall back to content basename. See `data-flows.md` §7. | SHOULD |
| **Template rendering produces wrong output** | Verify processing order: partials → conditionals → variables. This order is mandatory. | MUST |
| **CI validation writes partial files** | Always combine `strict: true` with `check: true` in validation mode. | MUST |
| **Path traversal concern** | Acceptable for build-time use with developer-controlled paths. Add a containment guard before any HTTP/CLI exposure. | SHOULD |
| **Breaking change proposed** | Document before implementing. Flag for review. Never implement silently. | MUST |

### Escalation Path

```
Issue Detected
    ↓
Can I resolve with manifest + constraints?
    ↓ YES → Proceed
    ↓ NO  →
Is it an architectural concern (engine purity, async runner, new dependency)?
    ↓ YES → Pause and request user input
    ↓ NO  →
Is it a breaking change to the public API?
    ↓ YES → Pause and request user input
    ↓ NO  →
Is it a missing manifest entry?
    ↓ YES → Draft entry + request review
    ↓ NO  →
Unclear → Pause and request user clarification
```

---

## 📊 Project Stats

| Property | Value |
|----------|-------|
| **Package** | `@mistralys/persona-builder` |
| **Version** | 1.0.0 |
| **Language** | TypeScript 5.8.2 (ES2022) |
| **Runtime** | Node.js ≥ 18.17 (ESM) |
| **Architecture** | Layered: builders → plugins → engine / loaders / validators |
| **Package Manager** | npm |
| **Build Tool** | tsup (dual CJS + ESM) |
| **Test Framework** | Vitest (227 tests across 14 files) |
| **Production Dependency** | `js-yaml` (sole) |
| **License** | MIT |

### npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Production build via tsup. |
| `npm run dev` | Watch-mode build. |
| `npm test` | Run all tests once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`). |

---

## 🛠️ Contributor Guide

### Repo Layout

The repo follows a layered architecture. Key directories:

| Path | Purpose |
|------|---------|
| `src/engine/` | Pure template rendering functions (zero external dependencies) |
| `src/loaders/` | File I/O — YAML metadata, Markdown content, partials |
| `src/builders/` | Build orchestration (`build()`, `buildSuite()`, `buildPersona()`) |
| `src/plugins/` | Plugin runner, types, and first-party plugins |
| `src/plugins/ledger/` | Ledger plugin — sub-path export `@mistralys/persona-builder/plugins/ledger` |
| `src/validators/` | Filename and strict-mode validators |
| `src/cli.ts` | `persona-build` CLI entry point |
| `tests/` | Vitest test suites mirroring the `src/` structure |
| `fixtures/` | Test fixtures (`sample-suite/`, `shared/`) |
| `dist/` | Build output — gitignored, generated by `npm run build` |
| `docs/` | User-facing documentation and the agent project manifest |

See [`docs/agents/project-manifest/file-tree.md`](docs/agents/project-manifest/file-tree.md) for the full annotated directory listing.

### Test Command

```bash
npm test
```

Runs all Vitest tests once (227 tests across 14 files). Use `npm run test:watch` during development.

### Build Command

```bash
npm run build
```

Produces dual CJS + ESM output via tsup into `dist/`. Three entry points are compiled: `index`, `cli`, and `plugins/ledger/index`.

### How to Add a New Plugin

1. **Create the plugin source** at `src/plugins/<your-plugin>/index.ts`.  
   Implement the `PersonaBuildPlugin` interface (see [`docs/plugins.md`](docs/plugins.md#personabuildplugin-interface)):

   ```ts
   import type { PersonaBuildPlugin } from '../../plugins/types.js';

   export function myPlugin(options?: MyPluginOptions): PersonaBuildPlugin {
     return {
       name: 'my-plugin',

       onBuildContext(context, persona, suite) {
         return { ...context, my_variable: 'value' };
       },
     };
   }
   ```

2. **Add an entry point to `tsup.config.ts`** so the plugin gets its own sub-path export:

   ```ts
   entry: [
     'src/index.ts',
     'src/cli.ts',
     'src/plugins/ledger/index.ts',
     'src/plugins/my-plugin/index.ts',   // ← add this
   ],
   ```

3. **Add the sub-path export to `package.json`**:

   ```json
   "exports": {
     "./plugins/my-plugin": {
       "import": "./dist/plugins/my-plugin/index.js",
       "require": "./dist/plugins/my-plugin/index.cjs",
       "types": "./dist/plugins/my-plugin/index.d.ts"
     }
   }
   ```

4. **Write tests** in `tests/plugins/<your-plugin>.test.ts`, following the pattern in `tests/plugins/plugin-runner.test.ts`.

5. **Document** the plugin in `docs/plugins.md` and update `README.md` if the plugin is first-party.

---

## 🧭 Navigation Quick Reference

| I Need To… | Go Here |
|------------|---------|
| Understand the project | [README.md](README.md) |
| See the full manifest | [docs/agents/project-manifest/](docs/agents/project-manifest/README.md) |
| Find a source file | [file-tree.md](docs/agents/project-manifest/file-tree.md) |
| Look up a function signature | [api-surface.md](docs/agents/project-manifest/api-surface.md) |
| Understand the build pipeline | [data-flows.md](docs/agents/project-manifest/data-flows.md) |
| Check naming rules or invariants | [constraints.md](docs/agents/project-manifest/constraints.md) |
| Understand the tech stack | [tech-stack.md](docs/agents/project-manifest/tech-stack.md) |
| See test fixtures | `fixtures/sample-suite/` and `fixtures/shared/` |
| Run tests | `npm test` |
| Build the library | `npm run build` |
