# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this directory.

## What this directory is

This is the **distribution payload** for the App Store Connect skill: a Claude
Code plugin that ships one self-contained CLI bundle (`cli/asc.mjs`) plus the
skill definition that drives it. It lives in the `plugin/` subdirectory of the
`appstore-connect-skill` repository, and the marketplace installs it from there
via a git-subdir source. It is what runs on the user's machine — not a
development checkout.

## This directory is GENERATED — do not hand-edit

Every file here (`.claude-plugin/plugin.json`, `skills/app-store-connect/SKILL.md`,
`cli/asc.mjs`, `README.md`, `LICENSE`, this `CLAUDE.md`, `.gitignore`,
`.gitattributes`) is produced from the surrounding `appstore-connect-skill`
source by
`npm run package:plugin`. Editing a file here directly will be overwritten on the
next release and will drift from the audited source.

To change anything: edit the source (SKILL.md template, CLI source,
README/CLAUDE generators, plugin.json content) and re-run
`npm run package:plugin`, then commit the regenerated payload.

## Conventions

- The bundled CLI is self-contained: it inlines its runtime dependencies and
  needs no `npm install`. The only environment prerequisite is Node >=22.12 and
  network access to App Store Connect.
- The skill addresses the CLI via `${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs`; the
  installed plugin directory resolves `${CLAUDE_PLUGIN_ROOT}` for you.
- Credentials are read from environment variables only; this payload must never
  contain a `.p8` key, a `.env` file, or any other credential (the `.gitignore`
  enforces this mechanically, and the packaging step secret-scans the payload
  before it can be committed).
