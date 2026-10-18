import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
export const documentSW = "workers-capacitor-sw.js";
export const documentManifest = "workers-capacitor-assets.json";
export async function listAssets(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(directory, join(entry.parentPath, entry.name)).replaceAll(
          "\\",
          "/",
        ),
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function documentAssets(files: string[]) {
  return {
    [documentManifest]: JSON.stringify(
      [...new Set([...files, documentSW, documentManifest, "index.html"])].map(
        (file) => "/" + file,
      ),
    ),
    [documentSW]: await readFile(
      new URL("../browser/documents/service-worker.js", import.meta.url),
      "utf8",
    ),
  };
}
