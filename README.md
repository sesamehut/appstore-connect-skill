# App Store Connect for Claude Code

> Work with App Store Connect from Claude Code, without clicking through the
> website or writing one-off API scripts.

**App Store Connect for Claude Code** (plugin: `app-store-connect`) is an
open-source [Claude Code](https://claude.com/claude-code) plugin and skill that
uses Apple's [App Store Connect](https://appstoreconnect.apple.com) API. Ask for
store work in Claude Code — *"reply to my newest 1-star review," "download
yesterday's sales report," "update the German keywords"* — and the skill maps
the request to its bundled CLI, then reports the result. The CLI is
self-contained and built on Apple's **official** API contract: no third-party
ASC SDK, no server, no project-level `npm install`.

> Independent open-source project — **not affiliated with or endorsed by Apple**.
> **Claude Code only** (not packaged for Codex, Cursor, or Gemini).

## Quick facts

| | |
|---|---|
| **What it is** | A Claude Code plugin + skill that drives the App Store Connect API through a bundled CLI |
| **Who it's for** | iOS / macOS / tvOS / visionOS developers and publishers who use Claude Code |
| **How you use it** | Natural-language requests inside Claude Code |
| **Requires** | Node.js ≥ 22.12, an App Store Connect API key, network access |
| **Install** | `/plugin marketplace add sesamehut/plugins-marketplace` → `/plugin install app-store-connect@sesamehut-plugins` |
| **Runs on** | macOS, Windows, Linux |

## What you can do

The skill covers common App Store Connect work:

| Area | Examples |
|---|---|
| **Apps & versions** | Find an app by bundle ID, read details, locate the editable version |
| **Store listing & localization** | Read/update description, keywords, what's new, promotional text, name, subtitle, privacy URL; add languages |
| **Customer reviews** | List reviews, find unanswered reviews, read existing responses, post or replace a developer reply |
| **Reports & analytics** | Download sales, finance, and analytics reports |
| **Screenshots & previews** | Upload, list, reorder, delete media per device type and locale |
| **TestFlight** | Manage beta groups & testers, test info, beta review detail, read/download feedback |
| **Builds** | List, resolve latest, edit distribution and notes, submit for beta review, expire |
| **Submission & release** | Preflight readiness, set review contact/demo info, configure release & export compliance, submit / cancel / release |

Useful prompts include: *"List my apps."* · *"Show reviews for `com.example.app` that
still need a reply."* · *"Download last month's US finance report."* · *"Is
version X ready to submit? Run the preflight."*

## Install

Run these two commands in Claude Code (Node.js ≥ 22.12 must be installed):

```text
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install app-store-connect@sesamehut-plugins
```

The CLI is included as one self-contained bundle, so there is **no `npm install`**
and nothing to build. Already added the marketplace? Refresh it with
`/plugin marketplace update`.

## Credentials

Create an API key in App Store Connect → **Users and Access → Integrations** and
download the `.p8` (Apple allows the download only once). The skill reads these
from the environment:

| Variable | Meaning |
|---|---|
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

- **Read-only tasks run freely:** listing apps, reading metadata, downloading
  reports, reading reviews and feedback.
- **High-side-effect actions are gated and confirmed first.** Submitting a build
  or version starts a *real Apple review*; releasing goes *live immediately*;
  expiring a build is *irreversible*; adding TestFlight testers sends *real
  invitation emails*. The skill asks before each one, and they cannot be undone
  from here.

## Scope

- **Not yet exposed (planned):** phased-release control, age-rating
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
- **Will it submit or release without asking?** No — those actions require
  explicit confirmation.

## Source & license

- **Source:** <https://github.com/sesamehut/appstore-connect-skill>
- **Marketplace:** <https://github.com/sesamehut/plugins-marketplace>
- **License:** [MIT](LICENSE) · Maintained by [Sesame Hut](https://sesamehut.studio)

Building the skill from source? See [`CLAUDE.md`](CLAUDE.md) and the design notes
under [`docs/`](docs/).
