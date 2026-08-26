import type { ApiRequest, ApiResponse } from "../../src/api.js";
import { sendError, sendJson } from "../../src/api.js";
import { loadSnapshot } from "../../src/db.js";
import { listFacets } from "../../src/query.js";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, { data: listFacets(loadSnapshot()) });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read facets");
  }
}
