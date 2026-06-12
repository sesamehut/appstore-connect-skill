import { defineCommand } from "citty";

import {
  createAppStoreVersionLocalization,
  getAppStoreVersionLocalization,
  listAppStoreVersionLocalizations,
  updateAppStoreVersionLocalization,
} from "../../capabilities/app-store-version-localizations.js";
import type {
  AppStoreVersionLocalizationUpdateAttributes,
  ListAppStoreVersionLocalizationsOptions,
} from "../../capabilities/app-store-version-localizations.js";
import { cliContextOf } from "../context.js";
import type { CliContext } from "../context.js";
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

const VERSION_FIELD_SPECS: readonly AttributeSpec[] = [
  {
    flag: "description",
    attribute: "description",
    description: "The store description",
  },
  {
    flag: "keywords",
    attribute: "keywords",
    description: "Search keywords (one comma-separated string)",
  },
  {
    flag: "whats-new",
    attribute: "whatsNew",
    description: "Release notes (rejected on an app's first version)",
  },
  {
    flag: "promotional-text",
    attribute: "promotionalText",
    description: "Promotional text (editable in any version state)",
  },
  {
    flag: "support-url",
    attribute: "supportUrl",
    description: "Support page URL",
  },
  {
    flag: "marketing-url",
    attribute: "marketingUrl",
    description: "Marketing page URL",
  },
];

const versionArg = {
  version: {
    type: "string",
    required: true,
    valueHint: "versionId",
    description: "The App Store version's ASC id (from 'asc versions list')",
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

const ADD_COMMAND = "asc metadata version add-locale";

async function resolveLocalization(
  cli: CliContext,
  versionId: string,
  locale: string,
): Promise<{
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}> {
  const read = await listAppStoreVersionLocalizations(
    await cli.client(),
    versionId,
    {
      scope: "all-pages",
    },
  );
  return requireLocaleMatch(read.items, locale, ADD_COMMAND);
}

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List a version's localizations (locales and copy)",
  },
  args: {
    ...versionArg,
    locale: {
      type: "string",
      valueHint: "en-US,de-DE",
      description: "Filter by locale (comma-separated)",
    },
    fields: {
      type: "string",
      valueHint: "locale,description",
      description: "Sparse field selection (comma-separated)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    const locale = csvList(ctx.args.locale);
    const fields = csvList(
      ctx.args.fields,
    ) as ListAppStoreVersionLocalizationsOptions["fields"];

    const read = await listAppStoreVersionLocalizations(
      await cli.client(),
      ctx.args.version,
      {
        scope,
        ...(pageLimit !== undefined && { pageLimit }),
        ...(locale !== undefined && { locale }),
        ...(fields !== undefined && { fields }),
      },
    );
    emitResult(cli.io, listEnvelope("metadata version list", read, scope));
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one locale's version metadata",
  },
  args: { ...versionArg, ...localeArg },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const localization = await resolveLocalization(
      cli,
      ctx.args.version,
      ctx.args.locale,
    );
    emitResult(
      cli.io,
      documentEnvelope(
        "metadata version get",
        { data: localization },
        {
          resolved: { appStoreVersionLocalization: localization.id },
        },
      ),
    );
  },
});

const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Update one locale's version metadata",
  },
  args: {
    ...versionArg,
    ...localeArg,
    ...attributeArgs(VERSION_FIELD_SPECS),
    ...fromJsonArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    // Keys are validated against VERSION_FIELD_SPECS at runtime; the cast
    // marks the typed-contract boundary.
    const attributes = (await collectAttributes(
      ctx.args,
      VERSION_FIELD_SPECS,
    )) as AppStoreVersionLocalizationUpdateAttributes;
    const localization = await resolveLocalization(
      cli,
      ctx.args.version,
      ctx.args.locale,
    );
    const document = await updateAppStoreVersionLocalization(
      await cli.client(),
      localization.id,
      attributes,
    );
    emitResult(
      cli.io,
      documentEnvelope("metadata version update", document, {
        resolved: { appStoreVersionLocalization: localization.id },
      }),
    );
  },
});

const addLocaleCommand = defineCommand({
  meta: {
    name: "add-locale",
    description: "Add a language to a version (optionally with initial copy)",
  },
  args: {
    ...versionArg,
    ...localeArg,
    ...attributeArgs(VERSION_FIELD_SPECS),
    ...fromJsonArg,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const attributes = await collectAttributes(ctx.args, VERSION_FIELD_SPECS, {
      allowEmpty: true,
    });
    const document = await createAppStoreVersionLocalization(
      await cli.client(),
      ctx.args.version,
      {
        ...attributes,
        locale: ctx.args.locale,
      },
    );
    emitResult(
      cli.io,
      documentEnvelope("metadata version add-locale", document),
    );
  },
});

const getRawCommand = defineCommand({
  meta: {
    name: "get-by-id",
    description: "Read one localization directly by its ASC id",
    hidden: true,
  },
  args: {
    localizationId: {
      type: "positional",
      required: true,
      description: "The localization's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await getAppStoreVersionLocalization(
      await cli.client(),
      ctx.args.localizationId,
    );
    emitResult(
      cli.io,
      documentEnvelope("metadata version get-by-id", document),
    );
  },
});

export const metadataVersionCommand = defineCommand({
  meta: {
    name: "version",
    description:
      "Version-level metadata: description, keywords, what's new, promotional text, URLs",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    update: updateCommand,
    "add-locale": addLocaleCommand,
    "get-by-id": getRawCommand,
  },
});
