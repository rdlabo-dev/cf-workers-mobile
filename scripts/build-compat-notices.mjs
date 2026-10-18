import { copyFile, mkdir, readdir } from "node:fs/promises";

// Keep upstream notices beside the compiled module in the published tarball.
const source = new URL("../src/compat/", import.meta.url);
const output = new URL("../dist/compat/", import.meta.url);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = new URL(`${entry.name}/`, source);
  for (const name of await readdir(directory)) {
    if (!/^(LICENSE|NOTICE)(?:[.-]|$)/.test(name)) continue;
    const destination = new URL(`${entry.name}/`, output);
    await mkdir(destination, { recursive: true });
    await copyFile(new URL(name, directory), new URL(name, destination));
  }
}
