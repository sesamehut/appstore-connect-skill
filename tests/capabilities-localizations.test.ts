import { beforeAll, describe, expect, it } from "vitest";

import {
  createAppInfoLocalization,
  getAppInfoLocalization,
  listAppInfoLocalizations,
  updateAppInfoLocalization,
} from "../src/capabilities/app-info-localizations.js";
import { getAppInfo, listAppInfos } from "../src/capabilities/app-infos.js";
import {
  createAppStoreVersionLocalization,
  getAppStoreVersionLocalization,
  listAppStoreVersionLocalizations,
  updateAppStoreVersionLocalization,
} from "../src/capabilities/app-store-version-localizations.js";
import {
  AscInvalidParameterError,
  AscNotFoundError,
  AscPermissionError,
} from "../src/errors.js";
import { ASC_API_BASE_URL } from "../src/http/client.js";
import type { AscClient } from "../src/http/client.js";
import {
  ascItem,
  JSON_HEADERS,
  makeOfflineClient,
  thrownBy,
} from "./helpers/asc-fixtures.js";
import { headerValue, useMockAgent } from "./helpers/mock-agent.js";

const getAgent = useMockAgent();

let client: AscClient;

beforeAll(async () => {
  client = await makeOfflineClient();
});

describe("listAppInfos", () => {
  it("maps the field selection onto the JSON:API query surface", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/apps/123/appInfos"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [
              {
                type: "appInfos",
                id: "info1",
                attributes: { state: "PREPARE_FOR_SUBMISSION" },
              },
              {
                type: "appInfos",
                id: "info2",
                attributes: { state: "READY_FOR_DISTRIBUTION" },
              },
            ],
            links: { self: `${ASC_API_BASE_URL}/v1/apps/123/appInfos` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const read = await listAppInfos(client, "123", {
      scope: "single-page",
      fields: ["state"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("fields[appInfos]")).toBe("state");
    expect(read.items.map((info) => info.id)).toEqual(["info1", "info2"]);
  });
});

describe("getAppInfo", () => {
  it("maps include and the per-type field selections", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/appInfos/info1"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: { type: "appInfos", id: "info1" },
            included: [
              {
                type: "appInfoLocalizations",
                id: "loc1",
                attributes: { locale: "en-US", name: "Example" },
              },
            ],
            links: { self: `${ASC_API_BASE_URL}/v1/appInfos/info1` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await getAppInfo(client, "info1", {
      include: ["appInfoLocalizations"],
      localizationFields: ["locale", "name"],
    });

    const query = new URLSearchParams(capturedPath.split("?")[1] ?? "");
    expect(query.get("include")).toBe("appInfoLocalizations");
    expect(query.get("fields[appInfoLocalizations]")).toBe("locale,name");
    expect(document.included?.[0]?.id).toBe("loc1");
  });
});

describe("listAppInfoLocalizations", () => {
  it("filters by locale and follows the cursor across pages", async () => {
    let firstPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith("/v1/appInfos/info1/appInfoLocalizations") &&
          !path.includes("cursor"),
        method: "GET",
      })
      .reply((request) => {
        firstPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: [{ type: "appInfoLocalizations", id: "loc1" }],
            links: {
              self: `${ASC_API_BASE_URL}/v1/appInfos/info1/appInfoLocalizations`,
              next: `${ASC_API_BASE_URL}/v1/appInfos/info1/appInfoLocalizations?cursor=p2`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appInfos/info1/appInfoLocalizations?cursor=p2",
        method: "GET",
      })
      .reply(
        200,
        {
          data: [{ type: "appInfoLocalizations", id: "loc2" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/appInfos/info1/appInfoLocalizations`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const read = await listAppInfoLocalizations(client, "info1", {
      scope: "all-pages",
      locale: ["en-US", "de-DE"],
    });

    const query = new URLSearchParams(firstPath.split("?")[1] ?? "");
    expect(query.get("filter[locale]")).toBe("en-US,de-DE");
    expect(read.items.map((loc) => loc.id)).toEqual(["loc1", "loc2"]);
    expect(read.pagesRead).toBe(2);
  });
});

describe("getAppInfoLocalization", () => {
  it("substitutes the path id and maps the field selection", async () => {
    let capturedPath = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) => path.startsWith("/v1/appInfoLocalizations/loc1"),
        method: "GET",
      })
      .reply((request) => {
        capturedPath = request.path;
        return {
          statusCode: 200,
          data: {
            data: {
              type: "appInfoLocalizations",
              id: "loc1",
              attributes: { locale: "en-US", name: "Example" },
            },
            links: { self: `${ASC_API_BASE_URL}/v1/appInfoLocalizations/loc1` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await getAppInfoLocalization(client, "loc1", {
      fields: ["locale", "name"],
    });

    expect(capturedPath).toBe(
      "/v1/appInfoLocalizations/loc1?fields[appInfoLocalizations]=locale,name",
    );
    expect(document.data.attributes?.name).toBe("Example");
  });
});

describe("updateAppInfoLocalization", () => {
  it("sends the JSON:API patch body, passing null clears through", async () => {
    let capturedBody = "";
    let capturedContentType: string | undefined;
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appInfoLocalizations/loc1", method: "PATCH" })
      .reply((request) => {
        capturedBody = request.body as string;
        capturedContentType = headerValue(request.headers, "content-type");
        return {
          statusCode: 200,
          data: {
            data: {
              type: "appInfoLocalizations",
              id: "loc1",
              attributes: { name: "New Name" },
            },
            links: { self: `${ASC_API_BASE_URL}/v1/appInfoLocalizations/loc1` },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await updateAppInfoLocalization(client, "loc1", {
      name: "New Name",
      subtitle: null,
    });

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appInfoLocalizations",
        id: "loc1",
        attributes: { name: "New Name", subtitle: null },
      },
    });
    expect(capturedContentType).toBe("application/json");
    expect(document.data.attributes?.name).toBe("New Name");
  });

  it("surfaces an out-of-state 409 as invalid-parameter with the ASC items", async () => {
    const item = ascItem({
      code: "STATE_ERROR",
      status: "409",
      detail: "The attribute 'name' cannot be edited in the current state.",
      source: { pointer: "/data/attributes/name" },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appInfoLocalizations/loc1", method: "PATCH" })
      .reply(409, { errors: [item] }, { headers: JSON_HEADERS });

    const error = await thrownBy(
      updateAppInfoLocalization(client, "loc1", { name: "New Name" }),
    );

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.category).toBe("invalid-parameter");
    expect(error.apiErrors).toEqual([item]);
  });
});

describe("createAppInfoLocalization", () => {
  it("builds the relationship envelope around the plain appInfo id", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appInfoLocalizations", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: {
              type: "appInfoLocalizations",
              id: "loc-new",
              attributes: { locale: "fr-FR", name: "Exemple" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appInfoLocalizations/loc-new`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await createAppInfoLocalization(client, "info1", {
      locale: "fr-FR",
      name: "Exemple",
    });

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appInfoLocalizations",
        attributes: { locale: "fr-FR", name: "Exemple" },
        relationships: {
          appInfo: { data: { type: "appInfos", id: "info1" } },
        },
      },
    });
    expect(document.data.id).toBe("loc-new");
  });
});

describe("listAppStoreVersionLocalizations", () => {
  it("reads under the version path and reports truncation honestly", async () => {
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: (path) =>
          path.startsWith(
            "/v1/appStoreVersions/v1/appStoreVersionLocalizations",
          ),
        method: "GET",
      })
      .reply(
        200,
        {
          data: [{ type: "appStoreVersionLocalizations", id: "vloc1" }],
          links: {
            self: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionLocalizations`,
            next: `${ASC_API_BASE_URL}/v1/appStoreVersions/v1/appStoreVersionLocalizations?cursor=p2`,
          },
        },
        { headers: JSON_HEADERS },
      );

    const read = await listAppStoreVersionLocalizations(client, "v1", {
      scope: "single-page",
    });

    expect(read.items.map((loc) => loc.id)).toEqual(["vloc1"]);
    expect(read.truncated).toBe(true);
  });
});

describe("getAppStoreVersionLocalization", () => {
  it("surfaces 404 as not-found, undisguised", async () => {
    const item = ascItem({ code: "NOT_FOUND", status: "404" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appStoreVersionLocalizations/missing",
        method: "GET",
      })
      .reply(404, { errors: [item] });

    const error = await thrownBy(
      getAppStoreVersionLocalization(client, "missing"),
    );

    expect(error).toBeInstanceOf(AscNotFoundError);
    expect(error.apiErrors).toEqual([item]);
  });
});

describe("updateAppStoreVersionLocalization", () => {
  it("sends the JSON:API patch body for version copy", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appStoreVersionLocalizations/vloc1",
        method: "PATCH",
      })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 200,
          data: {
            data: {
              type: "appStoreVersionLocalizations",
              id: "vloc1",
              attributes: { promotionalText: "Fresh!" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersionLocalizations/vloc1`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await updateAppStoreVersionLocalization(client, "vloc1", {
      promotionalText: "Fresh!",
    });

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appStoreVersionLocalizations",
        id: "vloc1",
        attributes: { promotionalText: "Fresh!" },
      },
    });
    expect(document.data.attributes?.promotionalText).toBe("Fresh!");
  });

  it("surfaces a write 403 as permission, end to end", async () => {
    const item = ascItem({ code: "FORBIDDEN_ERROR", status: "403" });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({
        path: "/v1/appStoreVersionLocalizations/vloc1",
        method: "PATCH",
      })
      .reply(403, { errors: [item] });

    const error = await thrownBy(
      updateAppStoreVersionLocalization(client, "vloc1", {
        promotionalText: "Fresh!",
      }),
    );

    expect(error).toBeInstanceOf(AscPermissionError);
    expect(error.category).toBe("permission");
  });
});

