import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { sendError, sendJson } from "../../src/api.ts";
import { loadSnapshot } from "../../src/db.ts";
import { listProviders } from "../../src/query.ts";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, { data: listProviders(loadSnapshot()) });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read snapshot");
  }
}
