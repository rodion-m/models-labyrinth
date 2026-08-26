#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const STATUSES = {
  offer: new Set(["selected", "unresolved"]),
  reasoning: new Set(["selected", "unsupported", "unknown", "not_applicable"]),
  evidence: new Set(["measured", "declared", "unsupported", "unknown", "not_applicable"]),
  transfer: new Set(["exact", "partial", "unknown"]),
  cost: new Set(["estimated", "unknown"]),
};

export function validateDecision(document) {
  const errors = [];
  if (!Array.isArray(document?.recommendations) || document.recommendations.length === 0) {
    return ["recommendations must be a non-empty array"];
  }

  document.recommendations.forEach((recommendation, index) => {
    const at = `recommendations[${index}]`;
    requireText(recommendation?.model_id, `${at}.model_id`, errors);
    requireStatus(recommendation?.offer, STATUSES.offer, `${at}.offer`, errors);
    if (recommendation?.offer?.status === "selected") {
      for (const field of ["provider_id", "provider_model_id", "route"]) {
        requireText(recommendation.offer[field], `${at}.offer.${field}`, errors);
      }
      requireOwn(recommendation.offer, "service_tier", `${at}.offer.service_tier`, errors);
      requireOwn(recommendation.offer, "quantization", `${at}.offer.quantization`, errors);
    } else {
      requireText(recommendation?.offer?.reason, `${at}.offer.reason`, errors);
    }

    requireStatus(recommendation?.reasoning, STATUSES.reasoning, `${at}.reasoning`, errors);
    if (recommendation?.reasoning?.status === "selected") {
      requireText(recommendation.reasoning.effort, `${at}.reasoning.effort`, errors);
    } else {
      requireText(recommendation?.reasoning?.reason, `${at}.reasoning.reason`, errors);
    }

    for (const field of ["structured_output", "cache", "privacy", "runtime"]) {
      requireStatus(recommendation?.[field], STATUSES.evidence, `${at}.${field}`, errors);
      requireText(recommendation?.[field]?.evidence, `${at}.${field}.evidence`, errors);
    }

    requireStatus(recommendation?.quality_transfer, STATUSES.transfer, `${at}.quality_transfer`, errors);
    requireText(recommendation?.quality_transfer?.evidence, `${at}.quality_transfer.evidence`, errors);
    requireOwn(recommendation?.quality_transfer, "lane_id", `${at}.quality_transfer.lane_id`, errors);

    requireStatus(recommendation?.cost, STATUSES.cost, `${at}.cost`, errors);
    requireText(recommendation?.cost?.assumptions, `${at}.cost.assumptions`, errors);
    requireText(recommendation?.tradeoff, `${at}.tradeoff`, errors);
    if (!Array.isArray(recommendation?.sources) || recommendation.sources.length === 0) {
      errors.push(`${at}.sources must be a non-empty array`);
    }
  });
  return errors;
}

function requireStatus(value, allowed, path, errors) {
  if (!value || !allowed.has(value.status)) {
    errors.push(`${path}.status must be one of: ${[...allowed].join(", ")}`);
  }
}

function requireText(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${path} must be a non-empty string`);
}

function requireOwn(value, field, path, errors) {
  if (!value || !Object.hasOwn(value, field)) errors.push(`${path} must be present (null is allowed)`);
}

async function main(path) {
  if (!path) throw new Error("Usage: node scripts/validate-decision.mjs <decision.json>");
  const document = JSON.parse(await readFile(path, "utf8"));
  const errors = validateDecision(document);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Decision artifact is complete (${document.recommendations.length} recommendation(s)).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv[2]);
}
