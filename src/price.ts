import type { PricePoint, PriceUnit } from "./types.ts";
import { asArray, asRecord, numberValue, stringValue } from "./utils.ts";

type PriceSpec = { dimension: string; unit: PriceUnit };

const OPENROUTER_PRICE_SPECS: Record<string, PriceSpec> = {
  prompt: { dimension: "input", unit: "token" },
  completion: { dimension: "output", unit: "token" },
  input_cache_read: { dimension: "cache_read", unit: "token" },
  input_cache_write: { dimension: "cache_write", unit: "token" },
  input_cache_write_1h: { dimension: "cache_write_1h", unit: "token" },
  internal_reasoning: { dimension: "reasoning", unit: "token" },
  input_audio: { dimension: "audio_input", unit: "token" },
  output_audio: { dimension: "audio_output", unit: "token" },
  input_audio_cache: { dimension: "audio_cache_read", unit: "token" },
  image_token: { dimension: "image_input", unit: "token" },
  image: { dimension: "image", unit: "image" },
  image_output: { dimension: "image_output", unit: "image" },
  web_search: { dimension: "web_search", unit: "search" },
  request: { dimension: "request", unit: "request" },
};

function rounded(value: number): number {
  return Number(value.toPrecision(15));
}

function point(spec: PriceSpec, raw: unknown, kind: PricePoint["kind"] = "fixed"): PricePoint {
  const rawValue = typeof raw === "number" || typeof raw === "string" ? raw : null;
  const parsed = numberValue(raw);
  const variable = stringValue(raw) === "-1" || parsed === undefined;
  return {
    dimension: spec.dimension,
    unit: spec.unit,
    amount_usd_per_unit: variable ? null : rounded(parsed),
    raw: rawValue,
    kind: variable ? "variable" : kind,
  };
}

export function normalizeOpenRouterPricing(pricing: unknown): PricePoint[] {
  const input = asRecord(pricing);
  const prices: PricePoint[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === "overrides" || value === null || value === undefined) continue;
    const spec = OPENROUTER_PRICE_SPECS[key] ?? { dimension: key, unit: "unknown" as const };
    prices.push(point(spec, value));
  }
  for (const override of asArray(input.overrides)) {
    const record = asRecord(override);
    const schedule = {
      utc_days: Array.isArray(record.utc_days) ? record.utc_days.filter((day): day is string => typeof day === "string") : undefined,
      utc_start: numberValue(record.utc_start),
      utc_end: numberValue(record.utc_end),
    };
    for (const [key, value] of Object.entries(record)) {
      if (key === "utc_days" || key === "utc_start" || key === "utc_end") continue;
      const spec = OPENROUTER_PRICE_SPECS[key] ?? { dimension: key, unit: "unknown" as const };
      prices.push({ ...point(spec, value, "scheduled"), kind: "scheduled", schedule });
    }
  }
  return prices.sort(comparePrices);
}

export function normalizeMillionPricing(cost: unknown): PricePoint[] {
  const input = asRecord(cost);
  const names: Record<string, string> = {
    input: "input",
    output: "output",
    cache_read: "cache_read",
    cache_write: "cache_write",
    reasoning: "reasoning",
    input_audio: "audio_input",
    output_audio: "audio_output",
    image: "image",
    request: "request",
  };
  const prices: PricePoint[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === "tiers" || key === "context_over_200k" || key === "currency") continue;
    const dimension = names[key];
    if (!dimension) continue;
    const parsed = numberValue(value);
    prices.push({
      dimension,
      unit: key === "request" ? "request" : key === "image" ? "image" : "million_tokens",
      amount_usd_per_unit: parsed === undefined ? null : rounded(parsed),
      raw: typeof value === "number" || typeof value === "string" ? value : null,
      kind: parsed === undefined ? "variable" : "fixed",
    });
  }
  for (const tier of asArray(input.tiers)) {
    const record = asRecord(tier);
    const tierMeta = asRecord(record.tier);
    const type = tierMeta.type === "volume" ? "volume" : "context";
    const min = numberValue(tierMeta.size ?? tierMeta.min);
    for (const [key, value] of Object.entries(record)) {
      if (key === "tier") continue;
      const dimension = names[key];
      if (!dimension) continue;
      const parsed = numberValue(value);
      prices.push({
        dimension,
        unit: key === "request" ? "request" : key === "image" ? "image" : "million_tokens",
        amount_usd_per_unit: parsed === undefined ? null : rounded(parsed),
        raw: typeof value === "number" || typeof value === "string" ? value : null,
        kind: "tiered",
        tier: { type, min },
      });
    }
  }
  const longContext = asRecord(input.context_over_200k);
  if (Object.keys(longContext).length > 0) {
    for (const [key, value] of Object.entries(longContext)) {
      const dimension = names[key];
      if (!dimension) continue;
      const parsed = numberValue(value);
      prices.push({
        dimension,
        unit: "million_tokens",
        amount_usd_per_unit: parsed === undefined ? null : rounded(parsed),
        raw: typeof value === "number" || typeof value === "string" ? value : null,
        kind: "tiered",
        tier: { type: "context", min: 200_000 },
      });
    }
  }
  return prices.sort(comparePrices);
}

export function normalizePortkeyPricing(pricing: unknown): PricePoint[] {
  const root = asRecord(pricing);
  const config = asRecord(root.pricing_config ?? root);
  const payg = asRecord(config.pay_as_you_go);
  const prices: PricePoint[] = [];
  const map: Record<string, string> = {
    request_token: "input",
    response_token: "output",
    cache_write_input_token: "cache_write",
    cache_read_input_token: "cache_read",
  };
  for (const [key, dimension] of Object.entries(map)) {
    const raw = asRecord(payg[key]).price;
    const parsed = numberValue(raw);
    prices.push({
      dimension,
      unit: "token",
      amount_usd_per_unit: parsed === undefined ? null : rounded(parsed / 100),
      raw: typeof raw === "number" || typeof raw === "string" ? raw : null,
      kind: parsed === undefined ? "variable" : "fixed",
    });
  }
  return prices.sort(comparePrices);
}

function comparePrices(a: PricePoint, b: PricePoint): number {
  return `${a.dimension}:${a.kind}:${a.unit}:${JSON.stringify(a.tier ?? {})}:${JSON.stringify(a.schedule ?? {})}`
    .localeCompare(`${b.dimension}:${b.kind}:${b.unit}:${JSON.stringify(b.tier ?? {})}:${JSON.stringify(b.schedule ?? {})}`);
}
