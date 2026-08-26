# Models Labyrinth data guide

Read this reference when a recommendation needs detailed field interpretation or an offline snapshot query.

## Contents

- [Choose the correct unit](#choose-the-correct-unit)
- [API-first queries](#api-first-queries)
- [Field interpretation](#field-interpretation)
- [Provenance and confidence](#provenance-and-confidence)
- [Offline snapshot analysis](#offline-snapshot-analysis)
- [Recommendation quality](#recommendation-quality)

## Choose the correct unit

The database has three useful levels:

- `model`: identity, general capabilities, modalities, context, model-level benchmarks and observations;
- `offer`: a provider route for a model, including provider model id, status, quantization, supported parameters, prices, runtime claims, data policy, and reasoning efforts;
- `measurement`: a published observation tied to an offer and optionally a workload profile and reasoning configuration.

The strongest production recommendation names an offer. When only model-level quality evidence exists, say that provider behavior remains a separate uncertainty.

## API-first queries

Start with health and facet discovery:

```text
GET /health
GET /providers
GET /benchmarks
GET /profiles
```

Form candidates with conjunctive filters:

```text
GET /models?capability=tools&min_context=100000&provider=openrouter&limit=100
GET /models?benchmark=coding&reasoning_effort=high&sort=updated&limit=100
GET /offers?model=openai/gpt-5&provider=openrouter&quantization=fp8&profile=agentic-multistep&max_cost_usd=0.25&limit=100
GET /offers?capability=structured_outputs&profile=custom&input_tokens=10000&output_tokens=300&cached_input_ratio=0.5&sort=cost&limit=100
```

Capabilities, modalities, and supported parameters in one request are ANDed. Repeated models, providers, reasoning efforts, quantizations, and sources are alternatives (OR). Follow `meta.has_more` using `offset`; the server caps a page at 100 records. A workload returns its normalized inputs as `workload_profile` beside each estimate, so the calculation remains auditable.

Fetch a full model record with its URL-encoded canonical id:

```text
GET /models/openai%2Fgpt-5
```

Static GitHub Pages exposes a compact model index and base64url-named individual files, but no arbitrary server-side filtering. Prefer the Vercel API for queries and the static mirror for complete downloads.

## Field interpretation

| Need | Inspect | Important caveat |
| --- | --- | --- |
| General quality | `benchmarks[]` | Match benchmark, variant, effort, evaluator, version, and unit. |
| Structured output | `capabilities`, offer `supported_parameters`, relevant benchmarks/measurements | A support flag is not an adherence percentage. |
| Tool use | `capabilities`, offer `supported_parameters`, tool-use benchmarks | Declared support and measured reliability are different claims. |
| Reasoning | `reasoning[]`, offer `reasoning_efforts` | Availability does not imply the same token budget or behavior across providers. |
| Speed | offer `runtime[]`, then model `runtime_observations[]` | Preserve scope, percentile, window, and source. Median-only data hides tails. |
| Context | model and offer `context_tokens`, `max_output_tokens` | The route may be more restrictive than the model. |
| Cost | offer `pricing[]` | Normalize units and include cache, output, thinking, request, and tier dimensions. |
| Cache economics | `cache_read`, `cache_write`, profile estimate | Published cache prices are not a workload cache-hit rate. |
| Quantization | offer `quantization` | Quality impact is unknown unless the same quantized route was evaluated. |
| Privacy/routing | offer `data_policy`, provider identity | Missing policy data is unknown, not privacy-safe. |
| Open deployment | `open_weights`, `license` | Open weights and permissive commercial licensing are separate questions. |
| Freshness | root `generated_at`, `sources[]`, each `evidence` | A fresh snapshot can preserve older evidence from a failed source. |

## Provenance and confidence

Every important observation should carry `evidence.source_id`, `url`, `fetched_at`, and `status`. `observed` means the adapter read it from that source. `derived` means the source or catalog republished or transformed another source; inspect `derived_from`. `stale` means retained older data.

`identity_confidence` describes the join, not model quality:

- `exact`: strong identifier match;
- `alias`: matched through a known alias;
- `unresolved`: keep separate unless the user accepts the ambiguity.

Do not count BenchLM, CloudPrice, or BenchGecko republishing the same upstream score as three independent confirmations. The `/benchmarks` inventory exposes source coverage and an `independent_sources` view.

## Offline snapshot analysis

Download both files so field interpretation stays coupled to the data version:

```bash
node scripts/download-snapshot.mjs --out /tmp/models-labyrinth
```

The script defaults to the GitHub Pages static mirror, validates the root contract, checks health counts, content hash, and schema versions, and writes atomically. It fails visibly; it does not hide a broken primary source behind a fallback. Override `--base` only when using another compatible static host.

For local filtering, parse the snapshot once and build only the indexes needed for the question. Do not repeatedly parse the full file for every candidate. Typical joins are:

```text
models[]
  -> offers[] by provider / quantization / effort / capability
  -> benchmarks[] by task-relevant benchmark and comparable conditions
  -> evidence by source and freshness
```

Keep a candidate when a preferred metric is missing if it still satisfies all hard constraints; lower the confidence instead of assigning a synthetic penalty.

## Recommendation quality

A good result distinguishes:

1. hard compatibility: the route can accept the workload;
2. task quality: relevant, comparable benchmark evidence;
3. operational behavior: provider-scoped latency, throughput, uptime, policy, and quantization;
4. economics: full workload cost, including cache and output;
5. evidence confidence: freshness, provenance, independence, and missing fields.

When no candidate dominates, explain the frontier: for example, “A has the best relevant quality evidence, B is materially cheaper for cached prefixes, and C has the strongest route-level latency evidence.” That is more useful than an opaque composite score.
