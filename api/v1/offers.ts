import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { paramsFor, sendError, sendJson } from "../../src/api.ts";
import { loadSnapshot } from "../../src/db.ts";
import { listOffers } from "../../src/query.ts";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, listOffers(loadSnapshot(), paramsFor(request)));
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read snapshot");
  }
}
