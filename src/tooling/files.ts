import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Only explicitly selected public runtime files enter the mobile filesystem. */
export async function readWorkerFiles(root: string, extra: string[] = []) {
  const files = new Set(extra.map((file) => resolve(root, file)));
  if (!files.size) return undefined;
  const map: Record<string, { base64: string }> = {};
  for (const file of [...files].sort())
    map[file.replaceAll("\\", "/")] = {
      base64: (await readFile(file)).toString("base64"),
    };
  return JSON.stringify(map);
}
