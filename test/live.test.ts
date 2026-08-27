import { strict as assert } from "node:assert";
import test from "node:test";
import { collectBenchLM } from "../src/sources/benchlm.js";
import { collectModelsDev } from "../src/sources/models-dev.js";
import { collectOpenRouter } from "../src/sources/openrouter.js";
import { collectArtificialAnalysis } from "../src/sources/artificial-analysis.js";
import { collectVals } from "../src/sources/vals.js";
import { collectLiveBench } from "../src/sources/livebench.js";

const live = process.env.LIVE_TESTS === "1";

test("live OpenRouter catalog contract", { skip: !live }, async () => {
  const result = await collectOpenRouter({ includeEndpoints: false });
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
});

test("live Models.dev catalog contract", { skip: !live }, async () => {
  const result = await collectModelsDev();
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
});

test("live BenchLM snapshot contract", { skip: !live }, async () => {
  const result = await collectBenchLM();
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
});

test("live Artificial Analysis contract is key-gated", { skip: !live || !process.env.AA_API_KEY }, async () => {
  const result = await collectArtificialAnalysis();
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
});

test("live Vals static benchmark snapshot contract", { skip: !live }, async () => {
  const result = await collectVals();
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
  assert.ok((result.benchmark_definitions?.length ?? 0) > 0);
  const observations = result.records.flatMap((record) => record.benchmarks ?? []);
  assert.ok(observations.some((row) => row.benchmark_id === "vals.rsi_index" && row.evidence.status === "derived"));
  assert.ok(observations.some((row) => row.benchmark_id === "vals.poker_agent" && row.metric === "trueskill_rating" && row.unit === "rating"));
});

test("live LiveBench release table contract", { skip: !live }, async () => {
  const result = await collectLiveBench();
  assert.equal(result.status, "ok");
  assert.ok(result.records.length > 0);
  assert.ok((result.benchmark_definitions?.length ?? 0) > 0);
  const observations = result.records.flatMap((record) => record.benchmarks ?? []);
  assert.ok(observations.some((row) => row.evaluator === "livebench" && row.dataset_version));
  assert.ok(observations.some((row) => typeof row.metrics?.evaluation_cost_usd === "number"));
});
