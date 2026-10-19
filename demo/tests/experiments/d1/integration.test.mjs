import { databaseIntegration } from "../server/integration.mjs";
databaseIntegration("d1");

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { workersCapacitorPlugin as vitePlugin } from "../../../../dist/tooling/vite.js";
import { workersCapacitorPlugin as esbuildPlugin } from "../../../../dist/tooling/esbuild.js";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
for (const tool of ["vite", "esbuild"])
  for (const boundary of ["authentication", "data", "manual", "network"])
    test(`${tool}: ${boundary} policy excludes private contents from every shipped asset`, async () => {
      const artifacts = join(repo, "demo/artifacts");
      await mkdir(artifacts, { recursive: true });
      const root = await mkdtemp(join(artifacts, "distribution-"));
      const secret = "PRIVATE_DISTRIBUTION_CANARY_591cb";
      try {
        const source = `import {Hono} from 'hono'; const app = new Hono();
          app.get('/', c => c.html('<h1>PUBLIC_RENDERING_CONTROL</h1>'));
          ${boundary === "authentication" ? `app.use('/private/*', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/private/data', c => c.json({customer:'${secret}'}));` : `const config = {title:'public',privateKey:'${secret}'}; app.get('/private/data', c => c.text(config.title));`}
          app.get('/db', c => c.json(c.env.DB)); export default app;`;
        await writeFile(join(root, "worker.js"), source);
        await writeFile(
          join(root, "wrangler.json"),
          JSON.stringify({ d1_databases: [{ binding: "DB" }] }),
        );
        const main = join(root, "main.js");
        await writeFile(
          main,
          `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))}; window.runtime = workersCapacitor({baseURL:'https://local.invalid',remote:{origin:'https://deployed.invalid'}});`,
        );
        const options = {
          worker: join(root, "worker.js"),
          workerConfig: "wrangler.json",
          ...(boundary === "manual"
            ? {
                execution: "manual",
                localRoutes: [{ method: "GET", path: "/" }],
              }
            : boundary === "network"
              ? { execution: "network" }
              : {}),
        };
        const outdir = join(root, "out");
        if (tool === "vite")
          await viteBuild({
            root,
            configFile: false,
            publicDir: false,
            logLevel: "error",
            plugins: [vitePlugin(options)],
            build: {
              outDir: outdir,
              sourcemap: true,
              minify: true,
              rollupOptions: { input: main },
            },
          });
        else
          await build({
            absWorkingDir: root,
            entryPoints: [main],
            bundle: true,
            platform: "browser",
            format: "esm",
            outdir,
            sourcemap: true,
            minify: true,
            logLevel: "silent",
            plugins: [esbuildPlugin(options)],
          });
        const files = await readdir(outdir, {
          recursive: true,
          withFileTypes: true,
        });
        let publicControl = false;
        for (const file of files) {
          if (!file.isFile()) continue;
          const content = await readFile(
            join(file.parentPath, file.name),
            "utf8",
          );
          assert.ok(
            !content.includes(secret),
            `${tool}: private data leaked into ${file.name}`,
          );
          if (
            file.name.endsWith(".js") &&
            content.includes("PUBLIC_RENDERING_CONTROL")
          )
            publicControl = true;
        }
        assert.equal(
          publicControl,
          boundary !== "network",
          "only network policy removes independent public rendering",
        );
        if (boundary === "authentication") {
          const original = await build({
            stdin: { contents: source, resolveDir: root },
            bundle: true,
            format: "esm",
            write: false,
          });
          const { default: worker } = await import(
            `data:text/javascript;base64,${Buffer.from(original.outputFiles[0].text).toString("base64")}`
          );
          const env = { API_SECRET: "test-owner" };
          assert.equal(
            (
              await worker.fetch(
                new Request("https://original.invalid/private/data"),
                env,
              )
            ).status,
            401,
          );
          assert.ok(
            (
              await (
                await worker.fetch(
                  new Request("https://original.invalid/private/data", {
                    headers: { authorization: "test-owner" },
                  }),
                  env,
                )
              ).text()
            ).includes(secret),
          );
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
