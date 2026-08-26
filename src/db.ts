import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SNAPSHOT_CACHE_TTL_MS } from "./constants.ts";
import type { Snapshot } from "./types.ts";
import { assertSnapshotShape } from "./schema.ts";

let cached: Snapshot | undefined;
let cachedPath: string | undefined;
let cachedAt = 0;

export interface SnapshotLoadOptions {
  path?: string;
  ttlMs?: number;
  now?: () => number;
}

const DEFAULT_SNAPSHOT_PATH = resolve(process.cwd(), "models_db.json");

export function loadSnapshot(options: SnapshotLoadOptions = {}): Snapshot {
  const path = resolve(options.path ?? DEFAULT_SNAPSHOT_PATH);
  const ttlMs = options.ttlMs ?? SNAPSHOT_CACHE_TTL_MS;
  const now = options.now?.() ?? Date.now();

  if (!cached || cachedPath !== path || now - cachedAt >= ttlMs) {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    assertSnapshotShape(value);
    cached = value;
    cachedPath = path;
    cachedAt = now;
  }
  return cached;
}

export function clearSnapshotCache(): void {
  cached = undefined;
  cachedPath = undefined;
  cachedAt = 0;
}
