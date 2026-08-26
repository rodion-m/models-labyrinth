import type { ApiRequest, ApiResponse } from "../../src/api.js";
import { sendError, sendJson } from "../../src/api.js";
import { loadSnapshot } from "../../src/db.js";
import { listProviders } from "../../src/query.js";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, { data: listProviders(loadSnapshot()) });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read snapshot");
  }
}
