import { defineCommand } from "citty";

import {
  createAppInfoLocalization,
  listAppInfoLocalizations,
  updateAppInfoLocalization,
} from "../../capabilities/app-info-localizations.js";
import type {
  AppInfoLocalizationCreateAttributes,
  AppInfoLocalizationUpdateAttributes,
  ListAppInfoLocalizationsOptions,
} from "../../capabilities/app-info-localizations.js";
import { listAppInfos } from "../../capabilities/app-infos.js";
import { AscNotFoundError } from "../../errors.js";
import { cliContextOf } from "../context.js";
import type { CliContext } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";
import {
  attributeArgs,
  collectAttributes,
  fromJsonArg,
  requireLocaleMatch,
} from "./metadata-shared.js";
import type { AttributeSpec } from "./metadata-shared.js";

const APP_FIELD_SPECS: readonly AttributeSpec[] = [
  { flag: "name", attribute: "name", description: "The app's store name" },
  {
    flag: "subtitle",
    attribute: "subtitle",
    description: "The app's store subtitle",
  },
  {
    flag: "privacy-policy-url",
    attribute: "privacyPolicyUrl",
    description: "Privacy policy URL",
  },
  {
    flag: "privacy-policy-text",
    attribute: "privacyPolicyText",
    description: "Privacy policy text (Apple TV only)",
  },
  {
    flag: "privacy-choices-url",
    attribute: "privacyChoicesUrl",
    description: "Privacy choices URL",
  },
];

/**
 * AppInfo state preference orders for the editable draft vs the live record.
 * These pick a candidate; they do not gate writes — ASC remains the authority
 * on what is editable, and a wrong pick surfaces as a normalized 409.
 */
const EDITABLE_STATES = [
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
] as const;
const LIVE_STATES = [
  "READY_FOR_DISTRIBUTION",
  "ACCEPTED",
  "PENDING_RELEASE",
] as const;

const targetArgs = {
  app: {
    type: "string",
    valueHint: "appId",
    description: "The app's ASC id; the appInfo is resolved automatically",
  },
  live: {
    type: "boolean",
    description: "Target the live appInfo instead of the editable draft",
  },
  "app-info": {
    type: "string",
    valueHint: "appInfoId",
    description: "Target a specific appInfo id, bypassing resolution",
  },
} as const;

const localeArg = {
  locale: {
    type: "string",
    required: true,
    valueHint: "en-US",
    description: "The localization's locale (BCP-47)",
  },
} as const;

interface ResolvedAppInfo {
  readonly id: string;
  readonly state?: string;
}

// `| undefined` is explicit because citty's parsed args carry undefined as a
// value, which exactOptionalPropertyTypes keeps distinct from absence.
interface TargetFlags {
  readonly app?: string | undefined;
  readonly live?: boolean | undefined;
  readonly "app-info"?: string | undefined;
}

async function resolveAppInfo(
  cli: CliContext,
  flags: TargetFlags,
): Promise<ResolvedAppInfo> {
  const explicit = flags["app-info"];
  if (explicit !== undefined) {
    return { id: explicit };
  }
  const appId = flags.app;
  if (appId === undefined) {
    throw new CliUsageError(
      "Pass --app <appId> (the appInfo is resolved automatically) or --app-info <id>.",
    );
  }
  const read = await listAppInfos(await cli.client(), appId, {
    scope: "all-pages",
    fields: ["state"],
  });
  const preferences: readonly string[] =
    flags.live === true ? LIVE_STATES : EDITABLE_STATES;
  for (const state of preferences) {
    const match = read.items.find((info) => info.attributes?.state === state);
    if (match !== undefined) {
      return { id: match.id, state };
    }
  }
  const seen = read.items
    .map((info) => `${info.id} [${info.attributes?.state ?? "?"}]`)
    .join(", ");
  throw new AscNotFoundError(
    `No ${flags.live === true ? "live" : "editable"} appInfo found for app ${appId} (candidates: ${
      seen === "" ? "none" : seen
    }). Pass --app-info <id> to target one explicitly.`,
  );
}

