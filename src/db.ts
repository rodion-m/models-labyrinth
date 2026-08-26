import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RUNTIME_QUERY_FILENAME, SNAPSHOT_CACHE_TTL_MS } from "./constants.js";
import { isRuntimeQueryArtifact, snapshotFromRuntimeArtifact } from "./runtime-artifact.js";
import type { Snapshot } from "./types.js";
import { assertSnapshotShape } from "./schema.js";

let cached: Snapshot | undefined;
let cachedPath: string | undefined;
let cachedAt = 0;

export interface SnapshotLoadOptions {
  path?: string;
  ttlMs?: number;
  now?: () => number;
}

const DEFAULT_RUNTIME_PATH = resolve(process.cwd(), RUNTIME_QUERY_FILENAME);
const DEFAULT_SNAPSHOT_PATH = resolve(process.cwd(), "models_db.json");

export function loadSnapshot(options: SnapshotLoadOptions = {}): Snapshot {
  const path = resolve(options.path ?? defaultSnapshotPath());
  const ttlMs = options.ttlMs ?? SNAPSHOT_CACHE_TTL_MS;
  const now = options.now?.() ?? Date.now();

  if (!cached || cachedPath !== path || now - cachedAt >= ttlMs) {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    cached = decodeLoadedSnapshot(value);
    cachedPath = path;
    cachedAt = now;
  }
  return cached;
}

export function loadArchiveSnapshot(projectRoot = process.cwd()): Snapshot {
  return loadSnapshot({ path: resolve(projectRoot, "models_db.json") });
}

export function clearSnapshotCache(): void {
  cached = undefined;
  cachedPath = undefined;
  cachedAt = 0;
}

function defaultSnapshotPath(): string {
  return existsSync(DEFAULT_RUNTIME_PATH) ? DEFAULT_RUNTIME_PATH : DEFAULT_SNAPSHOT_PATH;
}

function decodeLoadedSnapshot(value: unknown): Snapshot {
  if (isRuntimeQueryArtifact(value)) {
    const snapshot = snapshotFromRuntimeArtifact(value);
    assertSnapshotShape(snapshot);
    return snapshot;
  }
  assertSnapshotShape(value);
  return value;
}
