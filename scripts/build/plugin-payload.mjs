// Single source for every file the plugin payload contains. package-plugin.mjs
// imports these builders and writes their output by an EXPLICIT allow-list into
// the committed plugin/ dir — it never globs or recursively copies the repo
// root, because the repo root physically holds a real AuthKey_*.p8 and
// .env.local (both gitignored but on disk). Enumerating the few generated files
// is the structural guarantee that no credential can ever be swept into the
// committed plugin/ payload.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
);

// The short product name (NOT the repo name `appstore-connect-plugin`): it is
// the plugin.json/marketplace `name` and the skills/<name>/ directory, mirroring
// sonara (plugin.json.name = `sonara`, repo = `sonara-plugin`).
export const PLUGIN_NAME = "app-store-connect";

// The development repo that owns source, docs, and tests. The plugin is
// distributed single-repo: the payload lives in this repo's committed `plugin/`
// subdirectory and the marketplace points at it via a git-subdir source — there
// is no separate `-plugin` repo. homepage therefore targets the dev repo (the
// lanvada homepage in sonara's own plugin.json is a personal-account leftover we
// deliberately do not follow).
export const SOURCE_REPO = "appstore-connect-skill";
export const SOURCE_REPO_URL = `https://github.com/sesamehut/${SOURCE_REPO}`;

