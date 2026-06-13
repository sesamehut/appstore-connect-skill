import { defineCommand } from "citty";

import { testflightFeedbackCommand } from "./testflight-feedback.js";
import { testflightGroupsCommand } from "./testflight-groups.js";
import {
  testflightReviewDetailCommand,
  testflightTestInfoCommand,
} from "./testflight-review.js";
import { testflightTestersCommand } from "./testflight-testers.js";

export const testflightCommand = defineCommand({
  meta: {
    name: "testflight",
    description:
      "TestFlight: beta groups, testers, test info, beta review detail, and feedback",
  },
  subCommands: {
    groups: testflightGroupsCommand,
    testers: testflightTestersCommand,
    "test-info": testflightTestInfoCommand,
    "review-detail": testflightReviewDetailCommand,
    feedback: testflightFeedbackCommand,
  },
});
