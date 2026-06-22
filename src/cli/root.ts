import { defineCommand } from "citty";

import { appsCommand } from "./commands/apps.js";
import { authCommand } from "./commands/auth.js";
import { buildsCommand } from "./commands/builds.js";
import { capabilitiesCommand } from "./commands/capabilities.js";
import { doctorCommand } from "./commands/doctor.js";
import { mediaCommand } from "./commands/media.js";
import { metadataCommand } from "./commands/metadata.js";
import { reportsCommand } from "./commands/reports.js";
import { reviewsCommand } from "./commands/reviews.js";
import { submissionCommand } from "./commands/submission.js";
import { testflightCommand } from "./commands/testflight.js";
import { versionsCommand } from "./commands/versions.js";

/**
 * Kept as a constant (not read from package.json at runtime) so the M8
 * single-file bundle needs no filesystem access; a unit test pins it to the
 * package version.
 */
export const CLI_VERSION = "0.2.1";

// makePlannedCommand / planned.ts stay as harmless extension points: with the
// submission domain now implemented, no domain is planned, so root wires only
// real commands. The next planned domain re-introduces a plannedDomain() helper.

export const rootCommand = defineCommand({
  meta: {
    name: "asc",
    version: CLI_VERSION,
    description:
      "App Store Connect operations for agents: apps, versions, store metadata, customer reviews",
  },
  subCommands: {
    apps: appsCommand,
    versions: versionsCommand,
    metadata: metadataCommand,
    reviews: reviewsCommand,
    doctor: doctorCommand,
    auth: authCommand,
    capabilities: capabilitiesCommand,
    reports: reportsCommand,
    media: mediaCommand,
    testflight: testflightCommand,
    builds: buildsCommand,
    submission: submissionCommand,
  },
});
