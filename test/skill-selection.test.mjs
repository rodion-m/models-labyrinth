import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { download } from "../.agents/skills/model-that-fits-my-task/scripts/download-snapshot.mjs";
import { validateDecision } from "../.agents/skills/model-that-fits-my-task/scripts/validate-decision.mjs";
import { comparisonLaneId } from "../src/lane.ts";
import {
  comparisonLane,
  parseSelectionArgs,
  scoreCandidates,
  selectCandidates,
} from "../.agents/skills/model-that-fits-my-task/scripts/select-models.mjs";

test("skill defaults to competitive and reserves frontier, available, and all for explicit cases", async () => {
  const skill = await readFile(new URL("../.agents/skills/model-that-fits-my-task/SKILL.md", import.meta.url), "utf8");
  const modes = await readFile(new URL("../.agents/skills/model-that-fits-my-task/references/selection-modes.md", import.meta.url), "utf8");

  assert.match(skill, /Default to `competitive`/);
  assert.match(skill, /maximum quality.*only the task-relevant frontier cohort/i);
  assert.match(skill, /`scope=all` is almost never appropriate/);
  assert.match(modes, /Price, speed, popularity, or availability cannot rescue a model below the floor/);
});

test("offline selector parses explicit bounded filters", () => {
  assert.deepEqual(parseSelectionArgs([
    "--cache", "/tmp/models",
    "--provider", "OpenRouter",
    "--effort", "high",
    "--quantization", "fp8",
    "--capability", "tools",
    "--benchmark", "agentic.test",
    "--score", "agentic.test=3:higher",
    "--coverage-penalty", "1.5",
    "--min-context", "200000",
    "--limit", "3",
  ]), {
    base: "https://rodion-m.github.io/models-labyrinth/api/v1",
    cache: "/tmp/models",
    scope: "available",
    providers: ["openrouter"],
    efforts: ["high"],
    quantizations: ["fp8"],
    capabilities: ["tools"],
    benchmarks: ["agentic.test"],
    scoreDimensions: [{ target: "agentic.test", weight: 3, direction: "higher" }],
    coveragePenalty: 1.5,
    models: [],
    minContext: 200000,
    limit: 3,
  });
  assert.throws(() => parseSelectionArgs(["--cache", "/tmp/models", "--scope", "modern"]), /available or all/);
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
  assert.equal(first.lane_id, comparisonLaneId({ benchmark_id: "agentic.test", metric: "pass_rate", configuration: { timeout: 30, tools: true } }));
  assert.notEqual(first.lane_id, otherEffort.lane_id);
});

test("task-fit scoring uses exact lanes, explicit weights, and a visible coverage penalty", () => {
  const evidence = { source_id: "fixture", url: "https://example.test", fetched_at: "2026-08-27T00:00:00.000Z", status: "observed" };
  const laneA = comparisonLane({ benchmark_id: "coding.a", metric: "pass_rate" }).lane_id;
  const laneB = comparisonLane({ benchmark_id: "coding.b", metric: "pass_rate" }).lane_id;
  const candidates = [
    { canonical_model_id: "complete", observations: [
      { benchmark_id: "coding.a", lane_id: laneA, value: 80, metric: "pass_rate", evidence },
      { benchmark_id: "coding.b", lane_id: laneB, value: 60, metric: "pass_rate", evidence },
    ] },
    { canonical_model_id: "sparse", observations: [
      { benchmark_id: "coding.a", lane_id: laneA, value: 90, metric: "pass_rate", evidence },
    ] },
    { canonical_model_id: "baseline", observations: [
      { benchmark_id: "coding.a", lane_id: laneA, value: 70, metric: "pass_rate", evidence },
      { benchmark_id: "coding.b", lane_id: laneB, value: 50, metric: "pass_rate", evidence },
    ] },
  ];
  const meta = scoreCandidates(candidates, [
    { target: laneA, weight: 1, direction: "higher" },
    { target: laneB, weight: 1, direction: "higher" },
  ], 1);

  assert.equal(meta.dimensions.length, 2);
  assert.equal(candidates[0].task_fit.coverage, 1);
  assert.equal(candidates[0].task_fit.aggregate_score, 75);
  assert.equal(candidates[1].task_fit.observed_score, 100);
  assert.equal(candidates[1].task_fit.coverage, 0.5);
  assert.equal(candidates[1].task_fit.aggregate_score, 50);
  assert.equal(candidates[2].task_fit.aggregate_score, 0);
});

test("task-fit scoring refuses to blend multiple comparison lanes behind one benchmark id", () => {
  const evidence = { source_id: "fixture", status: "observed" };
  const candidates = [{ canonical_model_id: "model", observations: [
    { benchmark_id: "coding.a", lane_id: "lane-low", effort: "low", value: 10, evidence },
    { benchmark_id: "coding.a", lane_id: "lane-high", effort: "high", value: 20, evidence },
  ] }];
  assert.throws(() => scoreCandidates(candidates, [{ target: "coding.a", weight: 1, direction: "higher" }]), /spans 2 comparison lanes/);
});

