# App Store Connect plugin

Operate Apple **App Store Connect** from Claude Code. This plugin ships a
self-contained CLI plus a skill that drives it, so Claude can list apps, edit
store metadata and localizations, reply to customer reviews, download
sales / finance / analytics reports, manage screenshots and preview videos,
run TestFlight beta groups, builds, and feedback, and drive App Store
submission and release — all through natural-language tasks.

Claude Code only. Cross-tool support (Codex / Gemini) is not part of this
plugin.

## Prerequisites

- **Node.js >= 22.12** on your machine (`node --version`).
- **Network access** to `api.appstoreconnect.apple.com`.

That is all. The CLI is shipped as one self-contained bundle — there is **no
`npm install` step** and no other dependency to set up.

## Credentials

The skill authenticates with an App Store Connect API key, read from
environment variables (never written to disk by the skill):

| Variable | Meaning |
| --- | --- |
| `ASC_KEY_ID` | App Store Connect API key ID (required). |
| `ASC_ISSUER_ID` | Issuer ID — **required for team keys, omit for individual keys**. |
| `ASC_PRIVATE_KEY` | The `.p8` private-key content, inline PEM (use this **or** `ASC_PRIVATE_KEY_PATH`). |
| `ASC_PRIVATE_KEY_PATH` | Path to the `.p8` file (exactly one of the two key variables). |
| `ASC_VENDOR_NUMBER` | Optional; needed only for sales / finance report downloads (or pass `--vendor`). |

Create an API key in App Store Connect under **Users and Access ->
Integrations**; download the `.p8` file once (Apple does not let you re-download
it). The team-vs-individual distinction decides whether `ASC_ISSUER_ID` is
needed: team keys require it, individual keys do not. The vendor number is shown
in App Store Connect under **Payments and Financial Reports** — the API cannot
read it, so set it manually if you download sales/finance reports.

Set the variables in your shell before launching Claude Code, for example:

```bash
export ASC_KEY_ID="ABCD1234EF"
export ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"   # team keys only
export ASC_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/AuthKey_ABCD1234EF.p8"
```

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install app-store-connect@sesamehut-plugins
```

Installation places the plugin's files; it does **not** install any
dependencies. The CLI bundle is self-contained, so once Node is present the
skill is ready to use. (If you have added the marketplace before, refresh it
first with `/plugin marketplace update`.)

## Usage

Once installed and credentials are set, just ask Claude in natural language —
the skill triggers on App Store Connect tasks. For example:

> "List my apps in App Store Connect."
>
> "Show the reviews for com.example.app that still need a reply."
>
> "Download yesterday's sales report."
>
> "What's the editable version of my app, and what does its description say?"

To verify the environment without touching your account, ask Claude to run the
offline self-check, or run it directly:

```
node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" doctor
```

`doctor` is offline: it reports the Node version, that the bundle is intact,
and whether your credentials are configured — no request is made to Apple.

### Read-only vs. high-side-effect

- **Read-only and reversible tasks are safe to run** (listing apps, reading
  metadata, downloading reports, reading reviews and feedback).
- **High-side-effect actions require an explicit `--force` and cause real,
  externally visible changes.** Submitting a build or a version starts a real
  Apple review; releasing a version pushes it live immediately; expiring a build
  is irreversible; adding TestFlight testers emails real invitations. Claude
  asks before these — confirm the target with care, because they cannot be
  undone from here.

## Versioning

This plugin's version (`0.1.0`) is generated from the project source
and kept in lockstep with the CLI's own reported version
(`node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" --version`).

## Maintainers

This directory is a generated artifact — do not hand-edit it. See
[CLAUDE.md](CLAUDE.md): it is produced from the `appstore-connect-skill` source
by `npm run package:plugin`, which regenerates the whole payload.
