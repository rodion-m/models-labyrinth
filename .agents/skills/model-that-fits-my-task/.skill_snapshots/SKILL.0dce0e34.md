---
name: model-that-fits-my-task
description: Select and compare AI models and provider routes using current Models Labyrinth evidence. Use when a user asks which model or provider to use, asks to rank models, needs alternatives or speed-cost trade-offs, or compares benchmark quality, reasoning effort, quantization, context, structured output, latency, throughput, price, cache behavior, privacy, open weights, or workload budget. Do not use for generic model news, API troubleshooting, or running local evaluations.
---

# Model That Fits My Task

Recommend a deployable `model × provider offer × configuration` from published evidence. Keep model quality separate from provider behavior until the task defines their trade-off.

## Data access

- Query API: `https://models-labyrinth.vercel.app/api/v1`
- Static mirror: `https://rodion-m.github.io/models-labyrinth/api/v1`
- Full snapshot: `https://rodion-m.github.io/models-labyrinth/api/v1/snapshot.json`
- JSON Schema: `https://rodion-m.github.io/models-labyrinth/api/v1/schema.json`

Use Vercel for filtered endpoints and GitHub Pages for complete downloads. Begin with `/health`; report `generated_at` and relevant failed or stale sources. Query `scope=current` unless the user explicitly needs historical, superseded, unresolved, or exhaustive coverage. Never silently substitute unavailable data.

## Decision loop

1. Translate the request into hard constraints and preferences: task, modality, context, tools, structured output, privacy, open weights, provider, quantization, effort, latency, throughput, cache behavior, and workload cost.
2. Ask one focused question only when a missing constraint could reverse the choice. Otherwise state assumptions.
3. Read the narrowest playbook: [benchmark-decision-playbook.md](references/benchmark-decision-playbook.md) for general workloads or [business-domain-playbook.md](references/business-domain-playbook.md) for professional domains.
4. Use `/facets?scope=current` for discovery, then apply provider, capability, effort, context, parameter, runtime, cache, policy, and quantization gates to one offer through `/offers?scope=current`. Do not prove route compatibility from independently aggregated model fields.
5. Use `/benchmark-observations?scope=current` for quality. Compare values only inside one `lane_id`; never average lanes or transfer a score across model versions.
6. Compare surviving `offer × reasoning configuration` pairs on full workload cost and route-scoped operational evidence. Provider choice and effort are decision dimensions, not follow-up details.
7. Return a Pareto decision. If no candidate dominates and ranking weights are necessary, expose them and check whether reasonable reweighting changes the winner.
8. Run the completion gate below before answering. For a consequential ranked decision, validate a small JSON decision artifact before rendering prose.

## Route map

| Need | Start | Read or escalate when |
| --- | --- | --- |
| Fast shortlist | `/facets?scope=current` → `/models?scope=current&view=summary&limit=100` | Read [data-guide.md](references/data-guide.md) for scope, filters, and pagination. |
| Provider, effort, cache, or quantization | `/offers?scope=current` with all route constraints in one query | Use offer evidence; model-level quality cannot establish route behavior. |
| Task-quality ranking | `/benchmarks?kind=benchmark&q=<task>` → `/benchmark-observations?scope=current&benchmark=<id>` | Select one comparison lane before sorting scores. |
| Complex cross-field comparison | Run `scripts/select-models.mjs` with a cache directory | It validates one bundle, reuses matching hashes, parses once, and emits observations without a universal score. |
| Historical or exhaustive research | Repeat a query with `scope=all` or download the full bundle | State why current selection scope was insufficient. |

For OpenRouter endpoint selection after choosing an exact model slug, read [openrouter-provider-ranking.md](references/openrouter-provider-ranking.md) and use the dedicated `openrouter-provider-ranking` skill when available. This handoff is required when the user needs a deployable OpenRouter choice and more than one route can serve the slug. Integrate its result into the final recommendation; do not leave provider or effort as an unasked follow-up. Do not let route speed or price retroactively change the model-quality claim.

## Comparison rules

- Apply hard gates before preferences. Missing data is unknown, never false, zero, free, or poor.
- Treat `scope=current` as a selection default, not a quality claim. Use `scope=all` deliberately and disclose it.
- Prefer the narrowest current benchmark that reproduces the deliverable, tools, policy, modality, and domain. Broad indices are context; `aggregate` and `claim` rows are not independent ranking evidence.
- Resolve canonical IDs through `/benchmarks`. `source_benchmark_ids` are aliases or provenance, not extra votes.
- Preserve benchmark metric, unit, variant, effort, evaluator, dataset version, configuration, source, and date. One numeric comparison uses one `lane_id`; do not calculate a mean or median across lanes.
- Use canonical model identities and source-proven aliases from the API or validated selector. Never normalize punctuation, strip versions, or merge batch/configuration suffixes ad hoc. Never transfer evidence from version 1.1 to 1.2.
- Treat a score as `model × harness × tools × configuration`, not automatically as a base-model property.
- A declared capability such as structured outputs or tools is support metadata, not measured reliability.
- Quantization belongs to an offer. Do not transfer an unquantized score without labeling the quality impact unknown.
- Compare OpenRouter candidates as `endpoint × effort`, not endpoint alone. Never copy an effort from the incumbent or another model. If the route exposes only Boolean reasoning, say that named effort is unsupported.
- Runtime applies only to its stated route, scope, percentile, and window. Median speed hides tail latency.
- Reject implausible units and route-ranker output that cannot be traced to the current endpoint response. Empty stats, `null` policy fields, and undocumented cache behavior remain unknown.
- Cost must reflect the workload: input, output, cache read/write, reasoning tokens, requests, tiers, and non-text media when material. A `null` estimate is unknown.
- Prefer observed evidence over derived data and trace `derived_from`. Republished scores do not become independent confirmations.
- Do not run probes or spend provider credits. Use network sources and transparent calculations only.

For full-snapshot work, use `download-snapshot.mjs` or `select-models.mjs`; do not fetch health, schema, and snapshot independently. The bundle `content_hash` is the evidence identity. In high-stakes domains, published evidence narrows candidates but never replaces organization-specific validation and qualified review.

## Completion gate

A recommendation is incomplete until model, exact offer, reasoning configuration, output contract, operations, economics, and benchmark transfer are each stated. `Unknown`, `unsupported`, or `not applicable` is acceptable when explained; omission is not. Lead with `model × provider route × effort`.

Before a ranked or provider-sensitive answer, read [decision-completion.md](references/decision-completion.md). Use its JSON validator for multiple candidates or consequential deployment decisions.

## Response contract

Lead with the decision. For every recommendation include:

- exact model, provider model id, route/routing mode, service tier, quantization, and reasoning effort/configuration;
- why it fits the workload and which hard constraints it satisfies;
- relevant quality, runtime, context, price/cache, capability, provenance, and freshness evidence;
- the largest trade-off or uncertainty;
- comparison `lane_id`, explicit decision weights when used, and whether sensitivity changes the winner;
- a direct Models Labyrinth record or reproducible query when practical.

End with assumptions and material evidence gaps. Use ranges or qualitative confidence when sources are not directly comparable.
