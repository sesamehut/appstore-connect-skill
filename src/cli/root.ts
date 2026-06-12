import { defineCommand } from "citty";

import { appsCommand } from "./commands/apps.js";
import { capabilitiesCommand } from "./commands/capabilities.js";
import { doctorCommand } from "./commands/doctor.js";
import { metadataCommand } from "./commands/metadata.js";
import { makePlannedCommand } from "./commands/planned.js";
import { reviewsCommand } from "./commands/reviews.js";
import { versionsCommand } from "./commands/versions.js";
import { DOMAINS } from "./registry.js";

/**
 * Kept as a constant (not read from package.json at runtime) so the M8
 * single-file bundle needs no filesystem access; a unit test pins it to the
 * package version.
 */
export const CLI_VERSION = "0.0.0";

function plannedDomain(name: string) {
  const entry = DOMAINS.find((domain) => domain.name === name);
  if (entry === undefined) {
    throw new Error(`Domain '${name}' is missing from the registry.`);
  }
  return makePlannedCommand(entry);
}

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
    capabilities: capabilitiesCommand,
    reports: plannedDomain("reports"),
    media: plannedDomain("media"),
    testflight: plannedDomain("testflight"),
  },
});