async function packageJson() {
  return JSON.parse(
    await readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
}

// One user-facing capability sentence. Claude Code only — no cross-tool claims
// (Codex/Gemini are M9+, an explicit non-goal), and no over-promise beyond the
// frozen M7 capability surface.
export const PLUGIN_DESCRIPTION =
  "Operate Apple App Store Connect from Claude Code: list apps and versions, edit store metadata and localizations, reply to reviews, download sales/finance/analytics reports, manage screenshots, previews, TestFlight, builds, and App Store submission and release.";

// Author kept consistent with the repo's git identity and sonara's plugin.json
// (Zehua Hu / zehua.hu.cs@outlook.com), not a marketplace-owner address.
export const PLUGIN_AUTHOR = {
  name: "Zehua Hu",
  email: "zehua.hu.cs@outlook.com",
};

/**
 * plugin.json content. No `skills` field — Claude Code auto-discovers
 * skills/<name>/SKILL.md. version is derived from package.json so the four
 * version sources stay in lockstep (version:check guards it pre-publish).
 */
export async function buildPluginJson() {
  const pkg = await packageJson();
  return {
    name: PLUGIN_NAME,
    version: pkg.version,
    description: PLUGIN_DESCRIPTION,
    author: PLUGIN_AUTHOR,
    homepage: SOURCE_REPO_URL,
  };
}

// The plugin/ payload is a GENERATED artifact: maintainers change the source
// (SKILL template, CLI, generators) and re-run `npm run package:plugin`, never
// hand-edit the generated files. This CLAUDE.md ships inside the payload, so it
// is written to make sense to someone who sparse-checked out only plugin/.
export const PLUGIN_CLAUDE_MD = `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this directory.

## What this directory is

This is the **distribution payload** for the App Store Connect skill: a Claude
Code plugin that ships one self-contained CLI bundle (\`cli/asc.mjs\`) plus the
skill definition that drives it. It lives in the \`plugin/\` subdirectory of the
\`appstore-connect-skill\` repository, and the marketplace installs it from there
via a git-subdir source. It is what runs on the user's machine — not a
development checkout.

## This directory is GENERATED — do not hand-edit

Every file here (\`.claude-plugin/plugin.json\`, \`skills/${PLUGIN_NAME}/SKILL.md\`,
\`cli/asc.mjs\`, \`README.md\`, this \`CLAUDE.md\`, \`.gitignore\`, \`.gitattributes\`)
is produced from the surrounding \`appstore-connect-skill\` source by
\`npm run package:plugin\`. Editing a file here directly will be overwritten on the
next release and will drift from the audited source.

To change anything: edit the source (SKILL.md template, CLI source,
README/CLAUDE generators, plugin.json content) and re-run
\`npm run package:plugin\`, then commit the regenerated payload.

## Conventions

- The bundled CLI is self-contained: it inlines its runtime dependencies and
  needs no \`npm install\`. The only environment prerequisite is Node >=22.12 and
  network access to App Store Connect.
- The skill addresses the CLI via \`\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs\`; the
  installed plugin directory resolves \`\${CLAUDE_PLUGIN_ROOT}\` for you.
- Credentials are read from environment variables only; this payload must never
  contain a \`.p8\` key, a \`.env\` file, or any other credential (the \`.gitignore\`
  enforces this mechanically, and the packaging step secret-scans the payload
  before it can be committed).
`;

// `.gitignore` is the mechanical "no credentials in the repo" guard. It must
// always exclude node_modules and every credential form, plus personal/editor
// state, while keeping shared .claude/settings.json.
export const PLUGIN_GITIGNORE = `# Dependencies — the CLI bundle is self-contained; this repo never installs deps
node_modules/

# Secrets — App Store Connect API credentials must NEVER be committed here.
# This plugin reads credentials from environment variables only.
*.p8
*.pem
*.key
.env
.env.*

# Editor / OS
.DS_Store
Thumbs.db
*.swp
*.swo
.idea/
.vscode/

# Claude Code — ignore personal/local state, keep shared config (settings.json)
.claude/settings.local.json
.claude/projects/
.claude/plans/
.claude/stats-cache.json
.claude/worktrees/
`;

// `.gitattributes` pins LF on checkout for every platform so the bundled CLI's
// `#!/usr/bin/env node` shebang survives intact (the skill invokes it via
// `node`, but enforcing LF also stops noisy CRLF churn on Windows clones of a
// generated, byte-stable artifact).
export const PLUGIN_GITATTRIBUTES = `* text=auto eol=lf
`;

/**
 * The plugin README (English). The from-zero path: prerequisites -> credentials
 * -> install (the exact two marketplace commands, zero dependency install) ->
 * usage (natural-language tasks + doctor; read-only is safe, high-side-effect
 * verbs need --force and trigger real review/release). Install identifier is
 * derived from the in-repo marketplace.json: top-level name `sesamehut-plugins`,
 * so `${PLUGIN_NAME}@sesamehut-plugins`.
 */
export async function buildReadme() {
  const pkg = await packageJson();
  return `# App Store Connect plugin

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
| **Requires** | Node.js >= 22.12, an App Store Connect API key, network access to \`api.appstoreconnect.apple.com\` |
| **Install** | \`/plugin marketplace add sesamehut/plugins-marketplace\` -> \`/plugin install ${PLUGIN_NAME}@sesamehut-plugins\` |
| **Setup** | No \`npm install\` and nothing to build — the CLI is one self-contained bundle |
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

\`\`\`
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install ${PLUGIN_NAME}@sesamehut-plugins
\`\`\`

Installation just places the files — it does **not** run \`npm install\`. Once
Node 22.12+ is present and credentials are set, the skill is ready. (Added the
marketplace before? Refresh it with \`/plugin marketplace update\`.)

## Credentials

Create an API key in App Store Connect under **Users and Access ->
Integrations** and download the \`.p8\` file (Apple lets you download it only
once). Set these environment variables before launching Claude Code — the skill
reads them from the environment and never writes your key to disk:

| Variable | Meaning |
| --- | --- |
| \`ASC_KEY_ID\` | API key ID (**required**). |
| \`ASC_ISSUER_ID\` | Issuer ID — **required for team keys, omit for individual keys**. |
| \`ASC_PRIVATE_KEY\` *or* \`ASC_PRIVATE_KEY_PATH\` | The \`.p8\` contents inline, **or** the path to the \`.p8\` file. |
| \`ASC_VENDOR_NUMBER\` | Optional; only for sales / finance reports (shown under **Payments and Financial Reports**; the API cannot read it). |

\`\`\`bash
export ASC_KEY_ID="ABCD1234EF"
export ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"   # team keys only
export ASC_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/AuthKey_ABCD1234EF.p8"
\`\`\`

Verify the setup offline — ask Claude to run the self-check, or run it directly:

\`\`\`
node "\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" doctor
\`\`\`

\`doctor\` reports the Node version, that the bundle is intact, and whether your
credentials are configured — no request is made to Apple.

## Safety

- **Read-only and reversible tasks run freely** (listing apps, reading metadata,
  downloading reports, reading reviews and feedback).
- **High-side-effect actions require an explicit \`--force\` and are confirmed
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

- Version \`${pkg.version}\`, kept in lockstep with the CLI's own
  \`node "\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" --version\`.
- Source & docs: <${SOURCE_REPO_URL}> · License: MIT · Maintained by Sesame Hut.
- This directory is a **generated artifact** — do not hand-edit it (see
  [CLAUDE.md](CLAUDE.md)); it is produced from the \`${SOURCE_REPO}\` source by
  \`npm run package:plugin\`.
`;
}

// Credential markers the secret-scan rejects. (a) filename patterns; (b) a
// COMPLETE PEM private-key block (begin AND matching end delimiter).
//
// WHY a full block, not a bare header: the shipped jose library legitimately
// contains the literal `-----BEGIN PRIVATE KEY-----` in its PKCS8 import path
// (it checks for that header). A bare-header substring scan would flag that
// audited library code as a credential. A REAL leaked key is always a fully
// delimited block — a `-----BEGIN <kind> PRIVATE KEY-----` header AND a matching
// `-----END <kind> PRIVATE KEY-----` footer wrapping base64 material — so we
// require both delimiters: a real .p8/.pem trips it, the header-only literal
// (no END footer) does not.
const FORBIDDEN_NAME = /(\.p8$|\.pem$|\.key$|(^|\.)env($|\.))/i;
const PEM_KEY_KINDS = ["", "RSA ", "EC ", "OPENSSH ", "PGP "];
const PEM_KEY_BLOCKS = PEM_KEY_KINDS.map((kind) => ({
  begin: `-----BEGIN ${kind}PRIVATE KEY-----`,
  end: `-----END ${kind}PRIVATE KEY-----`,
}));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * Scan every file under `dir` for credential markers. Returns an array of
 * human-readable hit descriptions (empty == clean). Shared by the packaging
 * gate and its negative test so both exercise identical detection logic.
 */
export async function scanForSecrets(dir) {
  const hits = [];
  const files = await walk(dir);
  for (const file of files) {
    if (FORBIDDEN_NAME.test(path.basename(file))) {
      hits.push(`forbidden filename: ${path.relative(repoRoot, file)}`);
    }
    const content = await readFile(file, "utf8").catch(() => "");
    for (const { begin, end } of PEM_KEY_BLOCKS) {
      if (content.includes(begin) && content.includes(end)) {
        hits.push(
          `private-key block (${begin} ... ${end}) inside ${path.relative(repoRoot, file)}`,
        );
      }
    }
  }
  return { hits, scanned: files.length };
}
