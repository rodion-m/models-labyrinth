import assert from "node:assert/strict";
import test from "node:test";

const live = process.env.LIVE_TESTS === "1";
const base = (process.env.MODELS_LABYRINTH_API_BASE ?? "https://models-labyrinth.vercel.app/api/v1").replace(/\/$/, "");

test("deployed API supports the skill navigation contract", { skip: !live, timeout: 60_000 }, async () => {
  const health = await getJson("/health");
  assert.equal(health.status, "ok");

  const facets = await getJson("/facets");
  assert.ok(Array.isArray(facets.data.capabilities));
  assert.ok(Array.isArray(facets.data.modalities));

  const models = await getJson("/models?view=summary&provider=openrouter&modality=input%3Atext&limit=1");
  assert.equal(models.data.length, 1);
  assert.equal(models.data[0].offers, undefined);
  assert.ok(models.data[0].identity_confidence);

  const invalid = await fetch(`${base}/offers?profile=custom&input_tokens=1000`);
  assert.equal(invalid.status, 400);

  const offers = await getJson("/offers?model=openai%2Fo3-mini&provider=openrouter&profile=custom&input_tokens=10000&output_tokens=300&sort=cost&limit=1");
  assert.equal(offers.data[0]?.model_id, "openai/o3-mini");
  assert.equal(offers.data[0]?.workload_profile?.input_tokens, 10_000);
});

async function getJson(path) {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  return response.json();
}
