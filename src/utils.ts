export function asRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const result = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return result || undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "" || value.trim() === "-1") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

export function boolValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function arrayOfStrings(value: unknown): string[] {
  return asArray(value).map(stringValue).filter((value): value is string => Boolean(value));
}

export function slugify(value: unknown): string {
  return (stringValue(value) ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function nestedNumberMap(value: unknown): Record<string, number> {
  const output: Record<string, number> = {};
  function visit(current: unknown, path: string[]): void {
    const number = numberValue(current);
    if (number !== undefined) {
      output[path.join(".")] = number;
      return;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    for (const [key, child] of Object.entries(current)) {
      visit(child, [...path, slugify(key)]);
    }
  }
  visit(value, []);
  return output;
}

export function mergeUniqueStrings(...values: Array<string[] | undefined>): string[] {
  return [...new Set(values.flatMap((value) => value ?? []))].sort();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stableSort<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}
