---
name: app-store-connect
description: Operates Apple App Store Connect through a bundled CLI. Lists apps and App Store versions; reads and updates store metadata and localizations (description, keywords, what's new, promotional text, app name, subtitle, privacy policy); adds new locales; reads customer reviews and posts or replaces developer responses. Use when the user asks about App Store Connect, ASC, app metadata, store listings, localization, customer reviews, review replies, TestFlight, App Store reports, or screenshots.
compatibility: Requires Node.js >=22.12 and network access to api.appstoreconnect.apple.com. Runs in Claude Code on the user's machine.
---

# App Store Connect

All capabilities go through one CLI. Never call the ASC HTTP API directly;
run the CLI and parse its output.

```
node "${CLAUDE_SKILL_DIR}/../../../dist/cli/index.js" <domain> <verb> [flags]
```

Every command and subcommand answers `--help` with its exact flags. When in
doubt, ask the command itself.

## Capability boundary

**Works now:** `apps` (list/get), `versions` (list), `metadata` (app-level and
version-level localizations: list/get/update/add-locale), `reviews`
(list/get/get-response/respond), `doctor`, `capabilities`.

**Not implemented here yet** (the CLI answers these with exit code 5 and the
planned milestone): `reports` (M5), `media` / screenshots (M6), `testflight`
(M7). Tell the user the capability is planned, not that Apple lacks it.

**Not possible via Apple's API** (route the user to the App Store Connect
website): editing or deleting customer reviews or star ratings, App Review /
Resolution Center messages, agreements/tax/banking, creating or downloading
API keys.

Run `capabilities` for the authoritative machine-readable map — do not guess.

## One-time setup

Credentials come from environment variables; never write them to files in the
repository, and never echo private key content.

| Variable | Meaning |
| --- | --- |
| `ASC_KEY_ID` | App Store Connect API key ID (required) |
| `ASC_ISSUER_ID` | Issuer ID — set for team keys, omit for individual keys |
| `ASC_PRIVATE_KEY` | The .p8 private key content, inline PEM |
| `ASC_PRIVATE_KEY_PATH` | Path to the .p8 file (exactly one of the two key variables) |

Keys are created in App Store Connect → Users and Access → Integrations.

Build once after install or after CLI changes (paths are explicit so the
working directory never matters):

```
npm ci --prefix "${CLAUDE_SKILL_DIR}/../../.."
npm run build --prefix "${CLAUDE_SKILL_DIR}/../../.."
node "${CLAUDE_SKILL_DIR}/../../../dist/cli/index.js" doctor
```

`doctor` is offline and reports exactly what is missing and how to fix it.

## Reading output

- **stdout** carries only the JSON result envelope: `{ ok, command, data,
  pagination?, rateLimit?, resolved? }`. On failure stdout is empty — parse it
  only when the exit code is 0.
- **stderr** carries diagnostics: `error[<category>]: ...` followed by a
  `hint:` line with the next action.
- List reads default to a single page. `pagination.truncated: true` means more
  data exists — **always relay `truncated`/`total` honestly to the user**.
  Read more deliberately with `--all` or `--max-items N`.
- `resolved` reports intermediate resources the CLI picked for you (e.g. which
  appInfo a `metadata app` command targeted).

Exit codes:

| Code | Meaning | Next action |
| --- | --- | --- |
| 0 | success | parse stdout |
| 1 | unexpected failure | inspect stderr; report a bug |
| 2 | credentials / configuration | fix env vars; run `doctor` |
| 3 | ASC request error (auth, permission, not-found, invalid input, upstream, network) | read `error[<category>]` and the hint |
| 4 | rate limit (real 429 or proactive safety floor) | stop; wait or narrow the read |
| 5 | not implemented in this project yet | tell the user the planned milestone; do not retry |
| 6 | not supported by Apple's API | route the user to the ASC website |
| 64 | usage error | fix the command line per `--help` |

## Task routing

| Task | Command |
| --- | --- |
| Find an app | `apps list --bundle-id com.example.app` |
| Read app details | `apps get <appId>` |
| List versions / find the editable one | `versions list --app <appId> --state PREPARE_FOR_SUBMISSION` |
| Read version metadata for a locale | `metadata version get --version <versionId> --locale en-US` |
| List a version's locales | `metadata version list --version <versionId>` |
| Update store description / keywords / what's new | `metadata version update --version <versionId> --locale en-US --description "..."` |
| Update promotional text (works on the live version) | `metadata version update --version <versionId> --locale en-US --promotional-text "..."` |
| Add a language to a version | `metadata version add-locale --version <versionId> --locale fr-FR --description "..."` |
| Read app name / subtitle | `metadata app get --app <appId> --locale en-US` |
| Change app name / subtitle | `metadata app update --app <appId> --locale en-US --subtitle "..."` |
| Add an app-level language | `metadata app add-locale --app <appId> --locale fr-FR --name "..."` |
| List reviews | `reviews list --app <appId> --sort -createdDate` |
| Reviews still needing a reply | `reviews list --app <appId> --unanswered` |
| Read one review (with the reply) | `reviews get <reviewId> --include-response` |
| Read the existing reply | `reviews get-response --review <reviewId>` |
| Reply to a review (creates or replaces) | `reviews respond --review <reviewId> --body-file reply.txt` |

## Conventions

- Ids come from prior list commands; never invent them.
- Locales are BCP-47 (`en-US`, `de-DE`).
- For multi-line or quoted text, write it to a file and use `--from-json
  file.json` (metadata) or `--body-file file.txt` (review replies) instead of
  inline flags — this avoids shell quoting issues, especially on Windows.
- In `--from-json`, a JSON `null` clears a field; an omitted key leaves it
  unchanged.
- `metadata app` writes target the editable appInfo automatically; pass
  `--live` to read the live one, or `--app-info <id>` to target explicitly.
- Most version metadata is writable only while the version is editable
  (e.g. `PREPARE_FOR_SUBMISSION`); `promotional-text` is writable any time.
  A `STATE_ERROR` on exit 3 means the target was not editable.
- `reviews respond` replaces any existing response and publishes
  asynchronously (state starts as `PENDING_PUBLISH`).
