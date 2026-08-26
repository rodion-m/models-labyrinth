import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { download } from "../.agents/skills/model-that-fits-my-task/scripts/download-snapshot.mjs";
import {
  comparisonLane,
  parseSelectionArgs,
  selectCandidates,
} from "../.agents/skills/model-that-fits-my-task/scripts/select-models.mjs";

test("offline selector parses explicit bounded filters", () => {
  assert.deepEqual(parseSelectionArgs([
    "--cache", "/tmp/models",
    "--provider", "OpenRouter",
    "--capability", "tools",
    "--benchmark", "agentic.test",
    "--min-context", "200000",
    "--limit", "3",
  ]), {
    base: "https://rodion-m.github.io/models-labyrinth/api/v1",
    cache: "/tmp/models",
    scope: "current",
    providers: ["openrouter"],
    capabilities: ["tools"],
    benchmarks: ["agentic.test"],
    models: [],
    minContext: 200000,
    limit: 3,
  });
  assert.throws(() => parseSelectionArgs(["--cache", "/tmp/models", "--scope", "modern"]), /current or all/);
  assert.throws(() => parseSelectionArgs([]), /--cache is required/);
});

test("comparison lanes are stable and change with benchmark conditions", () => {
  const first = comparisonLane({
    benchmark_id: "agentic.test",
    value: 80,
    metric: "pass_rate",
    configuration: { tools: true, timeout: 30 },
  });
  const reordered = comparisonLane({
    benchmark_id: "agentic.test",
    value: 90,
    metric: "pass_rate",
    configuration: { timeout: 30, tools: true },
  });
  const otherEffort = comparisonLane({
    benchmark_id: "agentic.test",
    value: 90,
    metric: "pass_rate",
    effort: "high",
    configuration: { timeout: 30, tools: true },
  });
  assert.equal(first.lane_id, reordered.lane_id);
  assert.notEqual(first.lane_id, otherEffort.lane_id);
});

test("offline selection joins only explicit aliases and keeps route constraints on one offer", () => {
  const evidence = { source_id: "fixture", url: "https://example.test", fetched_at: "2026-08-27T00:00:00.000Z", status: "observed" };
  const snapshot = {
    schema_version: "1.0",
    generated_at: "2026-08-27T00:00:00.000Z",
    content_hash: "fixture",
    sources: [],
    benchmarks: [],
    workload_profiles: [],
    models: [
      model({
        id: "vendor/model-1",
        aliases: [{ id: "vendor/model.1", source_id: "fixture" }],
        benchmarks: [{ benchmark_id: "agentic.test", value: 81, metric: "pass_rate", evidence }],
        evidence,
      }),
      model({
        id: "vendor/model.1",
        aliases: [{ id: "vendor/model-1", source_id: "fixture" }],
        offers: [
          offer("openrouter", { structured_outputs: true, tools: false }, 250_000, evidence),
          offer("other", { structured_outputs: false, tools: true }, 250_000, evidence),
        ],
        evidence,
      }),
      model({
        id: "vendor/old-model",
        release_date: "2020-01-01",
        offers: [offer("openrouter", { structured_outputs: true, tools: true }, 250_000, evidence)],
        evidence,
      }),
    ],
  };

  const impossible = selectCandidates(snapshot, selection({ providers: ["openrouter"], capabilities: ["structured_outputs", "tools"] }));
  assert.equal(impossible.meta.total, 0);

  const current = selectCandidates(snapshot, selection({ providers: ["openrouter"], capabilities: ["structured_outputs"], benchmarks: ["agentic.test"] }));
  assert.equal(current.meta.total, 1);
  assert.deepEqual(current.data[0].record_ids, ["vendor/model-1", "vendor/model.1"]);
  assert.equal(current.data[0].observations[0].value, 81);
  assert.equal(current.data[0].matching_offers[0].provider_id, "openrouter");

  const all = selectCandidates(snapshot, selection({ scope: "all" }));
  assert.equal(all.meta.total, 2);
});

test("bundle downloader reuses a matching content-hash cache without downloading the snapshot again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "models-labyrinth-bundle-"));
  const health = { status: "ok", schema_version: "1.0", content_hash: "same", model_count: 1, source_count: 1 };
  const schema = { $defs: {}, properties: { schema_version: { const: "1.0" } } };
  const snapshot = { schema_version: "1.0", generated_at: "2026-08-27T00:00:00.000Z", content_hash: "same", models: [{ id: "model" }], sources: [{ source_id: "source" }], benchmarks: [] };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const body = String(url).endsWith("health.json") ? health : String(url).endsWith("schema.json") ? schema : snapshot;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const first = await download({ base: "https://example.test", out: directory, fetchImpl });
    const second = await download({ base: "https://example.test", out: directory, fetchImpl });
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(calls.filter((url) => url.endsWith("snapshot.json")).length, 1);
    assert.equal(calls.filter((url) => url.endsWith("health.json")).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function selection(overrides = {}) {
  return {
    scope: "current",
    providers: [],
    capabilities: [],
    benchmarks: [],
    models: [],
    minContext: 0,
    limit: 25,
    ...overrides,
  };
}

function model({ id, aliases = [], offers = [], benchmarks = [], release_date = "2026-08-01", evidence }) {
  return {
    id,
    identity_confidence: "exact",
    name: id,
    aliases,
    release_date,
    capabilities: {},
    offers,
    benchmarks,
    evidence: [evidence],
  };
}

function offer(provider, capabilities, context, evidence) {
  return {
    id: `${provider}:offer`,
    provider_id: provider,
    provider_model_id: "vendor/model",
    status: "active",
    context_tokens: context,
    capabilities,
    reasoning_efforts: [],
    supported_parameters: [],
    pricing: [],
    runtime: [],
    evidence: [evidence],
  };
}
