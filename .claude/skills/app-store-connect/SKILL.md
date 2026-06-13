---
name: app-store-connect
description: Operates Apple App Store Connect through a bundled CLI. Lists apps and App Store versions; reads and updates store metadata and localizations (description, keywords, what's new, promotional text, app name, subtitle, privacy policy); adds new locales; reads customer reviews and posts or replaces developer responses; downloads sales, finance, and analytics reports to disk; uploads, lists, reorders, and deletes App Store screenshots and preview videos; manages TestFlight beta groups, testers, test info, beta review detail and submission, and reads/downloads beta feedback; lists builds, resolves the latest processed build, edits build distribution and notes, and expires builds. Use when the user asks about App Store Connect, ASC, app metadata, store listings, localization, customer reviews, review replies, sales or download numbers, finance reports, analytics, TestFlight, beta testers, beta groups, beta feedback, builds, App Store reports, screenshots, or preview videos.
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
(list/get/get-response/respond), `reports` (sales/finance downloads, the
analytics report lifecycle and downloads), `media` (screenshots and preview
videos: list-sets/list/upload/upload-set/delete/delete-set/reorder/status),
`testflight` (`groups`
list/get/create/update/delete/testers/add-testers/remove-testers/builds/public-link/criteria/criteria-build-check;
`testers` list/get/create/bulk-add/delete/remove-from-app; `test-info`
list/set/delete; `review-detail` get/set; `feedback`
list-crashes/list-screenshots/get-crash/get-screenshot/download), `builds`
(list/get/latest/expire; `beta-detail` get/set; `notes` list/set/delete;
`review` status/submit; `groups` add/remove; `testers` list/add/remove;
`pre-release-versions` list), `doctor`, `capabilities`.

**Not implemented here yet** (the CLI answers these with exit code 5 and the
planned milestone): `submission` — preparing an App Store version for review
and release (M7). Tell the user the capability is planned, not that Apple
lacks it.

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
| `ASC_VENDOR_NUMBER` | Optional; needed for sales/finance report downloads (or pass `--vendor`) |

Keys are created in App Store Connect → Users and Access → Integrations. The
vendor number is shown in App Store Connect → Payments and Financial Reports;
the API cannot read it.

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
| Download a day's sales report | `reports sales download --date 2026-06-10` |
| Download a monthly finance report | `reports finance download --region ZZ --date 2026-05` |
| Set up analytics reports (one-time) | `reports analytics ensure-request --app <appId>` |
| See which analytics reports exist | `reports analytics list-reports --request <requestId>` |
| Download an analytics report | `reports analytics download --app <appId> --name "App Downloads Standard"` |
| Upload one screenshot | `media screenshots upload --version <versionId> --locale en-US --display-type APP_IPHONE_67 --file shot.png` |
| Upload a folder of screenshots | `media screenshots upload-set --version <versionId> --locale en-US --display-type APP_IPHONE_67 --dir ./shots --reorder` |
| List a version's screenshot sets | `media screenshots list-sets --version <versionId> --locale en-US` |
| List a set's screenshots | `media screenshots list --set <setId>` |
| Reorder a set | `media screenshots reorder --set <setId> --order id1,id2,id3` |
| Remove a screenshot / clear a stuck upload | `media screenshots delete <screenshotId>` |
| Check a screenshot's processing | `media screenshots status <screenshotId> --wait` |
| Upload one preview video | `media previews upload --version <versionId> --locale en-US --preview-type IPHONE_67 --file clip.mov` |
| List beta groups | `testflight groups list --app <appId>` |
| Read one beta group | `testflight groups get <groupId> --include app,builds,betaTesters` |
| Create a beta group | `testflight groups create --app <appId> --name "Internal" --internal` |
| Update a beta group | `testflight groups update <groupId> --name "..." --feedback` |
| Delete a beta group | `testflight groups delete <groupId> --force` |
| List a group's testers | `testflight groups testers <groupId>` |
| Add testers to a group (emails invites) | `testflight groups add-testers <groupId> --testers id1,id2 --force` |
| Remove testers from a group | `testflight groups remove-testers <groupId> --testers id1,id2 --force` |
| List a group's builds | `testflight groups builds <groupId>` |
| Enable/disable a public link (exposes the app) | `testflight groups public-link <groupId> --enable --force` |
| Read/set/clear recruitment criteria | `testflight groups criteria set <groupId> --filter IPHONE:15.0:17.0` |
| List the recruitment-criteria matrix | `testflight groups criteria options` |
| Preflight a group's compatible build | `testflight groups criteria-build-check <groupId>` |
| List beta testers | `testflight testers list --app <appId>` |
| Read one tester | `testflight testers get <testerId> --include apps,betaGroups` |
| Create a tester (may email an invite) | `testflight testers create --email a@x.com --group <groupId> --force` |
| Add many testers by email to a group | `testflight testers bulk-add --group <groupId> --emails-file emails.txt --force` |
| Delete a tester (account level) | `testflight testers delete <testerId> --force` |
| Remove a tester from apps | `testflight testers remove-from-app <testerId> --app id1,id2 --force` |
| List app-level TestFlight metadata | `testflight test-info list --app <appId>` |
| Set TestFlight metadata for a locale | `testflight test-info set --app <appId> --locale en-US --description "..."` |
| Delete a TestFlight metadata locale | `testflight test-info delete <localizationId> --force` |
| Read beta review contact/demo info | `testflight review-detail get --app <appId>` |
| Set beta review contact/demo info | `testflight review-detail set <detailId> --contact-email a@x.com` |
| List crash feedback | `testflight feedback list-crashes --app <appId>` |
| List screenshot feedback | `testflight feedback list-screenshots --app <appId>` |
| Read one crash (with the log text) | `testflight feedback get-crash --id <submissionId> --with-log` |
| Read one screenshot submission | `testflight feedback get-screenshot --id <submissionId>` |
| Download feedback attachments to disk | `testflight feedback download --app <appId> --kind both --output ./feedback` |
| List builds | `builds list --app <appId> --processing-state VALID` |
| Read one build | `builds get <buildId> --include preReleaseVersion` |
| Resolve the latest processed build | `builds latest --app <appId>` |
| Expire a build (irreversible) | `builds expire <buildId> --force` |
| Read a build's beta states | `builds beta-detail get <buildId>` |
| Set a build's auto-notify | `builds beta-detail set <buildId> --auto-notify true` |
| List/set a build's "what to test" notes | `builds notes set <buildId> --locale en-US --whats-new "..."` |
| Delete a build note locale | `builds notes delete <localizationId> --force` |
| Read a build's beta review status | `builds review status <buildId>` |
| Submit a build for beta review (real review) | `builds review submit <buildId> --force` |
| Distribute a build to groups | `builds groups add <buildId> --group id1,id2 --force` |
| Stop distributing a build to groups | `builds groups remove <buildId> --group id1,id2 --force` |
| List/add/remove a build's individual testers | `builds testers add <buildId> --tester id1,id2 --force` |
| List pre-release (train) versions | `builds pre-release-versions list --app <appId>` |

`media previews` mirrors `media screenshots`, swapping `--display-type` for
`--preview-type` (and `upload` adds optional `--mime-type` / `--frame-time-code`).

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
- Report downloads write files to disk; the envelope's `data.file` (or
  `data.segments` for analytics) carries the path, row count, and headers —
  always relay the on-disk path to the user. `--format json` additionally
  writes a JSON conversion next to the raw TSV/CSV.
