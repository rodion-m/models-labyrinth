import { createHash } from "node:crypto";
import { slugify, stringValue } from "./utils.js";

const OPENROUTER_VARIANTS = new Set(["free", "thinking", "nitro", "floor", "exacto"]);

export function splitOpenRouterVariant(rawId: string): { baseId: string; variant?: string } {
  const index = rawId.lastIndexOf(":");
  if (index < 0) return { baseId: rawId };
  const suffix = rawId.slice(index + 1).toLowerCase();
  return OPENROUTER_VARIANTS.has(suffix)
    ? { baseId: rawId.slice(0, index), variant: suffix }
    : { baseId: rawId };
}

function normalizePath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^openrouter\//, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:/-]/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
}

export function canonicalModelId(input: {
  sourceId: string;
  rawId?: unknown;
  publisher?: unknown;
  name?: unknown;
}): { id: string; sourceModelId: string; variant?: string; confidence: "exact" | "alias" | "unresolved" } {
  const sourceModelId = stringValue(input.rawId) ?? stringValue(input.name) ?? "unknown";
  const split = input.sourceId === "openrouter" ? splitOpenRouterVariant(sourceModelId) : { baseId: sourceModelId };
  const base = normalizePath(split.baseId);
  if (base.includes("/")) {
    return { id: base, sourceModelId, variant: split.variant, confidence: "exact" };
  }
  const publisher = normalizePath(slugify(input.publisher));
  if (publisher !== "unknown" && base !== "unknown") {
    return { id: `${publisher}/${base}`, sourceModelId, variant: split.variant, confidence: "alias" };
  }
  return { id: unresolvedModelId(input.sourceId, sourceModelId), sourceModelId, variant: split.variant, confidence: "unresolved" };
}

export function unresolvedModelId(sourceId: string, sourceModelId: string): string {
  const digest = createHash("sha256").update(`${sourceId}:${sourceModelId}`).digest("hex").slice(0, 16);
  return `unresolved/${sourceId}/${digest}`;
}

export function alias(id: string, sourceId: string, kind = "source_id") {
  return { id, source_id: sourceId, kind };
}
