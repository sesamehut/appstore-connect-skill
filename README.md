# App Store Connect for Claude Code

> Operate your Apple App Store Connect account by chatting with Claude — no clicking through the website, no API code to write.

**App Store Connect for Claude Code** (plugin: `app-store-connect`) is an
open-source [Claude Code](https://claude.com/claude-code) plugin and skill that
drives Apple's [App Store Connect](https://appstoreconnect.apple.com) API for
you. Ask in plain language — *"reply to my newest 1-star review," "download
yesterday's sales report," "update the German keywords"* — and Claude runs the
right command and reports back. It ships one self-contained CLI built on Apple's
**official** API: no third-party SDK, no server, no `npm install`.

> Independent open-source project — **not affiliated with or endorsed by Apple**.
> **Claude Code only** (not packaged for Codex, Cursor, or Gemini).

## Quick facts

| | |
|---|---|
| **What it is** | A Claude Code plugin + skill that drives the App Store Connect API through a bundled CLI |
| **Who it's for** | iOS / macOS / tvOS / visionOS developers and publishers who use Claude Code |
| **How you use it** | Natural-language chat inside Claude Code |
| **Requires** | Node.js ≥ 22.12, an App Store Connect API key, network access |
| **Install** | `/plugin marketplace add sesamehut/plugins-marketplace` → `/plugin install app-store-connect@sesamehut-plugins` |
| **Runs on** | macOS, Windows, Linux |

## What you can do

Describe the task in plain language; the skill covers:

| Area | Examples |
|---|---|
| **Apps & versions** | Find an app by bundle ID, read details, locate the editable version |
| **Store listing & localization** | Read/update description, keywords, what's new, promotional text, name, subtitle, privacy URL; add languages |
| **Customer reviews** | List reviews (incl. unanswered), read with response, post or replace a developer reply |
| **Reports & analytics** | Download sales, finance, and analytics reports |
| **Screenshots & previews** | Upload, list, reorder, delete media per device type and locale |
| **TestFlight** | Manage beta groups & testers, test info, beta review detail, read/download feedback |
| **Builds** | List, resolve latest, edit distribution and notes, submit for beta review, expire |
| **Submission & release** | Preflight readiness, set review contact/demo info, configure release & export compliance, submit / cancel / release |

Example prompts: *"List my apps."* · *"Show reviews for `com.example.app` that
still need a reply."* · *"Download last month's US finance report."* · *"Is
version X ready to submit? Run the preflight."*

## Install

Run these two commands in Claude Code (Node.js ≥ 22.12 must be installed):

```text
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install app-store-connect@sesamehut-plugins
```

The CLI ships as one self-contained bundle, so there is **no `npm install`** and
nothing to build. Already added the marketplace? Refresh it with
`/plugin marketplace update`.

## Credentials

Create an API key in App Store Connect under **Users and Access → Integrations**
and download the `.p8` file (Apple lets you download it only once). Then set
these environment variables before launching Claude Code — the skill reads them
from the environment and never writes your key to disk:

| Variable | Meaning |
|---|---|
| `ASC_KEY_ID` | API key ID (**required**) |
| `ASC_ISSUER_ID` | Issuer ID — **required for team keys, omit for individual keys** |
| `ASC_PRIVATE_KEY` *or* `ASC_PRIVATE_KEY_PATH` | The `.p8` contents inline, **or** the path to the `.p8` file |
| `ASC_VENDOR_NUMBER` | Optional; only for sales / finance reports (shown under **Payments and Financial Reports**) |

```bash
export ASC_KEY_ID="ABCD1234EF"
export ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"   # team keys only
export ASC_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/AuthKey_ABCD1234EF.p8"
```

Ask Claude to *"run the App Store Connect self-check"* to verify the setup
offline — it checks Node, the bundle, and your credentials without contacting
Apple.

## Safety

- **Read-only tasks run freely** — listing apps, reading metadata, downloading
  reports, reading reviews and feedback.
- **High-side-effect actions are gated and confirmed first.** Submitting a build
  or version starts a *real Apple review*; releasing goes *live immediately*;
  expiring a build is *irreversible*; adding TestFlight testers *emails real
  invitations*. Claude asks before each, and they cannot be undone from here.

## Scope

- **Not yet exposed (planned):** phased-release control, age-rating
  questionnaire, export-compliance declaration documents.
- **Not possible via Apple's API (use the website):** editing or deleting
  customer reviews or star ratings, App Review / Resolution Center messages,
  agreements / tax / banking, and creating or downloading API keys. The skill
  detects these and routes you to the web instead of guessing.

## FAQ

- **Official Apple software?** No — independent and open-source, built on Apple's
  official API.
- **Need to code?** No — you talk to Claude; the CLI is what the skill calls.
- **Where do my credentials go?** Read from environment variables only; never
  written to disk or printed.
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