- Sales/finance `--output` is a single **file path**, not a folder; omit it to
  auto-name the file in the working directory, or pass a full path to place it.
  Analytics `download` instead takes `--output-dir` (a folder for its segment
  files). To drop a sales/finance report into a specific folder, join your own
  filename onto that folder for `--output`.
- The sales `--date` format follows `--frequency`: DAILY/WEEKLY use
  YYYY-MM-DD (weekly = the week's closing date), MONTHLY uses YYYY-MM,
  YEARLY uses YYYY; omit the date for the latest report. The finance `--date`
  is Apple's FISCAL month (YYYY-MM), which shifts against the calendar.
- Analytics reports need a one-time `ensure-request` per app; Apple generates
  the first data 1-2 days later (the catalog of report names appears
  immediately, dated instances follow). If `list-requests` shows
  `stoppedDueToInactivity: true`, run `ensure-request` again — it creates a
  fresh request and reports the stopped ones.
- A sales/finance 404 usually means the report does not exist for that
  date/frequency (timing or no activity), not a wrong id — the error message
  carries the availability rules.
- `media` upload addresses a localization by `--version <id> --locale <code>`;
  the CLI resolves it and finds-or-creates the set for the `--display-type` /
  `--preview-type` (`resolved.setCreated` reports which). `--display-type` and
  `--preview-type` are device classes (run `--help` for the list); the values
  are the same ones Apple's API uses.
- Upload reserves, transfers the bytes to Apple's short-lived signed URL
  (never logged, never in the envelope), commits a checksum, then blocks until
  Apple finishes processing. `--no-wait` returns right after the commit;
  `status <id>` (optionally `--wait`) resumes the check. A poll timeout is a
  success with `resolved.pollTimedOut: true`, not a failure — the bytes are up.
- Upload **appends** to a set (Apple allows several per device class); it does
  not replace. `upload-set` uploads a folder in filename order and, with
  `--reorder`, makes that batch lead the set. Remove extras or a stuck
  reservation with `delete`.
- A `file-processing` exit 3 names the stage in stderr: `transfer` (the PUT
  failed — re-run for fresh upload URLs), `commit` (checksum rejected), or
  `processing` (Apple rejected the asset's dimensions/format — the state
  errors say why). `delete-set` needs `--force` when the set still holds assets.
- **TestFlight invitations are real emails.** `testflight groups add-testers`,
  `testflight testers create --group`, `testflight testers bulk-add`, and
  `builds testers add` email real TestFlight invitations to real people. They
  all require `--force`. Confirm the recipients with the user first; an invite
  cannot be unsent.
- **Submitting a build for beta review triggers a real Apple review.**
  `builds review submit <buildId> --force` starts an external TestFlight beta
  review; the submission **cannot be patched or deleted** (a rejection needs a
  fresh submit). Never run it speculatively.
- **`builds expire` is irreversible.** Apple's API has no un-expire; an expired
  build leaves testing for good. Requires `--force`.
- **Enabling a public link exposes the app.** `testflight groups public-link
  --enable` (and `create --public-link`) opens public external recruitment — a
  real exposure, no per-person email — and requires `--force`.
- **Destructive deletes/removes need `--force`,** raised as a usage error (exit
  64) before any request: `groups delete`, `groups remove-testers`, `testers
  delete`, `testers remove-from-app`, `test-info delete`, `notes delete`,
  `groups criteria clear`, `builds groups remove`, `builds testers remove`,
  `builds expire`.
- **Feedback download writes files to disk and the path is relayed.**
  `testflight feedback download --output <dir>` writes crash logs and
  screenshots into the directory; the envelope's `data.submissions[].savedFiles`
  carries the on-disk paths — relay them to the user. Downloads continue on
  error (an expired signed URL records an item-level `error` and the batch
  proceeds).
- **The envelope never contains a signed attachment URL.** Screenshot feedback
  carries short-lived signed URLs that are secrets; the CLI fetches the bytes
  for you (`download`) and only ever reports on-disk paths, byte counts,
  width/height, `expirationDate`, and a de-queried `sanitizedUrl`. Never try to
  fetch a signed URL yourself — use `download`.
- TestFlight reads default to a single page like every list; relay
  `pagination.truncated`/`total` honestly. A not-found on
  `testflight review-detail get` means no beta review detail exists for that app
  yet, not a wrong id.
- A group's `--internal`/`--all-builds` are fixed at creation; `groups update`
  rejects them (exit 64). Recruitment `--filter` is
  `deviceFamily:minOs:maxOs` (OS bounds optional), repeatable; run
  `testflight groups criteria options` for the legal device-family/OS matrix.
