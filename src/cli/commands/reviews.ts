import { readFile } from "node:fs/promises";

import { defineCommand } from "citty";

import {
  getCustomerReview,
  getCustomerReviewResponse,
  listCustomerReviewsForApp,
  listCustomerReviewsForVersion,
  setCustomerReviewResponse,
} from "../../capabilities/customer-reviews.js";
import type { ListCustomerReviewsOptions } from "../../capabilities/customer-reviews.js";
import { cliContextOf } from "../context.js";
import { CliUsageError } from "../exit-codes.js";
import { documentEnvelope, emitResult, listEnvelope } from "../output.js";
import {
  csvList,
  readScopeArgs,
  resolvePageLimit,
  resolveReadScope,
} from "../read-scope.js";

const listCommand = defineCommand({
  meta: {
    name: "list",
    description: "List customer reviews for an app or a version",
  },
  args: {
    app: {
      type: "string",
      valueHint: "appId",
      description: "List reviews across the app (exclusive with --version)",
    },
    version: {
      type: "string",
      valueHint: "versionId",
      description: "List reviews for one version (exclusive with --app)",
    },
    rating: {
      type: "string",
      valueHint: "1,2",
      description: "Filter by star rating (comma-separated, 1-5)",
    },
    territory: {
      type: "string",
      valueHint: "USA,DEU",
      description: "Filter by storefront territory (comma-separated)",
    },
    unanswered: {
      type: "boolean",
      description: "Only reviews without a published developer response",
    },
    answered: {
      type: "boolean",
      description: "Only reviews with a published developer response",
    },
    sort: {
      type: "string",
      valueHint: "-createdDate",
      description: "Sort: rating, -rating, createdDate, -createdDate",
    },
    fields: {
      type: "string",
      valueHint: "rating,title,body",
      description: "Sparse field selection (comma-separated)",
    },
    ...readScopeArgs,
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const { app, version } = ctx.args;
    if ((app === undefined) === (version === undefined)) {
      throw new CliUsageError(
        "Pass exactly one of --app <appId> or --version <versionId>.",
      );
    }
    if (ctx.args.unanswered === true && ctx.args.answered === true) {
      throw new CliUsageError(
        "--unanswered and --answered are mutually exclusive.",
      );
    }
    const scope = resolveReadScope(ctx.args);
    const pageLimit = resolvePageLimit(ctx.args);
    // CLI inputs are user strings; ASC validates the values — the casts mark
    // the typed-contract boundary.
    const rating = csvList(ctx.args.rating);
    const territory = csvList(
      ctx.args.territory,
    ) as ListCustomerReviewsOptions["territory"];
    const sort = csvList(ctx.args.sort) as ListCustomerReviewsOptions["sort"];
    const fields = csvList(
      ctx.args.fields,
    ) as ListCustomerReviewsOptions["fields"];

    const options: ListCustomerReviewsOptions = {
      scope,
      ...(pageLimit !== undefined && { pageLimit }),
      ...(rating !== undefined && { rating }),
      ...(territory !== undefined && { territory }),
      ...(ctx.args.unanswered === true && { hasPublishedResponse: false }),
      ...(ctx.args.answered === true && { hasPublishedResponse: true }),
      ...(sort !== undefined && { sort }),
      ...(fields !== undefined && { fields }),
    };
    const client = await cli.client();
    const read =
      app !== undefined
        ? await listCustomerReviewsForApp(client, app, options)
        : version !== undefined
          ? await listCustomerReviewsForVersion(client, version, options)
          : // Unreachable: the exactly-one validation above already threw.
            await Promise.reject(
              new CliUsageError(
                "Pass exactly one of --app <appId> or --version <versionId>.",
              ),
            );
    emitResult(cli.io, listEnvelope("reviews list", read, scope));
  },
});

const getCommand = defineCommand({
  meta: {
    name: "get",
    description: "Read one customer review by its ASC id",
  },
  args: {
    reviewId: {
      type: "positional",
      required: true,
      description: "The review's ASC id (from 'asc reviews list')",
    },
    "include-response": {
      type: "boolean",
      description: "Include the developer response in the document",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await getCustomerReview(
      await cli.client(),
      ctx.args.reviewId,
      {
        ...(ctx.args["include-response"] === true && {
          include: ["response" as const],
        }),
      },
    );
    emitResult(cli.io, documentEnvelope("reviews get", document));
  },
});

const getResponseCommand = defineCommand({
  meta: {
    name: "get-response",
    description:
      "Read the developer response to a review (not-found means no response yet)",
  },
  args: {
    review: {
      type: "string",
      required: true,
      valueHint: "reviewId",
      description: "The review's ASC id",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const document = await getCustomerReviewResponse(
      await cli.client(),
      ctx.args.review,
    );
    emitResult(cli.io, documentEnvelope("reviews get-response", document));
  },
});

const respondCommand = defineCommand({
  meta: {
    name: "respond",
    description:
      "Post the developer response to a review, replacing any existing one (publication is asynchronous)",
  },
  args: {
    review: {
      type: "string",
      required: true,
      valueHint: "reviewId",
      description: "The review's ASC id",
    },
    body: {
      type: "string",
      description: "Response text (exclusive with --body-file)",
    },
    "body-file": {
      type: "string",
      valueHint: "reply.txt",
      description:
        "File whose content is sent verbatim as the response (for multi-line text)",
    },
  },
  async run(ctx) {
    const cli = cliContextOf(ctx.data);
    const inline = ctx.args.body;
    const fromFile = ctx.args["body-file"];
    if (inline !== undefined && fromFile !== undefined) {
      throw new CliUsageError(
        "Pass exactly one of --body <text> or --body-file <file>.",
      );
    }
    let body: string;
    if (inline !== undefined) {
      body = inline;
    } else if (fromFile !== undefined) {
      try {
        body = await readFile(fromFile, "utf8");
      } catch {
        throw new CliUsageError(
          `Cannot read the --body-file at "${fromFile}".`,
        );
      }
    } else {
      throw new CliUsageError(
        "Pass exactly one of --body <text> or --body-file <file>.",
      );
    }
    if (body.trim() === "") {
      throw new CliUsageError("The response body must not be empty.");
    }
    const document = await setCustomerReviewResponse(
      await cli.client(),
      ctx.args.review,
      body,
    );
    emitResult(cli.io, documentEnvelope("reviews respond", document));
  },
});

export const reviewsCommand = defineCommand({
  meta: {
    name: "reviews",
    description: "Read customer reviews; post or replace developer responses",
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    "get-response": getResponseCommand,
    respond: respondCommand,
  },
});
