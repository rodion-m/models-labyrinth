# Decision completion

Use this gate after model-quality and route research, before rendering the final answer. It prevents a model shortlist from being mistaken for a deployable choice.

| Dimension | Required result |
| --- | --- |
| Model | Canonical model/version; no score borrowed from a neighboring version. |
| Workload | Kind and named/custom profile that determine cost and operational validation. |
| Offer | Exact provider, provider model id, route or routing mode, service tier, and quantization, or an explicit unresolved reason. |
| Reasoning | Selected effort/configuration, or explicit unsupported/unknown status. Never inherit it from another model. |
| Output contract | Route-level structured-output support and whether it is declared or measured. |
| Operations | Cache semantics, privacy/data policy, runtime evidence, fallback behavior, and unknowns. Agentic workloads also require route/workload-scoped cache hit rate or explicit `unknown`. |
| Economics | Workload cost and assumptions, including reasoning and cache dimensions. |
| Quality transfer | Benchmark lane and whether its model/configuration/quantization match the selected offer. |
| Aggregate score | If used: explicit lanes and weights, observed score, coverage-adjusted score, confidence, contributions, and sensitivity result. |
| Operational validation | Proposed/completed/blocked status; sequential and parallel request counts, workload basis, explicit HTTP 429 and `Retry-After` checks, acceptance rule, and authorization boundary. Agentic workloads must measure cache hit rate. |

For every recommendation, write a temporary JSON artifact and run:

```bash
node scripts/validate-decision.mjs /path/to/decision.json
```

Each recommendation must provide the fields represented by the table. The validator accepts explicit `unknown`, `unsupported`, and `not_applicable` statuses with evidence or reasons. It checks completeness, not truth or recommendation quality. Delete the temporary artifact after use.

In prose, lead each choice with the deployable triple `model × provider route × effort`. Then state the largest trade-off and the material unknowns. If no offer or effort can be resolved, say so in that lead rather than hiding it in a footnote.
