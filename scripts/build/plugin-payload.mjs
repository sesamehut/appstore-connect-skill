// Single source for every file the plugin payload contains. package-plugin.mjs
// imports these builders and writes their output by an EXPLICIT allow-list into
// the staging dir — it never globs or recursively copies the repo root, because
// the repo root physically holds a real AuthKey_*.p8 and .env.local (both
// gitignored but on disk). Enumerating the few generated files is the structural
// guarantee that no credential can ever be swept into the public plugin repo.

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

// The plugin REPOSITORY name carries the `-plugin` suffix (mirroring sonara's
// `sonara-plugin`), distinct from the short PLUGIN_NAME above.
export const PLUGIN_REPO = "appstore-connect-plugin";

// homepage/source target — the dedicated plugin repo on the sesamehut org, per
// the M8 decision (the lanvada homepage in sonara's own plugin.json is a
// personal-account leftover we deliberately do not follow).
export const PLUGIN_REPO_URL = `https://github.com/sesamehut/${PLUGIN_REPO}`;

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
    homepage: PLUGIN_REPO_URL,
  };
}

// The plugin repo is a GENERATED artifact: maintainers change the upstream
// development repo and re-run `npm run package:plugin`, never hand-edit here.
// Mirrors sonara-plugin/CLAUDE.md framing (what this repo is / generated /
// how to regenerate), in English (in-repo docs are English).
export const PLUGIN_CLAUDE_MD = `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this repo is

\`appstore-connect-plugin\` is the **distribution artifact** for the App Store
Connect skill: a Claude Code plugin that ships one self-contained CLI bundle
(\`cli/asc.mjs\`) plus the skill definition that drives it. It is installed into
Claude Code on the user's machine and run from there — it is not a development
checkout.

## This repo is GENERATED — do not hand-edit

Every file here (\`.claude-plugin/plugin.json\`, \`skills/${PLUGIN_NAME}/SKILL.md\`,
\`cli/asc.mjs\`, \`README.md\`, this \`CLAUDE.md\`, \`.gitignore\`) is produced by the
upstream development repo \`appstore-connect-skill\` via \`npm run package:plugin\`.
Editing files here directly will be overwritten on the next release and will
drift from the audited source.

To change anything: make the change upstream in \`appstore-connect-skill\`
(SKILL.md template, CLI source, README/CLAUDE generators, plugin.json content)
and re-run \`npm run package:plugin\`, then commit the regenerated payload here.

## Conventions

- The bundled CLI is self-contained: it inlines its runtime dependencies and
  needs no \`npm install\`. The only environment prerequisite is Node >=22.12 and
  network access to App Store Connect.
- The skill addresses the CLI via \`\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs\`; the
  installed plugin directory resolves \`\${CLAUDE_PLUGIN_ROOT}\` for you.
- Credentials are read from environment variables only; this repo must never
  contain a \`.p8\` key, a \`.env\` file, or any other credential (the \`.gitignore\`
  enforces this mechanically, and the upstream packaging step secret-scans the
  payload before it can be published).
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

Operate Apple **App Store Connect** from Claude Code. This plugin ships a
self-contained CLI plus a skill that drives it, so Claude can list apps, edit
store metadata and localizations, reply to customer reviews, download
sales / finance / analytics reports, manage screenshots and preview videos,
run TestFlight beta groups, builds, and feedback, and drive App Store
submission and release — all through natural-language tasks.

Claude Code only. Cross-tool support (Codex / Gemini) is not part of this
plugin.

## Prerequisites

- **Node.js >= 22.12** on your machine (\`node --version\`).
- **Network access** to \`api.appstoreconnect.apple.com\`.

That is all. The CLI is shipped as one self-contained bundle — there is **no
\`npm install\` step** and no other dependency to set up.

## Credentials

The skill authenticates with an App Store Connect API key, read from
environment variables (never written to disk by the skill):

| Variable | Meaning |
| --- | --- |
| \`ASC_KEY_ID\` | App Store Connect API key ID (required). |
| \`ASC_ISSUER_ID\` | Issuer ID — **required for team keys, omit for individual keys**. |
| \`ASC_PRIVATE_KEY\` | The \`.p8\` private-key content, inline PEM (use this **or** \`ASC_PRIVATE_KEY_PATH\`). |
| \`ASC_PRIVATE_KEY_PATH\` | Path to the \`.p8\` file (exactly one of the two key variables). |
| \`ASC_VENDOR_NUMBER\` | Optional; needed only for sales / finance report downloads (or pass \`--vendor\`). |

Create an API key in App Store Connect under **Users and Access ->
Integrations**; download the \`.p8\` file once (Apple does not let you re-download
it). The team-vs-individual distinction decides whether \`ASC_ISSUER_ID\` is
needed: team keys require it, individual keys do not. The vendor number is shown
in App Store Connect under **Payments and Financial Reports** — the API cannot
read it, so set it manually if you download sales/finance reports.

Set the variables in your shell before launching Claude Code, for example:

\`\`\`bash
export ASC_KEY_ID="ABCD1234EF"
export ASC_ISSUER_ID="11111111-2222-3333-4444-555555555555"   # team keys only
export ASC_PRIVATE_KEY_PATH="$HOME/.appstoreconnect/AuthKey_ABCD1234EF.p8"
\`\`\`

## Install

In Claude Code, run these two commands:

\`\`\`
/plugin marketplace add sesamehut/plugins-marketplace
/plugin install ${PLUGIN_NAME}@sesamehut-plugins
\`\`\`

Installation places the plugin's files; it does **not** install any
dependencies. The CLI bundle is self-contained, so once Node is present the
skill is ready to use. (If you have added the marketplace before, refresh it
first with \`/plugin marketplace update\`.)

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

\`\`\`
node "\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" doctor
\`\`\`

\`doctor\` is offline: it reports the Node version, that the bundle is intact,
and whether your credentials are configured — no request is made to Apple.

### Read-only vs. high-side-effect

- **Read-only and reversible tasks are safe to run** (listing apps, reading
  metadata, downloading reports, reading reviews and feedback).
- **High-side-effect actions require an explicit \`--force\` and cause real,
  externally visible changes.** Submitting a build or a version starts a real
  Apple review; releasing a version pushes it live immediately; expiring a build
  is irreversible; adding TestFlight testers emails real invitations. Claude
  asks before these — confirm the target with care, because they cannot be
  undone from here.

## Versioning

This plugin's version (\`${pkg.version}\`) is generated from the upstream
development repo and kept in lockstep with the CLI's own reported version
(\`node "\${CLAUDE_PLUGIN_ROOT}/cli/asc.mjs" --version\`).

## Maintainers

This repository is a generated artifact — do not hand-edit it. See
[CLAUDE.md](CLAUDE.md): change the upstream \`appstore-connect-skill\` repo and
re-run \`npm run package:plugin\` to regenerate the payload.
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
