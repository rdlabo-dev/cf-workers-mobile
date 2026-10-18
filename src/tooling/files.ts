import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

/** Embed runtime metadata, not OpenNext's already-bundled code or build traces. */
export async function readWorkerFiles(
  entry: string | undefined,
  root: string,
  extra: string[] = [],
) {
  const files = new Set(extra.map((file) => resolve(root, file)));
  if (entry && basename(entry) === "worker.js") {
    const server = resolve(dirname(entry), "server-functions/default");
    if (existsSync(resolve(server, ".next/required-server-files.json"))) {
      for (const file of await readdir(server, { recursive: true })) {
        if (
          basename(file) === "package.json" ||
          (file.replaceAll("\\", "/").startsWith(".next/") &&
            file.endsWith(".json") &&
            !file.endsWith(".nft.json"))
        )
          files.add(resolve(server, file));
      }
    }
  }
  if (!files.size) return undefined;
  const map: Record<string, { base64: string }> = {};
  for (const file of [...files].sort())
    map[file.replaceAll("\\", "/")] = {
      base64: (await readFile(file)).toString("base64"),
    };
  return JSON.stringify(map);
}
