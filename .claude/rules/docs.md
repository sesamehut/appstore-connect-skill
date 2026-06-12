---
paths:
  - "docs/**/*"
---

# docs/ — appstore-connect-skill Design Documents

Split by document role / audience, not by technical subsystem:
`product/` · `architecture/` · `implementation/` · `research/` · `testing/` ·
`phases/`.

## Directory Structure

This file is the docs entry point and inventory.

- `product/` — Product scope and boundaries
  - `api-scope.md` — What the skill solves and what it deliberately leaves out
- `architecture/` — System design and design decisions (decisions are folded in
  as fluent text, never kept as standalone decision files)
  - `overview.md` — Module split, system boundaries, and the top-level design
    judgements
- `implementation/` — Technical implementation notes / strategy
  - `authentication.md` — Authentication boundary and credential lifecycle
  - `request-model.md` — How ordinary requests, pagination, and file flows
    cooperate
  - `skill-interface.md` — Skill entry layer: CLI shape, SKILL.md routing,
    output conventions, runtime environment assurance
- `research/` — Supporting research; externally-sourced, non-decisional, each
  entry carries its collection date
  - `sdk-comparison.md` — Background for the ASC SDK selection
  - `mcp-skill-landscape.md` — Background on the ASC MCP server / Claude Skill
    tooling ecosystem
  - `codegen-and-runtime-stack.md` — Evidence base for the OpenAPI codegen and
    Node runtime stack selection
- `testing/` — Cross-cutting test strategy (currently empty; reserved)
- `phases/` — Phase planning and milestone tracking
  - `roadmap.md` — Milestone roadmap from design stage to a distributable
    skill; owns per-milestone status
  - `archive/` — Detailed phase plans move here once their phase completes
    - `m0-engineering-foundation.md` — Completed M0 phase plan: engineering
      foundation (toolchain, unified checks, CI)
    - `m1-api-contract-layer.md` — Completed M1 phase plan: API contract
      layer (spec acquisition, generation pipeline, integrity guard, drift
      detection)

## Rules

- **Structural source of truth** — this file owns the directory listing above.
  Whenever a file under `docs/` is added, renamed, or removed, update the
  listing here and nearby cross-document links in the same change.
- **Docs taxonomy** — put a new doc in the directory matching its role:
  positioning / scope → `product/`; system design and design decisions →
  `architecture/`; technical implementation notes → `implementation/`;
  supporting research → `research/`; cross-cutting test strategy → `testing/`;
  phase plans and roadmap → `phases/` (active plans at the top level, completed
  plans in `archive/`).
  Fold design decisions into architecture documents as fluent text instead of
  standalone decision files.
- **Docs depth** — docs should focus on problem analysis, goals, algorithmic
  ideas, design logic, module responsibilities, architecture, and implementation
  strategy. Do not include runnable code, exact directory trees, full type
  definitions, concrete package-manager commands, or low-level configuration
  snippets. Alternatives should be mentioned briefly; document only the selected
  strategy in depth.
- **Research freshness** — ASC API versions, Apple docs, and ecosystem research
  are time-sensitive. Preserve collection dates in research notes and re-check
  official Apple sources before turning stale research into implementation.
- **Language** — all `docs/` content is written in Chinese; technical terms,
  commands, code blocks, paths, and protocol names stay in English. This rule
  file lives outside `docs/`, so it is in English.
- **Cross-references** — use markdown links with relative paths from the current
  file; never absolute paths from the repo root.
