import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const config = {
  durable_objects: {
    bindings: [
      { name: "OBJECTS", class_name: "Counter", script_name: "objects" },
    ],
  },
  assets: {
    binding: "ASSETS",
    run_worker_first: true,
    html_handling: "none",
    not_found_handling: "single-page-application",
  },
};
export async function createBackend(runWorkerFirst = true) {
  const directory = await mkdtemp(join(tmpdir(), "cw-cloud-assets-"));
  await writeFile(join(directory, "index.html"), "cloud-assets");
  await writeFile(join(directory, "assets"), "cloud-assets");
  await writeFile(join(directory, "health"), "asset-first-health");
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL("worker.js", import.meta.url))],
    bundle: true,
    format: "esm",
    write: false,
  });
  const backend = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "app",
          modules: true,
          script: compiled.outputFiles[0].text,
          compatibilityDate: "2026-10-01",
          durableObjects: {
            OBJECTS: { className: "Counter", scriptName: "objects" },
          },
          assets: {
            directory,
            routerConfig: { has_user_worker: true },
            binding: "ASSETS",
            run_worker_first: runWorkerFirst,
            assetConfig: {
              html_handling: "none",
              not_found_handling: "single-page-application",
            },
          },
        },
        {
          name: "objects",
          modules: true,
          compatibilityDate: "2026-10-01",
          durableObjects: { SELF: { className: "Counter", useSQLite: true } },
          script: `import {DurableObject} from 'cloudflare:workers';export class Counter extends DurableObject {async increment(){const n=(await this.ctx.storage.get('n')??0)+1;await this.ctx.storage.put('n',n);return n;}async fetch(){return Response.json({count:await this.ctx.storage.get('n')??0});}}export default {fetch(){return new Response('objects')}};`,
        },
      ],
    }),
  );
  const dispose = backend.dispose.bind(backend);
  backend.dispose = async () => {
    try {
      await dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    await backend.ready;
    return backend;
  } catch (error) {
    await backend.dispose();
    throw error;
  }
}
