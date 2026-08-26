import { strict as assert } from "node:assert";
import test from "node:test";
import { collectBenchLM } from "../src/sources/benchlm.ts";
import { collectModelsDev } from "../src/sources/models-dev.ts";
import { collectOpenRouter } from "../src/sources/openrouter.ts";
import { collectArtificialAnalysis } from "../src/sources/artificial-analysis.ts";

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
