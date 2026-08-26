import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Snapshot } from "./types.js";
import { assertSnapshotShape } from "./schema.js";
import { stableValue } from "./hash.js";

export async function readSnapshot(path: string): Promise<Snapshot | undefined> {
  try {
    const text = await fs.readFile(path, "utf8");
    const value: unknown = JSON.parse(text);
    assertSnapshotShape(value);
    return value;
  } catch (error: any) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeSnapshotAtomic(path: string, snapshot: Snapshot): Promise<void> {
  const temporary = `${path}.tmp`;
  await fs.mkdir(dirname(path), { recursive: true });
  const text = `${JSON.stringify(stableValue(snapshot), null, 2)}\n`;
  const handle = await fs.open(temporary, "w");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, path);
}
