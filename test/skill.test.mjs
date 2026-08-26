import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BASE,
  parseArgs,
  validateBundle,
} from "../.agents/skills/model-that-fits-my-task/scripts/download-snapshot.mjs";

const schema = { $defs: {}, properties: { schema_version: { const: "1.0" } } };
const snapshot = {
  schema_version: "1.0",
  generated_at: "2026-08-26T00:00:00.000Z",
  content_hash: "abc",
  models: [{ id: "model" }],
  sources: [{ source_id: "source" }],
  benchmarks: [],
};
const health = { status: "ok", schema_version: "1.0", content_hash: "abc", model_count: 1, source_count: 1 };

test("snapshot downloader parses explicit output and base", () => {
  assert.deepEqual(parseArgs(["--out", "/tmp/models", "--base", "https://example.test/api/"]), {
    base: "https://example.test/api",
    out: "/tmp/models",
  });
  assert.equal(parseArgs(["--out", "/tmp/models"]).base, DEFAULT_BASE);
  assert.throws(() => parseArgs([]), /--out is required/);
});

test("snapshot downloader validates a matching bundle", () => {
  assert.deepEqual(validateBundle(health, schema, snapshot), {
    generated_at: snapshot.generated_at,
    schema_version: "1.0",
    content_hash: "abc",
    model_count: 1,
    source_count: 1,
  });
});

test("snapshot downloader rejects mismatched or unhealthy data", () => {
  assert.throws(() => validateBundle({ ...health, status: "empty" }, schema, snapshot), /health is not ok/);
  assert.throws(() => validateBundle({ ...health, model_count: 2 }, schema, snapshot), /model counts differ/);
  assert.throws(() => validateBundle({ ...health, content_hash: "different" }, schema, snapshot), /content hashes differ/);
  assert.throws(() => validateBundle(health, { ...schema, properties: { schema_version: { const: "2.0" } } }, snapshot), /versions differ/);
});

test("live snapshot and schema remain mutually consistent", { skip: process.env.LIVE_TESTS !== "1", timeout: 600_000 }, async () => {
  const { download } = await import("../.agents/skills/model-that-fits-my-task/scripts/download-snapshot.mjs");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "models-labyrinth-skill-"));
  try {
    const result = await download({ base: DEFAULT_BASE, out: directory });
    assert.ok(result.model_count > 0);
    assert.ok(result.source_count > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
