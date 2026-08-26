import { strict as assert } from "node:assert";
import test from "node:test";
import modelsHandler from "../api/v1/models.ts";
import schemaHandler from "../api/v1/schema.ts";
import snapshotHandler from "../api/v1/snapshot.ts";
import type { ApiResponse } from "../src/api.ts";

test("Vercel models handler returns the shared paginated envelope", () => {
  const response = fakeResponse();
  modelsHandler({ url: "/api/v1/models?limit=2&sort=name" }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.equal((response.body as any).meta.limit, 2);
  assert.ok(Array.isArray((response.body as any).data));
});

test("schema handler exposes the same JSON Schema contract", () => {
  const response = fakeResponse();
  schemaHandler({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok((response.body as any).$defs.model);
});

test("snapshot endpoint redirects to the static full JSON", () => {
  const response = fakeResponse();
  snapshotHandler({}, response);
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, "/api/v1/snapshot.json");
});

test("snapshot endpoint can redirect to an externally published full JSON", () => {
  const previous = process.env.SNAPSHOT_DOWNLOAD_URL;
  process.env.SNAPSHOT_DOWNLOAD_URL = "https://raw.githubusercontent.com/example/models/main/models_db.json";
  try {
    const response = fakeResponse();
    snapshotHandler({}, response);
    assert.equal(response.headers.location, "https://raw.githubusercontent.com/example/models/main/models_db.json");
  } finally {
    if (previous === undefined) delete process.env.SNAPSHOT_DOWNLOAD_URL;
    else process.env.SNAPSHOT_DOWNLOAD_URL = previous;
  }
});

function fakeResponse(): ApiResponse & { statusCode: number; headers: Record<string, string>; body?: unknown } {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) { response.statusCode = code; return response; },
    setHeader(name: string, value: string) { response.headers[name.toLowerCase()] = value; return response; },
    json(value: unknown) { response.body = value; },
    end(value?: string) { response.body = value; },
  };
  return response;
}
