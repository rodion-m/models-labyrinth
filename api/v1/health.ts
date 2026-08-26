import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { sendError, sendJson } from "../../src/api.ts";
import { loadSnapshot } from "../../src/db.ts";
import { health } from "../../src/query.ts";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, health(loadSnapshot()));
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read health");
  }
}
