import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as vite } from "vite";
import { build as esbuild } from "esbuild";
import { workersCapacitorPlugin as vitePlugin } from "cf-workers-mobile/tooling/vite";
import { workersCapacitorPlugin as esbuildPlugin } from "cf-workers-mobile/tooling/esbuild";
const parent = fileURLToPath(
  new URL("../../../opennext/artifacts/", import.meta.url),
);
for (const tool of ["vite", "esbuild"])
  for (const scenario of ["private-env", "custom-config"])
    test(
      `${tool}: ${scenario} keeps server code and environment values out of every output`,
      { timeout: 60000 },
      async () => {
        await mkdir(parent, { recursive: true });
        const root = await mkdtemp(join(parent, "boundary-"));
        const marker = "UNSELECTED_SERVER_SECRET_VALUE";
        const files = {
          "package.json": '{"type":"module"}',
          "wrangler.json": "{}",
          "index.html": '<script type="module" src="/main.js"></script>',
          "main.js":
            'import {workersCapacitor} from "cf-workers-mobile/capacitor";window.runtime=workersCapacitor({baseURL:"https://worker.invalid",remote:{origin:"https://backend.invalid"}});',
          ".open-next/worker.js": `import {production} from "./cloudflare/next-env.mjs";export default {fetch(){return new Response(${JSON.stringify(marker)}+JSON.stringify(production))}};`,
          ".open-next/.build/open-next.config.mjs":
            'export default {functions:{custom:{routes:["app/page"]}}};',
          ".open-next/cloudflare/next-env.mjs":
            scenario === "private-env"
              ? `export const production={UNSELECTED_ROUTE_KEY:${JSON.stringify(marker)}};`
              : "export const production={};",
          ".next/required-server-files.json": '{"config":{}}',
          ".next/routes-manifest.json": "{}",
          ".next/server/middleware-manifest.json": "{}",
          ".next/server/app-paths-manifest.json": '{"/page":"app/page.js"}',
        };
        try {
          for (const [name, content] of Object.entries(files)) {
            const file = join(root, name);
            await mkdir(join(file, ".."), { recursive: true });
            await writeFile(file, content);
          }
          const options = {
            worker: join(root, ".open-next/worker.js"),
            workerConfig: join(root, "wrangler.json"),
            execution: [{ method: "GET", path: "/" }],
          };
          const outdir = join(root, "www");
          if (tool === "vite")
            await vite({
              root,
              configFile: false,
              publicDir: false,
              logLevel: "silent",
              plugins: [vitePlugin(options)],
              build: { outDir: outdir, sourcemap: true },
            });
          else
            await esbuild({
              absWorkingDir: root,
              entryPoints: ["main.js"],
              outdir,
              bundle: true,
              format: "esm",
              platform: "browser",
              sourcemap: true,
              plugins: [esbuildPlugin(options)],
              logLevel: "silent",
            });
          const report = JSON.parse(
            await readFile(
              join(outdir, "workers-capacitor-server.json"),
              "utf8",
            ),
          );
          assert.equal(report.mode, "worker");
          assert.match(
            report.reason,
            scenario === "private-env" ? /environment/ : /Custom OpenNext/,
          );
          for (const name of await readdir(outdir, { recursive: true }))
            if (/\.(js|map|json)$/.test(name)) {
              const output = await readFile(join(outdir, name), "utf8");
              assert.equal(output.includes(marker), false, name);
              assert.equal(
                output.includes(Buffer.from(marker).toString("base64")),
                false,
                name,
              );
            }
          const cache = join(
            root,
            "node_modules/.cache/workers-capacitor/opennext",
          );
          assert.deepEqual(
            await readdir(cache).catch((error) => {
              if (error.code === "ENOENT") return [];
              throw error;
            }),
            [],
          );
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    );