describe("createAppStoreVersionLocalization", () => {
  it("builds the relationship envelope around the plain version id", async () => {
    let capturedBody = "";
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appStoreVersionLocalizations", method: "POST" })
      .reply((request) => {
        capturedBody = request.body as string;
        return {
          statusCode: 201,
          data: {
            data: {
              type: "appStoreVersionLocalizations",
              id: "vloc-new",
              attributes: { locale: "de-DE" },
            },
            links: {
              self: `${ASC_API_BASE_URL}/v1/appStoreVersionLocalizations/vloc-new`,
            },
          },
          responseOptions: { headers: JSON_HEADERS },
        };
      });

    const document = await createAppStoreVersionLocalization(client, "v1", {
      locale: "de-DE",
      description: "Beschreibung",
    });

    expect(JSON.parse(capturedBody)).toEqual({
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale: "de-DE", description: "Beschreibung" },
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: "v1" } },
        },
      },
    });
    expect(document.data.id).toBe("vloc-new");
  });

  it("surfaces a duplicate-locale 409 as invalid-parameter", async () => {
    const item = ascItem({
      code: "ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE",
      status: "409",
      source: { pointer: "/data/attributes/locale" },
    });
    getAgent()
      .get(ASC_API_BASE_URL)
      .intercept({ path: "/v1/appStoreVersionLocalizations", method: "POST" })
      .reply(409, { errors: [item] }, { headers: JSON_HEADERS });

    const error = await thrownBy(
      createAppStoreVersionLocalization(client, "v1", { locale: "de-DE" }),
    );

    expect(error).toBeInstanceOf(AscInvalidParameterError);
    expect(error.apiErrors).toEqual([item]);
  });
});
