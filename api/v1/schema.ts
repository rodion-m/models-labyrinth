import type { ApiRequest, ApiResponse } from "../../src/api.ts";
import { sendError, sendJson } from "../../src/api.ts";
import { MODELS_DB_SCHEMA } from "../../src/schema.ts";

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  try {
    sendJson(response, MODELS_DB_SCHEMA);
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "unable to read schema");
  }
}
