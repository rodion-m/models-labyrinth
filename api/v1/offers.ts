import type { ApiRequest, ApiResponse } from "../../src/api.js";
import { paramsFor, sendError, sendJson } from "../../src/api.js";
import { loadSnapshot } from "../../src/db.js";
import { listOffers } from "../../src/query.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, listOffers(loadSnapshot(), paramsFor(request)));
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read snapshot");
  }
}
