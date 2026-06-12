import {
  convertDelimitedReportToJson,
  jsonSiblingPath,
} from "../workflows/report-files.js";
import type { SavedReportFile } from "../workflows/report-files.js";

/**
 * The file summary plus the optional JSON conversion, shared by every report
 * download command's envelope.
 */
export async function reportFileData(
  saved: SavedReportFile,
  format: "json" | undefined,
): Promise<SavedReportFile & { readonly convertedJsonPath?: string }> {
  if (format === undefined) {
    return saved;
  }
  const converted = await convertDelimitedReportToJson(
    saved.path,
    jsonSiblingPath(saved.path),
  );
  return { ...saved, convertedJsonPath: converted.path };
}
