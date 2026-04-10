# Project Manifest — @mistralys/persona-builder

> **Purpose:** Canonical reference for AI agents working with the `@mistralys/persona-builder` library. Start here, then follow the links to detailed sections.

---

## Project Overview

`@mistralys/persona-builder` is a standalone TypeScript library that builds AI persona documents from YAML metadata and Markdown content templates. It ships with three built-in output targets — VS Code Chat (`.agent.md`), Claude Code (`.md`), and Deep Agents (`.md`) — and supports custom targets via `TargetRegistry`, all driven by a plugin-extensible pipeline.

| Property | Value |
|----------|-------|
| **Package** | `@mistralys/persona-builder` |

| **Language** | TypeScript 5.8 (ES2022 target) |
| **Runtime** | Node.js ≥ 18.17 (ESM) |
| **Build Tool** | tsup (dual CJS + ESM output) |
| **Test Framework** | Vitest |
| **Production Dependency** | `js-yaml` (sole dependency) |
| **License** | MIT |

---

## Manifest Sections

| Section | File | Contents |
|---------|------|----------|
| **Tech Stack & Patterns** | [tech-stack.md](tech-stack.md) | Runtime, language, frameworks, architectural patterns, build tooling. |
| **File Tree** | [file-tree.md](file-tree.md) | Annotated directory structure of the project. |
| **Public API Surface** | [api-surface.md](api-surface.md) | All exported types, functions, and constants — signatures only. |
| **Key Data Flows** | [data-flows.md](data-flows.md) | Main interaction paths through the build pipeline. |
| **Constraints & Conventions** | [constraints.md](constraints.md) | Architectural invariants, naming rules, and known limitations. |

---

**Manifest last revised:** 2026-04-02
