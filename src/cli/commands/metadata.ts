import { defineCommand } from "citty";

import { metadataAppCommand } from "./metadata-app.js";
import { metadataVersionCommand } from "./metadata-version.js";

export const metadataCommand = defineCommand({
  meta: {
    name: "metadata",
    description:
      "Read and update store metadata and localizations (app level and version level)",
  },
  subCommands: {
    app: metadataAppCommand,
    version: metadataVersionCommand,
  },
});
