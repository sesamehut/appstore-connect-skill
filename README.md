# App Store Connect Agent Skill

_for Claude Code, Codex, Cursor, and other AI agents_

**An AI-native App Store Connect skill — built for the people shipping apps with vibe coding.**

<!--
App Store Connect CLI and AI-agent skill. Operate and manage the Apple App Store
Connect API from the command line or an AI agent: automate App Store metadata and
localizations, customer reviews and developer replies, sales / finance /
analytics report downloads, screenshots and App Preview videos, TestFlight beta
groups, testers and feedback, builds, and App Store submission and release.
Portable across AI agents — Claude Code, OpenAI Codex, Cursor, Gemini CLI, and
more — not locked to Claude Code. Not an MCP server, not a CI/CD pipeline, not
affiliated with Apple. Related terms: App Store Connect automation, ASC API
command-line tool, iOS app release automation, App Store Connect agent / skill,
App Store Connect API CLI, AI-native App Store Connect, vibe coding app release,
App Store Connect for product managers and designers.
-->

> Built for AI agents: turn one plain-English sentence — _"reply to my newest
> 1-star review," "download yesterday's sales report," "change the German
> keywords"_ — into precise calls to Apple's official App Store Connect API. No
> clicking through the website, no scripts, no command line.

**App Store Connect Agent Skill** (plugin: `app-store-connect`) is an open-source,
**AI-native** command-line tool for operating the Apple [App Store
Connect](https://appstoreconnect.apple.com) API from an AI agent — designed for
agents, not retrofitted with an agent wrapper. It lets you **operate and manage
App Store Connect in plain language**: list apps, edit store listings and
localizations, reply to reviews, download sales/finance/analytics reports, manage
screenshots and TestFlight, and submit or release a version. It's a natural fit
for the people **shipping apps with vibe coding** — product managers, designers,
indie makers, and builders from every field who turn ideas into apps with AI: you
built the app with AI, so run the App Store Connect side of it the same way. Even
first-time credential setup is walked through conversationally by the agent. In
[Claude Code](https://claude.com/claude-code), each request maps to the bundled,
JSON-emitting CLI, which then reports the result. It isn't a thin HTTP wrapper:
requests map to task-shaped commands, with the raw API mechanics kept in the
runtime layer. Built on Apple's **official** API contract: no third-party ASC SDK,
no server, no project-level `npm install`.

> Independent open-source project — **not affiliated with or endorsed by Apple**.
> **Not locked to Claude Code** — though Claude Code is the one-command install
> today (see [Using it outside Claude Code](#using-it-outside-claude-code)).

## Quick facts

| | |
|---|---|
| **What it is** | A command-line tool and portable Agent Skill that drives — and automates — App Store Connect work via Apple's official API |
| **Who it's for** | The people shipping apps with vibe coding — product managers, designers, and makers from every field who turn ideas into apps with AI; professional developers too |
| **How you use it** | Natural-language requests in your AI agent, which calls the bundled command-line tool for you (you never touch it directly) |
| **Works in** | Claude Code, Codex, Cursor, Gemini CLI, and other AI agents — not Claude-only |
| **Not an** | MCP server, CI/CD pipeline, or official Apple tool |
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

## Why developers choose it

- **AI-native — natural language _is_ the interface.** Built for the people
  shipping apps with vibe coding: product managers, designers, and makers from
  every field who turn ideas into apps with AI. You built the app with AI; run
  the App Store Connect side — submitting, fixing copy, replying to reviews,
  pulling reports — the same way. No command line, no scripts, no API docs; even
  setup is conversational.
- **Plain English → typed commands.** You describe the task; the skill maps it
  to a specific command with explicit arguments — not a free-form HTTP wrapper.
- **Structured, parseable output.** The CLI emits JSON the agent can read,
  audit, and chain.
- **Deliberate operational conventions.** Pagination, App Store Connect error
  codes, and rate limiting are handled explicitly.
- **Honest about Apple's API.** Website-only tasks (agreements, tax, Resolution
  Center, API-key creation) are flagged and handed to the site, not faked.
- **Credentials stay yours.** The key is read from the environment, never echoed
  or written to disk; high-impact actions need explicit confirmation.
- **No SDK, no server.** Built directly on Apple's official API contract.

## How it compares

Good tools exist for App Store Connect; they solve different jobs.

- **vs. CI/CD release tools** (Fastlane `deliver` / `pilot`, Codemagic, Bitrise,
  Xcode Cloud, EAS Submit): those build, sign, and ship binaries from a build
  machine. This is complementary — it drives the *management* surface (metadata,
  reviews, reports, TestFlight, submission and release) from natural language,
  with no build machine to maintain.
- **vs. community `asc` CLIs:** like them, it's a JSON-output CLI for the App
  Store Connect API; it adds a Claude Code skill that turns plain English into
  commands.
- **vs. MCP servers:** it's an agent skill you run from your own agent, not an
  MCP server. See [Using it outside Claude Code](#using-it-outside-claude-code).

**When this is the right tool:** reach for it to *operate* App Store Connect
conversationally — reply to a review, fix the German keywords, pull yesterday's
sales report, run a submission preflight — without the website or a CI pipeline.
For a full automated release pipeline, a CI tool like Fastlane or EAS Submit fits
better; this is for the day-to-day store work around it.

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

Either way, the key still sits as **plaintext on disk** in that settings file.
That keeps it out of git, which is the main risk here; for stricter setups,
prefer a system keychain, a secret manager, or short-lived injection at run time
over a long-lived file.

## Safety

- **Read-only tasks run freely:** listing apps, reading metadata, downloading
  reports, reading reviews and feedback.
- **High-side-effect actions are gated and confirmed first.** Submitting a build
  or version starts a *real Apple review*; releasing goes *live immediately*;
  expiring a build is *irreversible*; adding TestFlight testers sends *real
  invitation emails*. The skill asks before each one, and they cannot be undone
  from here.
- **The `--force` gate is an agent-cooperation guardrail, not an independent
  approval system.** Confirmation relies on the skill's instructions and the
  agent honoring them — it isn't an out-of-band human sign-off. Keep your
  credentials and skill definition trusted.

## Scope

This errs toward under-promising: it exposes what Apple's API genuinely supports
and is explicit about the rest, rather than faking unsupported actions.

- **Not yet exposed (planned):** phased-release control, age-rating
  questionnaire, export-compliance declaration documents.
- **Not possible via Apple's API (use the website):** editing or deleting
  customer reviews or star ratings, App Review / Resolution Center messages,
  agreements / tax / banking, and creating or downloading API keys. The skill
  calls out these limits instead of trying to work around them.

## Using it outside Claude Code

It isn't locked to Claude Code — the same skill works in other AI agents like
Codex CLI, Cursor, and Gemini CLI; drop the skill folder into that agent's skills
directory.

The one caveat is that it's **CLI-backed**: the host has to run the bundled CLI
locally, with Node.js, network access, and your `ASC_*` credentials. Local agents
fit naturally; cloud-sandboxed surfaces (like the ChatGPT app) would need the
CLI, network, and credentials provisioned in their sandbox, so they aren't a
drop-in target. Claude Code is the one-command install (see **Install**); other
agents are "bring the skill folder yourself" today, not a packaged integration we
test. It is not an MCP server.

## FAQ

**Is there an App Store Connect CLI / command-line tool?**
Yes — it bundles a self-contained CLI that calls the official App Store Connect
API and prints JSON, usable in Claude Code or as a plain command-line tool.

**Can an AI agent operate App Store Connect?**
Yes. The Claude Code agent turns plain-English requests into App Store Connect
API calls — metadata, reviews, reports, TestFlight, submit / release — with
confirmation required before any high-side-effect action.

**Does it use the App Store Connect API or browser automation?**
It calls Apple's official App Store Connect REST API directly (no Playwright or
scraping), authenticating with your own API key.

**Does it work in Codex, Cursor, Gemini CLI, or ChatGPT?**
Yes — it isn't locked to Claude Code. The catch is that it's CLI-backed: it needs
a host that runs the bundled CLI locally with your App Store Connect credentials,
so local agents (Codex CLI, Cursor, Gemini CLI) are the natural fit, while
cloud-sandboxed surfaces like the ChatGPT app would need the CLI and credentials
provisioned there. It is not an MCP server. See
[Using it outside Claude Code](#using-it-outside-claude-code).

**How is this different from Fastlane or the asc CLI?**
Reach for Fastlane or CI for a full build-and-release pipeline; reach for this
when you want an agent (or a quick CLI call) to operate App Store Connect
directly. See [How it compares](#how-it-compares).

**Is this official Apple software?**
No — independent and open-source, built on Apple's official API.

**Do I need to code?**
No — you ask in Claude Code; the skill calls the CLI.

**Where do my credentials go?**
The skill only reads them from environment variables — it never writes your key
to disk. You choose where the variables live; the **Credentials** section
recommends a git-safe spot.

**Can it fake reviews or change ratings?**
No — Apple's API only allows reading reviews and replying as the developer.

**Will it submit or release without asking?**
No — those actions require explicit confirmation.

## Project status

Early-stage and actively maintained. It leans on verifiable engineering signals
rather than social proof: it's generated from Apple's **official** API contract,
gated by a CI verification suite (contract, types, lint, tests), and
MIT-licensed. Built for real use today, with the scope above growing over time.

## Source & license

- **Source:** [App Store Connect Agent Skill on GitHub](https://github.com/sesamehut/appstore-connect-skill)
- **Marketplace:** <https://github.com/sesamehut/plugins-marketplace>
- **License:** [MIT](LICENSE) · Maintained by [Sesame Hut](https://sesamehut.studio)

Building the skill from source? See [`CLAUDE.md`](CLAUDE.md) and the design notes
under [`docs/`](docs/).
