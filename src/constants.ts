import type { WorkloadProfile } from "./types.js";

export const SCHEMA_VERSION = "1.0" as const;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
export const CACHE_TTL_SECONDS = 60 * 60;
export const SNAPSHOT_CACHE_TTL_MS = Number.POSITIVE_INFINITY;
export const CURRENT_RELEASE_WINDOW_DAYS = 730;
export const EVIDENCE_STALE_MS = 36 * 60 * 60 * 1_000;
export const RUNTIME_QUERY_FILENAME = "runtime-query.json";

export const WORKLOAD_PROFILES: WorkloadProfile[] = [
  {
    id: "chat-short",
    description: "Short interactive request without a reusable prefix.",
    input_tokens: 1_000,
    cached_input_ratio: 0,
    output_tokens: 300,
    requests_per_task: 1,
  },
  {
    id: "rag-long-prefix",
    description: "Long retrieval prompt with a mostly reusable prefix.",
    input_tokens: 25_000,
    cached_input_ratio: 0.8,
    output_tokens: 1_000,
    requests_per_task: 1,
  },
  {
    id: "agentic-multistep",
    description: "Growing context across a multi-step agent workflow.",
    input_tokens: 25_000,
    cached_input_ratio: 0.7,
    output_tokens: 1_000,
    requests_per_task: 7,
  },
  {
    id: "batch-long-output",
    description: "Batch-style request with a long generated answer.",
    input_tokens: 4_000,
    cached_input_ratio: 0,
    output_tokens: 8_000,
    requests_per_task: 1,
  },
];
