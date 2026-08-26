import { createHash } from "node:crypto";
import { stableJson } from "./hash.js";
import type { BenchmarkObservation } from "./types.js";

export type LaneFields = Pick<
  BenchmarkObservation,
  "benchmark_id" | "metric" | "unit" | "variant" | "effort" | "evaluator" | "dataset_version" | "configuration"
>;

export function comparisonLaneId(observation: LaneFields): string {
  const parts = [
    observation.benchmark_id,
    observation.metric ?? "",
    observation.unit ?? "",
    observation.variant ?? "",
    observation.effort ?? "",
    observation.evaluator ?? "",
    observation.dataset_version ?? "",
    stableJson(observation.configuration ?? {}),
  ].join("\u001f");
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}
