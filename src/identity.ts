import { createHash } from "node:crypto";
import { slugify, stringValue } from "./utils.js";

const ROUTING_VARIANTS = new Set(["free", "thinking", "nitro", "floor", "exacto", "batch", "extended"]);

export function splitRoutingVariant(rawId: string): { baseId: string; variant?: string } {
  const index = rawId.lastIndexOf(":");
  if (index < 0) return { baseId: rawId };
  const suffix = rawId.slice(index + 1).toLowerCase();
  return ROUTING_VARIANTS.has(suffix)
    ? { baseId: rawId.slice(0, index), variant: suffix }
    : { baseId: rawId };
}

export const splitOpenRouterVariant = splitRoutingVariant;

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

function compactDateToIso(value: string): string | undefined {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = Date.parse(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return undefined;
  if (new Date(parsed).toISOString().slice(0, 10) !== iso) return undefined;
  return iso;
}

function normalizeDateSpellings(value: string, sourceId: string): string {
  if (sourceId !== "models_dev" || !/^openai\/(?:gpt|chatgpt|o\d)/.test(value)) return value;
  return value
    .replace(/\d{4}\.\d{2}\.\d{2}/g, (match) => compactDateToIso(match.replaceAll(".", "")) ?? match)
    .replace(/(^|[^0-9])(\d{8})(?=[^0-9]|$)/g, (match, prefix: string, digits: string) => {
      const iso = compactDateToIso(digits);
      return iso ? `${prefix}${iso}` : match;
    });
}

function normalizeVersionPunctuation(value: string, sourceId: string): string {
  const sourceUsesHyphenatedVersions = sourceId === "benchlm" || sourceId === "benchgecko";
  const knownFamily = /^(?:google\/gemini-|z-ai\/glm-|meta\/muse-spark-)/.test(value);
  if (!sourceUsesHyphenatedVersions || !knownFamily) return value;
  const dates: string[] = [];
  const protectedValue = value.replace(/\d{4}-\d{2}-\d{2}/g, (match) => {
    dates.push(match);
    return `\0D${dates.length - 1}\0`;
  });
  const converted = protectedValue.replace(/(^|[^0-9])(\d{1,2})-(\d{1,2})(?=[^0-9]|$)/g, (match, prefix: string, left: string, right: string) => {
    if (left.length === 1 || right.length === 1) return `${prefix}${left}.${right}`;
    return match;
  });
  return converted.replace(/\0D(\d+)\0/g, (_, index: string) => dates[Number(index)]);
}

export function canonicalModelId(input: {
  sourceId: string;
  rawId?: unknown;
  publisher?: unknown;
  name?: unknown;
}): { id: string; sourceModelId: string; variant?: string; confidence: "exact" | "alias" | "unresolved" } {
  const sourceModelId = stringValue(input.rawId) ?? stringValue(input.name) ?? "unknown";
  const split = splitRoutingVariant(sourceModelId);
  const normalizedPath = normalizePath(split.baseId);
  const base = normalizeVersionPunctuation(normalizeDateSpellings(normalizedPath, input.sourceId), input.sourceId);
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
