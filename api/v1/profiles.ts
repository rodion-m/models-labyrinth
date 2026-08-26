import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { sendError, sendJson } from "../../src/api.ts";
import { listProfiles } from "../../src/query.ts";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, { data: listProfiles() });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read profiles");
  }
}
