import type { ApiRequest, ApiResponse } from "../../src/api.js";
import { paramsFor, sendError, sendJson } from "../../src/api.js";
import { loadSnapshot } from "../../src/db.js";
import { listFacets, QueryInputError } from "../../src/query.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, { data: listFacets(loadSnapshot(), paramsFor(request)) });
  } catch (error) {
    if (error instanceof QueryInputError) return sendError(response, 400, error.message, error.parameter);
    sendError(response, 500, error instanceof Error ? error.message : "unable to read facets");
  }
}
