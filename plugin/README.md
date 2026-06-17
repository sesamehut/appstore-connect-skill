# App Store Connect plugin

Work with Apple **App Store Connect** from Claude Code, without clicking through
the website or writing one-off API scripts. This plugin includes a
self-contained CLI plus the skill that calls it: list apps, edit store metadata
and localizations, reply to reviews, download sales / finance / analytics
reports, manage screenshots and previews, handle TestFlight, builds, and
feedback, and run App Store submission and release steps.

Independent open-source project — **not affiliated with or endorsed by Apple**.
**Claude Code only** (not packaged for Codex / Gemini).

## Quick facts

| | |
| --- | --- |
| **Requires** | Node.js >= 22.12, an App Store Connect API key, network access to `api.appstoreconnect.apple.com` |
| **Install** | `/plugin marketplace add sesamehut/plugins-marketplace` -> `/plugin install app-store-connect@sesamehut-plugins` |
| **Setup** | No `npm install` and nothing to build; the CLI is already bundled |
| **Runs on** | macOS, Windows, Linux |

## What you can do

The skill covers common App Store Connect work:

| Area | Examples |
| --- | --- |
| **Apps & versions** | Find an app by bundle ID, read details, locate the editable version |
| **Store listing & localization** | Read/update description, keywords, what's new, promotional text, name, subtitle, privacy URL; add languages |
| **Customer reviews** | List reviews, find unanswered reviews, read existing responses, post or replace a developer reply |
| **Reports & analytics** | Download sales, finance, and analytics reports |
| **Screenshots & previews** | Upload, list, reorder, delete media per device type and locale |
| **TestFlight** | Manage beta groups & testers, test info, beta review detail, read/download feedback |
| **Builds** | List, resolve latest, edit distribution and notes, submit for beta review, expire |
| **Submission & release** | Preflight readiness, set review contact/demo info, configure release & export compliance, submit / cancel / release |

Useful prompts include: *"List my apps."* · *"Show reviews for com.example.app that
still need a reply."* · *"Download last month's US finance report."* · *"Is this
version ready to submit? Run the preflight."*

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install app-store-connect@sesamehut-plugins
```

Installation only places the plugin files; it does **not** run `npm install`.
Once Node 22.12+ is present and credentials are set, the skill is ready. (Added the
marketplace before? Refresh it with `/plugin marketplace update`.)

## Credentials

Create an API key in App Store Connect → **Users and Access → Integrations** and
download the `.p8` (Apple allows the download only once). The skill reads these
from the environment:

| Variable | Meaning |
| --- | --- |
| `ASC_KEY_ID` | API key ID (**required**) |
| `ASC_ISSUER_ID` | Issuer ID — **required for team keys, omit for individual keys** |
| `ASC_PRIVATE_KEY` *or* `ASC_PRIVATE_KEY_PATH` | The `.p8` contents inline, **or** a path to the file — set exactly one |
| `ASC_VENDOR_NUMBER` | Optional; only for sales / finance reports (under **Payments and Financial Reports**) |

The git-safe place to put them is the `env` block of your **user-level** Claude
Code settings (`~/.claude/settings.json`, or `%USERPROFILE%\.claude\settings.json`
on Windows) — it lives outside every repo, so the key can't be committed by
accident. Not sure how? Ask Claude to *"set up my App Store Connect credentials"*
and *"run the self-check"* (`doctor`, offline) — it walks you through it and, with
your consent, can fill it in.

## Safety

- **Read-only and reversible tasks run freely** (listing apps, reading metadata,
  downloading reports, reading reviews and feedback).
- **High-side-effect actions require an explicit `--force` and are confirmed
  first.** Submitting a build or version starts a real Apple review; releasing
  goes live immediately; expiring a build is irreversible; adding TestFlight
  testers sends real invitation emails. The skill asks before each one; they
  cannot be undone from here.

## Scope

- **Not yet exposed (planned):** phased-release control, the age-rating
  questionnaire, export-compliance declaration documents.
- **Not possible via Apple's API (use the website):** editing or deleting
  customer reviews or star ratings, App Review / Resolution Center messages,
  agreements / tax / banking, and creating or downloading API keys. The skill
  calls out these limits instead of trying to work around them.

## FAQ

- **Official Apple software?** No — independent and open-source, built on Apple's
  official API.
- **Need to code?** No — you ask in Claude Code; the skill calls the CLI.
- **Where do my credentials go?** The skill only reads them from environment
  variables — it never writes your key to disk. You choose where the variables
  live; the **Credentials** section recommends a git-safe spot.
- **Can it fake reviews or change ratings?** No — Apple's API only allows reading
  reviews and replying as the developer.
- **Will it submit or release without asking?** No — those require explicit
  confirmation.

## Versioning, source & license

- Version `0.1.1`, kept in lockstep with the CLI's own
  `node "${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" --version`.
- Source & docs: <https://github.com/sesamehut/appstore-connect-skill> · License: [MIT](LICENSE) · Maintained by Sesame Hut.
- This directory is a **generated artifact** — do not hand-edit it (see
  [CLAUDE.md](CLAUDE.md)); it is produced from the `appstore-connect-skill` source by
  `npm run package:plugin`.
