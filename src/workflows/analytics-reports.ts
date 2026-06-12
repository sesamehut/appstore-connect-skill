import {
  createAnalyticsReportRequest,
  listAnalyticsReportRequests,
} from "../capabilities/analytics-reports.js";
import type {
  AnalyticsReportAccessType,
  AnalyticsReportRequest,
} from "../capabilities/analytics-reports.js";
import type { AscClient } from "../http/client.js";

export interface EnsureAnalyticsReportRequestResult {
  readonly request: AnalyticsReportRequest;
  /** False when an existing active request of this accessType was reused. */
  readonly created: boolean;
  /** Same-accessType requests Apple stopped for inactivity, left in place. */
  readonly stoppedRequestIds: readonly string[];
}

/**
 * Idempotent "the app has a usable analytics report request" operation:
 * list-then-create, reusing the active request when one exists.
 *
 * Stopped requests (Apple halts ONGOING requests that go unread) are
 * reported but never deleted here: Apple's documented recovery is simply
 * creating a new request, while deletion discards the accumulated reports —
 * that destructive cleanup stays behind the explicit delete-request verb.
 */
export async function ensureAnalyticsReportRequest(
  client: AscClient,
  appId: string,
  accessType: AnalyticsReportAccessType,
): Promise<EnsureAnalyticsReportRequestResult> {
  const existing = await listAnalyticsReportRequests(client, appId, {
    scope: "all-pages",
    accessType: [accessType],
  });
  const stoppedRequestIds = existing.items
    .filter((request) => request.attributes?.stoppedDueToInactivity === true)
    .map((request) => request.id);
  const active = existing.items.find(
    (request) => request.attributes?.stoppedDueToInactivity !== true,
  );
  if (active !== undefined) {
    return { request: active, created: false, stoppedRequestIds };
  }

  const created = await createAnalyticsReportRequest(client, appId, accessType);
  return { request: created.data, created: true, stoppedRequestIds };
}