function resolvedBlock(info: ResolvedAppInfo): Record<string, unknown> {
  return {
    appInfo: info.id,
    ...(info.state !== undefined && { appInfoState: info.state }),
  };
}

const ADD_COMMAND = "asc metadata app add-locale";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List app-level localizations (name, subtitle, privacy)",
  },
  args: {
    ...targetArgs,
    locale: {
      type: "string",
      valueHint: "en-US,de-DE",
      description: "Filter by locale (comma-separated)",
    },
    fields: {
      type: "string",
      valueHint: "locale,name,subtitle",
      description: "Sparse field selection (comma-separated)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const info = await resolveAppInfo(cli, ctx.args);
    const locale = csvList(ctx.args.locale);
    const fields = csvList(
      ctx.args.fields,
    ) as ListAppInfoLocalizationsOptions["fields"];

    const read = await listAppInfoLocalizations(await cli.client(), info.id, {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(locale !== undefined && { locale }),
      ...(fields !== undefined && { fields }),
    });
    emitResult(
      cli.io,
      listEnvelope("metadata app list", read, scope, resolvedBlock(info)),
    );
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one locale's app-level metadata",
  },
  args: { ...targetArgs, ...localeArg },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const info = await resolveAppInfo(cli, ctx.args);
    const read = await listAppInfoLocalizations(await cli.client(), info.id, {
      scope: "all-pages",
    });
    const localization = requireLocaleMatch(
      read.items,
      ctx.args.locale,
      ADD_COMMAND,
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "metadata app get",
        { data: localization },
        {
          resolved: {
            ...resolvedBlock(info),
            appInfoLocalization: localization.id,
          },
        },
      ),
    );
  },
});

const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update one locale's app-level metadata",
  },
  args: {
    ...targetArgs,
    ...localeArg,
    ...attributeArgs(APP_FIELD_SPECS),
    ...fromJsonArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // Keys are validated against APP_FIELD_SPECS at runtime; the cast marks
    // the typed-contract boundary.
    const attributes = (await collectAttributes(
      ctx.args,
      APP_FIELD_SPECS,
    )) as AppInfoLocalizationUpdateAttributes;
    const info = await resolveAppInfo(cli, ctx.args);
    const read = await listAppInfoLocalizations(await cli.client(), info.id, {
      scope: "all-pages",
    });
    const localization = requireLocaleMatch(
      read.items,
      ctx.args.locale,
      ADD_COMMAND,
    );
    const document = await updateAppInfoLocalization(
      await cli.client(),
      localization.id,
      attributes,
    );
    emitResult(
      cli.io,
      documentEnvelope("metadata app update", document, {
        resolved: {
          ...resolvedBlock(info),
          appInfoLocalization: localization.id,
        },
      }),
    );
  },
});

const addLocaleCommand = defineCommand({
  meta: {
    name: "add-locale",
    description: "Add a language to the app-level metadata (--name required)",
  },
  args: {
    ...targetArgs,
    ...localeArg,
    ...attributeArgs(APP_FIELD_SPECS),
    ...fromJsonArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const attributes = await collectAttributes(ctx.args, APP_FIELD_SPECS, {
      allowEmpty: true,
    });
    if (typeof attributes.name !== "string") {
      throw new CliUsageError(
        "Adding an app-level locale requires --name (ASC mandates a store name per locale).",
      );
    }
    const info = await resolveAppInfo(cli, ctx.args);
    const document = await createAppInfoLocalization(
      await cli.client(),
      info.id,
      {
        ...attributes,
        locale: ctx.args.locale,
      } as AppInfoLocalizationCreateAttributes,
    );
    emitResult(
      cli.io,
      documentEnvelope("metadata app add-locale", document, {
        resolved: resolvedBlock(info),
      }),
    );
  },
});

export const metadataAppCommand = defineCommand({
  meta: {
    name: "app",
    description:
      "App-level metadata: name, subtitle, privacy policy (not tied to a version)",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    update: updateCommand,
    "add-locale": addLocaleCommand,
  },
});
