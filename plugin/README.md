# App Store Connect plugin

Operate Apple **App Store Connect** from Claude Code by chatting in plain
language — no clicking through the website, no API code to write. This plugin
ships one self-contained CLI plus a skill that drives it: list apps, edit store
metadata and localizations, reply to reviews, download sales / finance /
analytics reports, manage screenshots and previews, run TestFlight, builds, and
feedback, and drive App Store submission and release.

Independent open-source project — **not affiliated with or endorsed by Apple**.
**Claude Code only** (not packaged for Codex / Gemini).

## Quick facts

| | |
| --- | --- |
| **Requires** | Node.js >= 22.12, an App Store Connect API key, network access to `api.appstoreconnect.apple.com` |
| **Install** | `/plugin marketplace add sesamehut/plugins-marketplace` -> `/plugin install app-store-connect@sesamehut-plugins` |
| **Setup** | No `npm install` and nothing to build — the CLI is one self-contained bundle |
| **Runs on** | macOS, Windows, Linux |

## What you can do

Describe the task in plain language; the skill covers:

| Area | Examples |
| --- | --- |
| **Apps & versions** | Find an app by bundle ID, read details, locate the editable version |
| **Store listing & localization** | Read/update description, keywords, what's new, promotional text, name, subtitle, privacy URL; add languages |
| **Customer reviews** | List reviews (incl. unanswered), read with response, post or replace a developer reply |
| **Reports & analytics** | Download sales, finance, and analytics reports |
| **Screenshots & previews** | Upload, list, reorder, delete media per device type and locale |
| **TestFlight** | Manage beta groups & testers, test info, beta review detail, read/download feedback |
| **Builds** | List, resolve latest, edit distribution and notes, submit for beta review, expire |
| **Submission & release** | Preflight readiness, set review contact/demo info, configure release & export compliance, submit / cancel / release |

Example prompts: *"List my apps."* · *"Show reviews for com.example.app that
still need a reply."* · *"Download last month's US finance report."* · *"Is this
version ready to submit? Run the preflight."*

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install app-store-connect@sesamehut-plugins
```

Installation just places the files — it does **not** run `npm install`. Once
Node 22.12+ is present and credentials are set, the skill is ready. (Added the
marketplace before? Refresh it with `/plugin marketplace update`.)

## Credentials

Create an API key in App Store Connect under **Users and Access ->
Integrations** and download the `.p8` file (Apple lets you download it only
once). Set these environment variables before launching Claude Code — the skill
reads them from the environment and never writes your key to disk:

| Variable | Meaning |
| --- | --- |
| `ASC_KEY_ID` | API key ID (**required**). |
| `ASC_ISSUER_ID` | Issuer ID — **required for team keys, omit for individual keys**. |
| `ASC_PRIVATE_KEY` *or* `ASC_PRIVATE_KEY_PATH` | The `.p8` contents inline, **or** the path to the `.p8` file. |
| `ASC_VENDOR_NUMBER` | Optional; only for sales / finance reports (shown under **Payments and Financial Reports**; the API cannot read it). |

```bash
export ASC_KEY_ID="ABCD1234EF"
export ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"   # team keys only
export ASC_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/AuthKey_ABCD1234EF.p8"
```

Verify the setup offline — ask Claude to run the self-check, or run it directly:

```
node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" doctor
```

`doctor` reports the Node version, that the bundle is intact, and whether your
credentials are configured — no request is made to Apple.

## Safety

- **Read-only and reversible tasks run freely** (listing apps, reading metadata,
  downloading reports, reading reviews and feedback).
- **High-side-effect actions require an explicit `--force` and are confirmed
  first.** Submitting a build or version starts a real Apple review; releasing
  goes live immediately; expiring a build is irreversible; adding TestFlight
  testers emails real invitations. Claude asks before each — they cannot be
  undone from here.

## Scope

- **Not yet exposed (planned):** phased-release control, the age-rating
  questionnaire, export-compliance declaration documents.
- **Not possible via Apple's API (use the website):** editing or deleting
  customer reviews or star ratings, App Review / Resolution Center messages,
  agreements / tax / banking, and creating or downloading API keys. The skill
  detects these and routes you to the web instead of guessing.

## FAQ

- **Official Apple software?** No — independent and open-source, built on Apple's
  official API.
- **Need to code?** No — you talk to Claude; the CLI is what the skill calls.
- **Where do my credentials go?** Environment variables only; never written to
  disk or printed.
- **Can it fake reviews or change ratings?** No — Apple's API only allows reading
  reviews and replying as the developer.
- **Will it submit or release without asking?** No — those require explicit
  confirmation.

## Versioning, source & license

- Version `0.1.0`, kept in lockstep with the CLI's own
  `node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" --version`.
- Source & docs: <https://github.com/sesamehut/appstore-connect-skill> · License: MIT · Maintained by Sesame Hut.
- This directory is a **generated artifact** — do not hand-edit it (see
  [CLAUDE.md](CLAUDE.md)); it is produced from the `appstore-connect-skill` source by
  `npm run package:plugin`.
