# Models Labyrinth data guide

Read this reference when a recommendation needs detailed field interpretation or an offline snapshot query.

## Contents

- [Choose the correct unit](#choose-the-correct-unit)
- [Choose the catalog scope](#choose-the-catalog-scope)
- [API-first queries](#api-first-queries)
- [Comparison lanes](#comparison-lanes)
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

## Choose the catalog scope

Selection endpoints default to `scope=available`: canonical identities with at
least one active, unexpired offer backed by evidence no older than 36 hours at
snapshot generation time. Release age is deliberately irrelevant. This scope
answers “what appears deployable?”, not “what should I choose?”.

Using `available` as the final shortlist is rare; first apply the task's quality
gate. Use `scope=all` almost exclusively for explicit historical, exhaustive,
supersession, reproducibility, or audit work. It includes stale, unavailable,
unresolved, and offerless records. Preserve `meta.scope` and exclusion counts.

## API-first queries

Start with health and facet discovery:

```text
GET /health
GET /providers?scope=available
GET /benchmarks?kind=benchmark
GET /profiles
```

Form candidates with conjunctive filters:

```text
GET /models?scope=available&capability=tools&min_context=100000&provider=openrouter&sort=released&limit=100
GET /offers?scope=available&provider=openrouter&capability=tools&capability=structured_outputs&min_context=100000&limit=100
GET /benchmark-observations?scope=available&benchmark=agentic.toolathlonVerified&limit=100
GET /offers?scope=available&model=openai/gpt-5&provider=openrouter&profile=custom&input_tokens=10000&output_tokens=300&cached_input_ratio=0.5&cache_write_tokens=5000&reasoning_tokens=1000&sort=cost&limit=100
```

Capabilities, modalities, and supported parameters in one request are ANDed.
Offer-scoped constraints must be true on one offer; support from one provider
cannot satisfy a query for another provider. Repeated models, providers,
reasoning efforts, quantizations, and sources are alternatives (OR). Follow
`meta.has_more` using `offset`; summary, offer, and observation pages cap at 100
records, while complete model pages cap at 10. Invalid values return HTTP 400
instead of silently broadening the query.

`sort=released` means model release recency. `sort=updated` means newest source
evidence and must not be described as model recency.

Fetch a full model record with its URL-encoded canonical id:

```text
GET /models/openai%2Fgpt-5
```

Static GitHub Pages exposes a compact model index and base64url-named individual files, but no arbitrary server-side filtering. Prefer the Vercel API for queries and the static mirror for complete downloads.

## Comparison lanes

A comparison lane is the exact tuple of canonical benchmark, metric, unit,
variant, effort, evaluator, dataset version, and configuration. The API exposes
that tuple through `lane_id`. Sort by score only after selecting one lane; a
mixed-lane score sort is a client error.

Two observations with the same benchmark ID are not automatically comparable.
Never average or median different lanes, and never move a score between model
versions, batch routes, quantizations, tool modes, or reasoning efforts. Keep
multiple sources within a lane as separate observations unless the upstream
methodology explicitly defines an aggregate.

## Field interpretation

| Need | Inspect | Important caveat |
| --- | --- | --- |
| General quality | `benchmarks[]` | Match canonical benchmark, metric, variant, effort, evaluator, version, and unit. Exclude aggregate/claim rows. |
| Structured output | `capabilities`, offer `supported_parameters`, relevant benchmarks/measurements | A support flag is not an adherence percentage. |
| Tool use | `capabilities`, offer `supported_parameters`, tool-use benchmarks | Declared support and measured reliability are different claims. |
| Reasoning | `reasoning[]`, offer `reasoning_efforts` | Availability does not imply the same token budget or behavior across providers. |
| Speed | offer `runtime[]`, then model `runtime_observations[]` | Preserve scope, percentile, window, and source. Median-only data hides tails. |
| Context | model and offer `context_tokens`, `max_output_tokens` | The route may be more restrictive than the model. |
| Cost | offer `pricing[]`, workload estimate details | Normalize units and include cache read/write, output, reasoning, request, and applicable tier dimensions. Unknown required dimensions make the complete estimate unknown. |
| Cache economics | `cache_read`, `cache_write`, profile estimate | Published cache prices are not a workload cache-hit rate. |
| Quantization | offer `quantization` | Quality impact is unknown unless the same quantized route was evaluated. |
| Privacy/routing | offer `data_policy`, provider identity | Missing policy data is unknown, not privacy-safe. |
| Open deployment | `open_weights`, `license` | Open weights and permissive commercial licensing are separate questions. |
| Freshness | root `generated_at`, `sources[]`, each `evidence` | A fresh snapshot can preserve older evidence from a failed source. |

Vals business benchmarks add observed task accuracy, run configuration, and
where published, task-level latency, token counts, and spend. Treat
`cost_per_test` and `api_cost_usd` as the cost of that evaluation workload, not
as provider list pricing. Likewise, `provider`, `harness`, and effort fields
describe the evaluated setup rather than a currently available provider offer.

LiveBench adds release-versioned objective subtasks across reasoning, coding,
agentic coding, mathematics, data analysis, language, and instruction following.
Its `effort`, `evaluator`, `dataset_version`, and source model id must remain in
the comparison lane. Category and overall observations are explicit derived
aggregates; do not count them as extra task votes. Its evaluation cost, average
token, and published input/output price fields describe the benchmark run, not
a current provider route quote.

## Provenance and confidence

Every important observation should carry `evidence.source_id`, `url`, `fetched_at`, and `status`. `observed` means the adapter read it from that source. `derived` means the source or catalog republished or transformed another source; inspect `derived_from`. `stale` means retained older data.

`identity_confidence` describes the join, not model quality:

- `exact`: strong identifier match;
- `alias`: matched through a known alias;
- `unresolved`: keep separate unless the user accepts the ambiguity.

`benchmark_id` is the canonical identity. `source_benchmark_ids` retains the
upstream field names that were merged into it; use these to audit provider,
harness, metric, and legacy aliases. `kind` distinguishes a primary
`benchmark`, named composite `index`, source-calculated `aggregate`, and opaque
provider `claim`. Do not count BenchLM, CloudPrice, or BenchGecko republishing
the same upstream score as three independent confirmations. The `/benchmarks`
inventory exposes aliases, source coverage, and an `independent_sources` view.

## Offline snapshot analysis

Download both files so field interpretation stays coupled to the data version:

```bash
node scripts/download-snapshot.mjs --out /tmp/models-labyrinth
```

The script fetches health first, reuses a local bundle when its content hash
matches, otherwise downloads schema and snapshot together. It validates root
shape, counts, content hash, and schema version and writes atomically. It fails
visibly; it does not combine Vercel health with a different GitHub Pages
snapshot or hide a broken source behind a fallback.

For a complex but bounded selection, use the selector instead of writing ad hoc
one-off parsers:

```bash
node scripts/select-models.mjs \
  --cache /tmp/models-labyrinth \
  --scope current \
  --provider openrouter \
  --effort high \
  --quantization fp8 \
  --capability tools \
  --capability structured_outputs \
  --min-context 200000 \
  --benchmark agentic.toolathlonVerified \
  --limit 25
```

It parses the snapshot once, joins only explicit source-proven aliases, requires
one offer to satisfy all route gates, and groups observations by `lane_id`.
Records with conflicting release identities are reported as incompatible
observations rather than silently transferred.

To produce a transparent task-specific rank, first inspect the emitted lanes,
then rerun with exact lane IDs and explicit weights:

```bash
node scripts/select-models.mjs --cache /tmp/models-labyrinth \
  --provider openrouter --effort high \
  --score <lane-id>=3:higher \
  --score <another-lane-id>=1:higher \
  --coverage-penalty 1
```

The selector uses tie-aware percentiles within each lane. It emits an observed
weighted score, evidence coverage, a coverage-adjusted aggregate, confidence,
cohort sizes, and per-lane contributions. A benchmark name that maps to multiple
lanes is rejected until one exact lane is chosen. This is a task-relative score,
not a universal model rating.

If custom analysis still exceeds the selector, parse the snapshot once in one
process and build only the indexes needed for the question. Do not repeatedly
parse the full file for every candidate. Typical joins are:

```text
models[]
  -> offers[] by provider / quantization / effort / capability
  -> benchmarks[] by task-relevant benchmark and comparable conditions
  -> evidence by source and freshness
```

Keep a candidate when a preferred metric is missing if it still satisfies all
hard constraints. Preserve its observed score and report the missing-evidence
coverage penalty separately instead of presenting the penalty as measured model
performance.

## Recommendation quality

A good result distinguishes:

1. hard compatibility: the route can accept the workload;
2. task quality: relevant, comparable benchmark evidence;
3. operational behavior: provider-scoped latency, throughput, uptime, policy, and quantization;
4. economics: full workload cost, including cache and output;
5. evidence confidence: freshness, provenance, independence, and missing fields.

When no candidate dominates, explain the frontier: for example, “A has the best relevant quality evidence, B is materially cheaper for cached prefixes, and C has the strongest route-level latency evidence.” That is more useful than an opaque composite score.
