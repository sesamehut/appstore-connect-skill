# appstore-connect-skill - workspace notes for agents

A Claude Skill that drives the Apple **App Store Connect (ASC) API** from Node.js
/ TypeScript. The skill stands on Apple's official API contract plus a thin
hand-written runtime layer; it intentionally avoids any third-party ASC SDK.
Product scope, architecture, implementation strategy, and supporting research
live under [`docs/`](docs/). Design decisions are integrated into the
architecture docs instead of kept as standalone decision files.

## Communication

- Talk to the user in **Chinese**.
- Write `docs/` content in **Chinese** (product / architecture /
  implementation / research notes).
- Write **everything else in English**: code, comments, commit messages, and
  all other repo-resident docs (this file, `CLAUDE.md`, `README.md`).

## Tech direction

- **Runtime**: Node.js / TypeScript.
  See [architecture overview](docs/architecture/overview.md).
- **API contract**: generated from Apple's official specification; regenerated
  when the spec bumps, never hand-edited.
  See [architecture overview](docs/architecture/overview.md).
- **Runtime strategy**: thin request layer, centralized authentication, and
  hand-written pagination/report/upload workflows.
  See [architecture overview](docs/architecture/overview.md).

## Architecture rules

- The Apple official API contract is the source of truth for ASC resources,
  request shapes, and response shapes. Generated contract files are boundary
  artifacts; never hand-edit them once they exist. Regenerate from the official
  contract and keep the generated result reviewable.
- Runtime code should stay thin and auditable: centralized authentication,
  one request layer, explicit pagination, and hand-written workflows for reports,
  media, and upload-like multi-step flows.
- Do not add a third-party ASC SDK as a shortcut. If a new dependency changes
  structure, runtime behavior, or trust boundaries, document the decision in the
  architecture docs before relying on it.
- Skill-facing operations should model user tasks, not leak raw HTTP mechanics.
  Low-level request details belong in the runtime layer and diagnostics.

## Agent Files

`CLAUDE.md` and `AGENTS.md` are twins - one per agent. Mirror every edit into
both; conventions both agents need go here, not in a private memory. Keep the
files semantically identical except for the title where needed.

## Documentation

Docs conventions - taxonomy, the directory inventory, depth, freshness, and
cross-reference rules - live in [`.claude/rules/docs.md`](.claude/rules/docs.md).
When adding, renaming, or removing files under `docs/`, update that inventory in
the same change.

## Code conventions

- Prefer TypeScript with ESM-style modules for runtime code unless the
  architecture docs supersede that direction.
- Prefer named imports over namespace imports.
- Never commit private keys, issuer identifiers, key identifiers, tokens, or
  other credentials. Keep them in env vars or untracked files.
- Comment the WHY, not the WHAT. Earn the line by adding information the code
  itself cannot carry: a hidden invariant, an intentional non-behavior, a
  non-obvious precondition, or a workaround for a specific external bug. Avoid
  session notes such as "added for X" or "as requested"; those belong outside
  the code.
- Cite source-of-truth docs in comments only when the rationale is not
  reconstructible from the code, a future maintainer is likely to change it
  wrongly without the pointer, and the target doc is stable.

## Testing

Use a Testing Trophy bias: write tests, not too many, mostly integration.

- **Integration first** - cover authentication, request construction, pagination,
  ASC error normalization, report download flow, media upload flow, and
  skill-level task behavior with realistic inputs. Mock external ASC/network
  boundaries at clear seams.
- **Unit supporting** - use unit tests for pure logic where isolation adds
  clarity: validation, parsing, transformation, backoff calculation, and error
  classification. Do not spend unit tests on trivial delegation or framework
  wiring.
- **Secrets tests** - never use real private keys, issuer identifiers, key
  identifiers, or tokens. Use fixtures that cannot authenticate against ASC.

## Verification

- **Docs changes** - verify cross-document links, terminology, and factual
  claims across product scope, architecture, implementation notes, and research.
  If a claim depends on current Apple behavior, check the official source before
  presenting it as current.
- **Code changes** - run `npm run check` from the repo root: typecheck, lint,
  format check, and tests - the same gate CI runs on every PR and push to main.
  Individual scripts: `typecheck`, `lint`, `format`, `format:check`, `test`,
  `test:watch`, `coverage`, `build`.
- **Generated contract changes** - regenerate from the official Apple contract
  and verify the generated output is reproducible. Never hand-edit generated
  contract artifacts.

## Debug output

- Agent, MCP, browser, and ad-hoc debug captures go under `.debug-output/`.
  Do not leave screenshots, dumps, tokens, or temporary diagnostics in the repo
  root.

## Git conventions

- Branch naming: `feature/xxx`, `fix/xxx`, `refactor/xxx`.
- Commit messages: `type(scope): description` (e.g.
  `feat(auth): add ES256 JWT signer`).
