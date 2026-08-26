import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { redirect } from "../../src/api.ts";

const DEFAULT_SNAPSHOT_LOCATION = "/api/v1/snapshot.json";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  redirect(response, process.env.SNAPSHOT_DOWNLOAD_URL?.trim() || DEFAULT_SNAPSHOT_LOCATION);
}
