import { defineCommand } from "citty";

import { mediaPreviewsCommand } from "./media-previews.js";
import { mediaScreenshotsCommand } from "./media-screenshots.js";

export const mediaCommand = defineCommand({
  meta: {
    name: "media",
    description: "Screenshot and preview (video) upload workflows",
  },
  subCommands: {
    screenshots: mediaScreenshotsCommand,
    previews: mediaPreviewsCommand,
  },
});