test("offline selection joins only explicit aliases and keeps route constraints on one offer", () => {
  const evidence = { source_id: "fixture", url: "https://example.test", fetched_at: "2026-08-27T00:00:00.000Z", status: "observed" };
  const snapshot = {
    schema_version: "1.0",
    generated_at: "2026-08-27T00:00:00.000Z",
    content_hash: "fixture",
    sources: [],
    benchmarks: [],
    scoreDimensions: [],
    coveragePenalty: 1,
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
        offers: [offer("openrouter", { structured_outputs: true, tools: false }, 250_000, evidence)],
        evidence,
      }),
    ],
  };

  const impossible = selectCandidates(snapshot, selection({ providers: ["openrouter"], capabilities: ["structured_outputs", "tools"] }));
  assert.equal(impossible.meta.total, 0);

  const available = selectCandidates(snapshot, selection({ providers: ["openrouter"], capabilities: ["structured_outputs"], benchmarks: ["agentic.test"] }));
  assert.equal(available.meta.total, 1);
  assert.equal(available.meta.evidence_max_age_hours, 36);
  assert.deepEqual(available.data[0].record_ids, ["vendor/model-1", "vendor/model.1"]);
  assert.equal(available.data[0].observations[0].value, 81);
  assert.equal(available.data[0].matching_offers[0].provider_id, "openrouter");

  snapshot.models[1].offers[0].reasoning_efforts = ["high"];
  snapshot.models[1].offers[0].quantization = "fp8";
  assert.equal(selectCandidates(snapshot, selection({ efforts: ["high"], quantizations: ["fp8"] })).meta.total, 1);
  assert.equal(selectCandidates(snapshot, selection({ efforts: ["medium"] })).meta.total, 0);

  const all = selectCandidates(snapshot, selection({ scope: "all" }));
  assert.equal(all.meta.total, 2);
});

test("offline selection does not transfer alias evidence when either release is unknown", () => {
  const evidence = { source_id: "fixture", url: "https://example.test", fetched_at: "2026-08-27T00:00:00.000Z", status: "observed" };
  const canonical = model({ id: "vendor/model-2", aliases: [{ id: "vendor/model-two", source_id: "fixture" }], offers: [offer("openrouter", { tools: true }, 100_000, evidence)], evidence });
  const aliasRecord = model({ id: "vendor/model-two", aliases: [{ id: "vendor/model-2", source_id: "fixture" }], benchmarks: [{ benchmark_id: "agentic.test", value: 99, evidence }], evidence });
  delete aliasRecord.release_date;
  const selected = selectCandidates({ schema_version: "1.0", generated_at: "2026-08-27T00:00:00.000Z", content_hash: "fixture", sources: [], benchmarks: [], workload_profiles: [], models: [canonical, aliasRecord] }, selection({ benchmarks: ["agentic.test"] }));
  assert.equal(selected.meta.total, 0);
});

test("offline available scope admits unknown release dates with fresh offers", () => {
  const evidence = { source_id: "fixture", url: "https://example.test", fetched_at: "2026-08-27T00:00:00.000Z", status: "observed" };
  const unknown = model({ id: "vendor/unknown-release", offers: [offer("openrouter", { tools: true }, 100_000, evidence)], evidence });
  delete unknown.release_date;
  const snapshot = { schema_version: "1.0", generated_at: "2026-08-27T00:00:00.000Z", content_hash: "fixture", sources: [], benchmarks: [], workload_profiles: [], models: [unknown] };

  assert.equal(selectCandidates(snapshot, selection()).meta.total, 1);
  assert.equal(selectCandidates(snapshot, selection({ scope: "all" })).meta.total, 1);
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

test("decision validation rejects omitted provider and effort but accepts explicit unknowns", () => {
  const recommendation = completeRecommendation();
  assert.deepEqual(validateDecision({ recommendations: [recommendation] }), []);

  const missing = structuredClone(recommendation);
  delete missing.offer;
  delete missing.reasoning;
  const errors = validateDecision({ recommendations: [missing] });
  assert.ok(errors.some((error) => error.includes("offer.status")));
  assert.ok(errors.some((error) => error.includes("reasoning.status")));

  const unknown = completeRecommendation();
  unknown.reasoning = { status: "unknown", reason: "The provider does not publish named effort support." };
  unknown.runtime = { status: "unknown", evidence: "The endpoint stats response was empty." };
  assert.deepEqual(validateDecision({ recommendations: [unknown] }), []);

  const scored = completeRecommendation();
  scored.task_fit = {
    aggregate_score: 78,
    observed_score: 82,
    coverage: 0.95,
    confidence: 0.8,
    contributions: [{ lane_id: "lane-1", weight: 3 }],
    sensitivity: { winner_changes: false, range: "±25%" },
  };
  assert.deepEqual(validateDecision({ recommendations: [scored] }), []);
  delete scored.task_fit.sensitivity;
  assert.ok(validateDecision({ recommendations: [scored] }).some((error) => error.includes("sensitivity.winner_changes")));
});

function selection(overrides = {}) {
  return {
    scope: "available",
    providers: [],
    efforts: [],
    quantizations: [],
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

function completeRecommendation() {
  return {
    model_id: "vendor/model",
    offer: {
      status: "selected",
      provider_id: "provider",
      provider_model_id: "vendor/model",
      route: "provider/default",
      service_tier: null,
      quantization: null,
    },
    reasoning: { status: "selected", effort: "medium" },
    structured_output: { status: "declared", evidence: "Route catalog response." },
    cache: { status: "unknown", evidence: "Cache-write semantics are not published." },
    privacy: { status: "unknown", evidence: "ZDR field is null." },
    runtime: { status: "unknown", evidence: "No route-level samples." },
    quality_transfer: { status: "partial", lane_id: "lane-1", evidence: "Benchmark quantization is unspecified." },
    cost: { status: "estimated", assumptions: "10k input and 1k output tokens; no cache hit assumed." },
    tradeoff: "Route-level runtime remains unmeasured.",
    sources: ["https://example.test/model"],
  };
}
