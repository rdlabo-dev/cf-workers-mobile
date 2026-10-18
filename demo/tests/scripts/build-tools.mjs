import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/esbuild";
import { capacitorWorkersPlugin as vitePlugin } from "@rdlabo/capacitor-workers/vite";
const root = fileURLToPath(new URL("../../", import.meta.url));
// Dedicated Worker contract via the configured-worker route: the node
// contract worker is the configured entry of these builds.
const nodeWorker = "tests/fixtures/workers/compatibility/node-contracts.ts";
await viteBuild({
  configFile: false,
  base: "./",
  root: resolve(root, "tests/fixtures/apps/build-tools"),
  plugins: [
    vitePlugin({ worker: "../../workers/compatibility/node-contracts.ts" }),
  ],
  build: {
    outDir: resolve(root, "artifacts/build-tools/vite-node"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: resolve(root, "tests/fixtures/apps/build-tools/node.html"),
    },
  },
});
await viteBuild({
  configFile: false,
  base: "./",
  root: resolve(root, "tests/fixtures/apps/build-tools"),
  plugins: [vitePlugin()],
  build: {
    outDir: resolve(root, "artifacts/build-tools/vite-static-node"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: resolve(root, "tests/fixtures/apps/build-tools/static-node.html"),
    },
  },
});
{
  const outdir = resolve(root, "artifacts/build-tools/esbuild-node");
  await esbuild({
    absWorkingDir: root,
    entryPoints: { "nested/app": "tests/fixtures/apps/build-tools/node.ts" },
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    splitting: true,
    assetNames: "assets/[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    plugins: [capacitorWorkersPlugin({ worker: nodeWorker })],
  });
  await writeFile(
    resolve(outdir, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>esbuild node contract</title></head><body><script type="module" src="./nested/app.js"></script></body></html>',
  );
}
for (const framework of ["hono", "express"]) {
  await viteBuild({
    configFile: resolve(root, "tests/fixtures/apps/build-tools/vite.config.ts"),
    mode: framework,
  });
  const outdir = resolve(root, `artifacts/build-tools/esbuild-${framework}`);
  await esbuild({
    absWorkingDir: root,
    entryPoints: { "nested/app": "tests/fixtures/apps/build-tools/main.ts" },
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    splitting: true,
    assetNames: "assets/[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
    plugins: [
      capacitorWorkersPlugin({
        worker: `tests/fixtures/workers/${framework}/standard.ts`,
      }),
    ],
  });
  await writeFile(
    resolve(outdir, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>esbuild contract</title></head><body><script type="module" src="./nested/app.js"></script></body></html>',
  );
}
const raw = resolve(root, "artifacts/build-tools/raw");
await mkdir(raw, { recursive: true });
await cp(resolve(root, "tests/fixtures/apps/build-tools/raw"), raw, {
  recursive: true,
});
// Copy the ESM distribution verbatim: these files are never bundled.
const dist = dirname(
  fileURLToPath(import.meta.resolve("@rdlabo/capacitor-workers")),
);
await cp(dist, resolve(raw, "lib"), { recursive: true });
