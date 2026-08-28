# Operational validation

Every selected offer needs a bounded real-request validation plan. This is more
than a one-request smoke test, but it is not a capacity benchmark or proof that
rate limits will never occur.

## Default plan

Unless the workload suggests otherwise, propose ten low-cost representative
requests sequentially, then two requests concurrently at concurrency two. Keep
the exact model, provider route, effort, service tier, quantization, output
contract, and routing/fallback policy fixed. “Low-cost” may shorten input and
output, but must still exercise the selected protocol features.

Record every first-attempt status before retries. Acceptance requires zero HTTP
429 responses in the tested envelope. Also report `Retry-After` and rate-limit
headers, transient 5xx/timeouts, the route actually served, latency, token use,
and structured/tool-output failures. Never let retries or silent provider
fallbacks hide a 429. Phrase the result narrowly: “no 429 in 10 sequential plus
2 concurrent requests,” not “the route has no rate limit.”

Adapt the plan and state why:

| Workload | Minimum useful shape |
| --- | --- |
| Interactive | Default 10 sequential + 2 concurrent requests with short representative outputs. |
| RAG / repeated prefix | One cold request, nine sequential warm-prefix requests, then two concurrent warm-prefix requests with distinct suffixes. |
| Agentic | Default bounded route check using representative tool/structured-output steps, followed by at least two complete trajectories when affordable; size concurrency to expected simultaneous agents. |
| Batch | Small representative batch submissions and polling rather than pretending synchronous requests reproduce the workload; test the expected number of simultaneous jobs. |

If production concurrency or requests per minute are known, test around that
envelope with headroom instead of mechanically using the default. Estimate the
maximum cost first and obtain explicit authorization before sending requests.

## Agentic cache validation

For agentic and repeated-prefix workloads, inspect cache support, read/write
pricing, TTL/eligibility rules, and any published hit-rate observation for the
exact `model × provider route`. Cache pricing is not a hit rate. A model-wide or
provider-wide rate is not route- and workload-specific; retain its scope and use
`unknown` when no applicable observation exists.

The proposed real run must keep a known eligible prefix stable while varying the
suffix and collecting provider-reported cache-read/cache-write tokens for every
request. Report both when the telemetry permits:

- request hit rate = eligible warm requests with cache-read tokens / eligible warm requests;
- token hit ratio = total cache-read tokens / total eligible repeated-prefix tokens.

Also compare cold versus warm cost and TTFT, and verify which provider served
each request. Do not infer a cache hit from lower latency or price alone. For an
agentic recommendation, a missing published rate is acceptable only as an
explicit `unknown` paired with this real-run measurement plan.

## Authorization boundary

The skill always proposes this plan. It never executes provider requests or
spends credits without separate explicit authorization. When the user supplies
existing telemetry, analyze it as observed evidence and keep its route, effort,
time window, workload, sample size, and concurrency attached.
