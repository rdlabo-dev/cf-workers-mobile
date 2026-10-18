import { copyFile, mkdir, readdir } from "node:fs/promises";

// Keep upstream notices beside their module across domain and subpath folders.
const source = new URL("../src/compat/", import.meta.url);
const output = new URL("../dist/compat/", import.meta.url);
async function copyNotices(directory, destination) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await copyNotices(
        new URL(`${entry.name}/`, directory),
        new URL(`${entry.name}/`, destination),
      );
    } else if (/^(LICENSE|NOTICE)(?:[.-]|$)/.test(entry.name)) {
      await mkdir(destination, { recursive: true });
      await copyFile(
        new URL(entry.name, directory),
        new URL(entry.name, destination),
      );
    }
  }
}
await copyNotices(source, output);
