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

Use Vercel for filtered endpoints and GitHub Pages for complete downloads. Begin with `/health`; report `generated_at` and relevant failed or stale sources. Never silently substitute unavailable data.

## Decision loop

1. Translate the request into hard constraints and preferences: task, modality, context, tools, structured output, privacy, open weights, provider, quantization, effort, latency, throughput, cache behavior, and workload cost.
2. Ask one focused question only when a missing constraint could reverse the choice. Otherwise state assumptions.
3. Read the narrowest playbook: [benchmark-decision-playbook.md](references/benchmark-decision-playbook.md) for general workloads or [business-domain-playbook.md](references/business-domain-playbook.md) for professional domains.
4. Check `/facets`, then eliminate candidates that fail hard constraints with `/models?view=summary` or `/offers`.
5. Compare quality only on task-relevant benchmark observations with matching metric, release, evaluator, effort, variant, and harness.
6. Compare surviving offers on route-scoped context, parameters, quantization, runtime, policy, cache pricing, and full workload cost.
7. Return one primary choice and usually two purposeful alternatives: value and a fallback emphasizing another trade-off.

## Route map

| Need | Start | Read or escalate when |
| --- | --- | --- |
| Fast shortlist | `/facets` → `/models?view=summary&limit=100` | Read [data-guide.md](references/data-guide.md) for filter semantics and pagination. |
| Provider, effort, cache, or quantization | `/offers` with exact model and workload filters | Use offer evidence; model-level quality cannot establish route behavior. |
| Task-quality ranking | `/benchmarks?kind=benchmark&q=<task>` → complete model records | Read the matching decision playbook; do not rank unlike observations. |
| Complex cross-field comparison | Download snapshot and schema together | Parse once and build only the indexes needed for this question. |

For OpenRouter endpoint selection after choosing an exact model slug, read [openrouter-provider-ranking.md](references/openrouter-provider-ranking.md) and use the dedicated `openrouter-provider-ranking` skill when available. Do not let route speed or price retroactively change the model-quality claim.

## Comparison rules

- Apply hard gates before preferences. Missing data is unknown, never false, zero, free, or poor.
- Prefer the narrowest current benchmark that reproduces the deliverable, tools, policy, modality, and domain. Broad indices are context; `aggregate` and `claim` rows are not independent ranking evidence.
- Resolve canonical IDs through `/benchmarks`. `source_benchmark_ids` are aliases or provenance, not extra votes.
- Preserve benchmark metric, unit, variant, effort, evaluator, dataset version, configuration, source, and date. Do not mix releases or tool/no-tool lanes.
- Treat a score as `model × harness × tools × configuration`, not automatically as a base-model property.
- A declared capability such as structured outputs or tools is support metadata, not measured reliability.
- Quantization belongs to an offer. Do not transfer an unquantized score without labeling the quality impact unknown.
- Runtime applies only to its stated route, scope, percentile, and window. Median speed hides tail latency.
- Cost must reflect the workload: input, output, cache read/write, reasoning tokens, requests, tiers, and non-text media when material. A `null` estimate is unknown.
- Prefer observed evidence over derived data and trace `derived_from`. Republished scores do not become independent confirmations.
- Do not run probes or spend provider credits. Use network sources and transparent calculations only.

Prefer a Pareto comparison over an opaque universal score. If weights are necessary, expose them and check whether reasonable reweighting changes the winner. In high-stakes domains, published evidence narrows candidates but never replaces organization-specific validation and qualified review.

## Response contract

Lead with the decision. For every recommendation include:

- exact model and, when supported, provider model id, route, quantization, and reasoning effort;
- why it fits the workload and which hard constraints it satisfies;
- relevant quality, runtime, context, price/cache, capability, provenance, and freshness evidence;
- the largest trade-off or uncertainty;
- a direct Models Labyrinth record or reproducible query when practical.

End with assumptions and material evidence gaps. Use ranges or qualitative confidence when sources are not directly comparable.
