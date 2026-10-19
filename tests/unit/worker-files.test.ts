import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readWorkerFiles } from "../../src/tooling/files.js";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("embeds only explicitly selected public files, never adjacent server metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-files-"));
  directories.push(root);
  const files = [
    ".next/required-server-files.json",
    ".next/server/app-paths-manifest.json",
    ".next/server/server-reference-manifest.json",
    ".next/prerender-manifest.json",
    "node_modules/next/package.json",
    "handler.mjs",
    "handler.mjs.meta.json",
    ".next/server/app/page.js",
    ".next/server/app/page.js.nft.json",
    "node_modules/next/build-only.json",
  ];
  for (const file of files) {
    const path = join(root, "server-functions/default", file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file);
  }
  await writeFile(join(root, "template.txt"), "runtime template");
  const embedded = JSON.parse((await readWorkerFiles(root, ["template.txt"]))!);
  expect(
    Object.keys(embedded)
      .map((path) => path.slice(root.length + 1))
      .sort(),
  ).toEqual(["template.txt"]);
  expect(
    Buffer.from(
      embedded[join(root, "template.txt")].base64,
      "base64",
    ).toString(),
  ).toBe("runtime template");
  expect(await readWorkerFiles(root)).toBeUndefined();
});
it("does not add a filesystem to ordinary Workers", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-files-"));
  directories.push(root);
  expect(await readWorkerFiles(root)).toBeUndefined();
});
