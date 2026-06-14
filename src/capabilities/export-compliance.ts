import type { components } from "../generated/asc-openapi.js";
import type { AscClient } from "../http/client.js";
import { expectDocument } from "./internal.js";

export type BuildResponse = components["schemas"]["BuildResponse"];

/**
 * Sets a build's export-compliance signal. The encryption flag lives on Build
 * (Build.attributes.usesNonExemptEncryption) — the contract has NO
 * exportComplianceUsesEncryption field — so this is a plain BuildUpdateRequest
 * PATCH of the boolean. Decision E2: boolean write only; no declaration-document
 * upload (that is a separate upload-like flow, deferred). live-verify
 * (实机核实 #7): whether usesNonExemptEncryption=false alone clears compliance
 * or an explicit appEncryptionDeclaration link is still required.
 */
export async function setBuildExportCompliance(
  client: AscClient,
  buildId: string,
  usesNonExemptEncryption: boolean,
): Promise<BuildResponse> {
  const { data } = await client.PATCH("/v1/builds/{id}", {
    params: { path: { id: buildId } },
    body: {
      data: {
        type: "builds",
        id: buildId,
        attributes: { usesNonExemptEncryption },
      },
    },
  });
  return expectDocument(data);
}
