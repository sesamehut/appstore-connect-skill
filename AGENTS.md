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
- **Code changes** - run `npm run check` from the repo root: contract verify,
  version check, SKILL verify, typecheck, lint, format check, and tests - the
  same gate CI runs on every PR and push to main. Individual scripts:
  `typecheck`, `lint`, `format`, `format:check`, `test`, `test:watch`,
  `coverage`, `build`, `version:check`, `skill:verify`.
- **Real-credential smoke** - `npm run smoke` builds `dist/` and makes a
  handful of minimal reads against the real ASC API. It needs network plus
  `ASC_*` env vars (key ID, optional issuer ID, private key inline or as a
  file path), so it stays outside `check` and CI. Output contains no secrets.
  Setting `ASC_SMOKE_WRITE=1` adds a write roundtrip (patch one
  promotionalText, read back, restore). Setting `ASC_VENDOR_NUMBER` adds
  sales/finance report downloads (into a temp dir, cleaned up; a missing
  report or finance-role 403 is a reported skip), and the analytics
  read-only chain runs whenever an active report request exists. Setting
  `ASC_SMOKE_MEDIA=1` adds a screenshot upload-then-delete on an editable
  (non-live) version: a runtime-generated PNG is reserved, transferred
  (auth-free PUT), committed, status-read, then deleted (with the set if it
  was created). A FAILED dimension check still verifies the mechanics; the
  public listing is never touched and previews are not smoked. Setting
  `ASC_SMOKE_TESTFLIGHT=1` adds a TestFlight pass of reversible / read-only
  steps only: it reads beta groups, builds, and crash/screenshot feedback
  (counts/metadata only — no PII, no signed URLs), then creates one empty beta
  group with a unique smoke name and deletes it in a finally (cleaning up only
  the group this run created; an empty group emails no invitations). Missing
  data or an insufficient role is a reported skip. High-side-effect writes are
  NEVER smoked: adding a tester emails real invitations, submitting a build for
  beta review triggers a real immutable Apple review, and expiring a build is
  irreversible. Setting `ASC_SMOKE_SUBMISSION=1` adds an App Store
  submission/release pass of reversible / read-only steps on an editable
  (non-live) version: it runs the read-only preflight, reads the version's
  appStoreReviewDetail, reads the app's reviewSubmissions state, reads the
  phased-release read-only fields, and set+restores releaseType (read, PATCH,
  restore). Missing data or an insufficient role is a reported skip. The three
  high-side-effect verbs are NEVER smoked: submit starts a real Apple App Review
  of the public listing, release pushes a version live immediately, and cancel
  withdraws a submission (forcing a fresh review).
- **CLI** - the Skill entry CLI builds to `dist/cli/index.js`; run it during
  development with `node dist/cli/index.js <domain> <verb> [flags]` (e.g.
  `node dist/cli/index.js doctor` for the offline environment self-check).
  `npm run cli -- <args>` also works, but NOT from PowerShell: pwsh drops the
  bare `--` when invoking `npm.cmd`, so npm silently swallows the flags as its
  own config (quote it as `'--'` if you must). The project-level skill at
  `.claude/skills/app-store-connect/SKILL.md` targets the repo's own `dist/`
  build, so rebuild after CLI changes.
- **Distribution build (M8)** - `npm run bundle` tsc-builds then esbuilds the CLI
  into one self-contained ESM file `dist/bundle/asc.mjs` with its runtime deps
  inlined (esbuild is a build-time devDependency only, never in `dependencies`).
  A build-time `__ASC_BUNDLED__` flag makes `doctor` self-aware so its dependency
  and build checks pass without a node_modules. `npm run package:plugin` then
  assembles the full Claude Code plugin payload into `dist/plugin/` via an
  EXPLICIT allow-list - it never globs the repo root, which physically holds a
  real `.p8` and `.env.local` - and runs a fail-closed secret-scan over the
  staging tree before the payload may ship. SKILL.md has a single source
  (`scripts/skill/SKILL.template.md`): `skill:generate` renders the dev/plugin
  variants and `skill:verify` (in `check`) fails closed if the committed dev
  SKILL.md drifts from the template. `version:check` (in `check`) keeps
  `package.json` version and `CLI_VERSION` (`src/cli/root.ts`) in lockstep; the
  plugin.json and marketplace-entry versions are pre-publish gates. Both
  `dist/bundle/` and `dist/plugin/` are gitignored generated artifacts.
- **Generated contract changes** - regenerate with `npm run contract:update`
  (fetches the latest official Apple spec, regenerates `src/generated/`, and
  refreshes the metadata manifest). Generation is deterministic: re-running on
  an unchanged spec must produce a zero diff. Never hand-edit generated
  contract artifacts - `contract:verify` (first gate in `check`) fails on any
  artifact/manifest mismatch. A weekly CI job (`contract:drift`) flags new
  Apple spec releases.

## Debug output

- Agent, MCP, browser, and ad-hoc debug captures go under `.debug-output/`.
  Do not leave screenshots, dumps, tokens, or temporary diagnostics in the repo
  root.

## Git conventions

- Branch naming: `feature/xxx`, `fix/xxx`, `refactor/xxx`.
- Commit messages: `type(scope): description` (e.g.
  `feat(auth): add ES256 JWT signer`).
