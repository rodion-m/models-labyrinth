import type { FetchOptions } from "./types.js";
import { DEFAULT_MAX_BYTES } from "./constants.js";

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

async function readBody(response: Response, url: string, maxBytes: number): Promise<string> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    throw new FetchError(`response exceeds ${maxBytes} bytes`, url, response.status);
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FetchError(`response exceeds ${maxBytes} bytes`, url, response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function retryDelay(response: Response): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) ? Math.min(2_000, Math.max(100, retryAfter * 1_000)) : 500;
}

export async function fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const retries = options.retries ?? 1;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json", ...(options.headers ?? {}) },
        signal: controller.signal,
      });
      if (response.status === 429 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response)));
        continue;
      }
      if (!response.ok) throw new FetchError(`HTTP ${response.status}`, url, response.status);
      const text = await readBody(response, url, maxBytes);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new FetchError("invalid JSON response", url, response.status);
      }
    } catch (error) {
      if (error instanceof FetchError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new FetchError(message, url);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchError("request failed", url);
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: options.headers, signal: controller.signal });
    if (!response.ok) throw new FetchError(`HTTP ${response.status}`, url, response.status);
    return await readBody(response, url, maxBytes);
  } catch (error) {
    if (error instanceof FetchError) throw error;
    throw new FetchError(error instanceof Error ? error.message : String(error), url);
  } finally {
    clearTimeout(timer);
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return results;
}
