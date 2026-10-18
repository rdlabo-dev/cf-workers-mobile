import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { chromium, webkit } from "@playwright/test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { workersCapacitorPlugin as vitePlugin } from "../../../../dist/vite.js";
import { workersCapacitorPlugin as esbuildPlugin } from "../../../../dist/esbuild.js";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const worker = fileURLToPath(new URL("worker.js", import.meta.url));
const artifacts = join(repo, "demo/artifacts/cloudflare-bindings");
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((f) =>
        f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)],
      ),
    )
  ).flat();
}
for (const tool of ["vite", "esbuild"])
  test(`${tool}: local ASSETS and real Durable Object HTTP/RPC in Chromium/WebKit`, async () => {
    const root = join(artifacts, tool);
    await mkdir(root, { recursive: true });
    const backendBuild = await build({
      entryPoints: [worker],
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
            script: backendBuild.outputFiles[0].text,
            compatibilityDate: "2026-10-01",
            durableObjects: {
              OBJECTS: { className: "Counter", scriptName: "objects" },
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
    let server;
    try {
      await backend.ready;
      await writeFile(
        join(root, "wrangler.json"),
        JSON.stringify({
          durable_objects: {
            bindings: [
              {
                name: "OBJECTS",
                class_name: "Counter",
                script_name: "objects",
              },
            ],
          },
          assets: {
            binding: "ASSETS",
            run_worker_first: true,
            html_handling: "none",
            not_found_handling: "single-page-application",
          },
        }),
      );
      const main = join(root, "main.js");
      await writeFile(
        main,
        `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))};import {LocalAssets} from ${JSON.stringify(join(repo, "dist/features/assets/index.js"))};let runtime,token='owner';window.start=async(prefer,assets)=>{runtime=workersCapacitor({baseURL:'https://local.invalid',prefer,...(assets?{env:{ASSETS:new LocalAssets({'/assets':'/static/index.html','/index.html':'/static/index.html'},{baseURL:location.href,notFoundHandling:'single-page-application'})}}:{}),remote:{origin:'https://deployed.invalid',getToken:()=>token}});await runtime.ready;return runtime.execution;};window.stop=()=>runtime.dispose();window.token=value=>token=value;window.request=async(path,init)=>{const r=await fetch(path,init);return {status:r.status,body:await r.text()}};`,
      );
      const out = join(root, "dist");
      const opts = {
        worker,
        workerConfig: "wrangler.json",
        assetsExecution: "local",
      };
      if (tool === "vite")
        await viteBuild({
          configFile: false,
          root,
          publicDir: false,
          logLevel: "warn",
          plugins: [vitePlugin(opts)],
          build: {
            outDir: out,
            emptyOutDir: true,
            minify: false,
            sourcemap: true,
            rollupOptions: { input: main },
          },
        });
      else
        await build({
          absWorkingDir: root,
          entryPoints: [main],
          bundle: true,
          format: "esm",
          platform: "browser",
          outdir: out,
          sourcemap: true,
          plugins: [esbuildPlugin(opts)],
        });
      const built = await files(out);
      for (const file of built)
        if (/\.(js|map)$/.test(file))
          assert.doesNotMatch(
            await readFile(file, "utf8"),
            /private-do-operation/,
          );
      const entry = relative(
        out,
        built.find((f) => /\/main(?:-[\w-]+)?\.js$/.test(f)),
      );
      let assetReads = 0;
      server = createServer(async (req, res) => {
        if (req.url === "/") {
          res.setHeader("content-type", "text/html");
          res.end(`<script type="module" src="/${entry}"></script>`);
          return;
        }
        if (req.url === "/static/index.html") {
          assetReads++;
          res.setHeader("content-type", "text/html");
          res.end(req.method === "HEAD" ? undefined : "packaged-assets");
          return;
        }
        try {
          const path = join(out, new URL(req.url, "http://local").pathname);
          res.setHeader(
            "content-type",
            path.endsWith(".js") ? "text/javascript" : "application/json",
          );
          res.end(await readFile(path));
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      for (const [engine, launcher] of [
        ["chromium", chromium],
        ["webkit", webkit],
      ]) {
        const browser = await launcher.launch();
        try {
          for (const prefer of ["direct", "worker"]) {
            const context = await browser.newContext();
            try {
              let remoteCalls = 0;
              await context.route(
                "https://deployed.invalid/**",
                async (route) => {
                  const req = route.request();
                  const cors = {
                    "access-control-allow-origin": req.headers().origin,
                    "access-control-allow-credentials": "true",
                    "access-control-allow-headers":
                      "authorization,content-type",
                    "access-control-allow-methods": "GET,POST,HEAD,OPTIONS",
                  };
                  if (req.method() === "OPTIONS") {
                    await route.fulfill({ status: 204, headers: cors });
                    return;
                  }
                  remoteCalls++;
                  const response = await backend.dispatchFetch(req.url(), {
                    method: req.method(),
                    headers: req.headers(),
                    body: req.postDataBuffer() ?? undefined,
                  });
                  await route.fulfill({
                    status: response.status,
                    headers: {
                      ...Object.fromEntries(response.headers),
                      ...cors,
                    },
                    body: Buffer.from(await response.arrayBuffer()),
                  });
                },
              );
              const page = await context.newPage();
              await page.goto(`http://127.0.0.1:${server.address().port}/`);
              await page.waitForFunction(() => !!window.start);
              assert.equal(
                await page.evaluate((p) => window.start(p, false), prefer),
                prefer,
              );
              assert.equal(
                (await page.evaluate(() => window.request("/health"))).body,
                "local-health",
              );
              const path = `/counter/${tool}-${engine}-${prefer}`;
              assert.equal(
                JSON.parse(
                  (
                    await page.evaluate(
                      (p) => window.request(p, { method: "POST" }),
                      path,
                    )
                  ).body,
                ).count,
                1,
              );
              assert.equal(
                JSON.parse(
                  (
                    await page.evaluate(
                      (p) => window.request(p, { method: "POST" }),
                      path,
                    )
                  ).body,
                ).count,
                2,
              );
              assert.equal(
                JSON.parse(
                  (await page.evaluate((p) => window.request(p), path)).body,
                ).count,
                2,
              );
              await page.evaluate(() => window.token("wrong"));
              assert.equal(
                (
                  await page.evaluate(
                    (p) => window.request(p, { method: "POST" }),
                    path,
                  )
                ).status,
                401,
              );
              await page.evaluate(() => window.token("owner"));
              assert.equal(
                JSON.parse(
                  (await page.evaluate((p) => window.request(p), path)).body,
                ).count,
                2,
              );
              await page.evaluate(() => window.stop());
              const beforeReads = assetReads;
              assert.equal(
                await page.evaluate((p) => window.start(p, true), prefer),
                "direct",
              );
              assert.equal(assetReads, beforeReads);
              const beforeRemote = remoteCalls;
              assert.equal(
                (await page.evaluate(() => window.request("/assets"))).body,
                "packaged-assets",
              );
              assert.equal(
                (await page.evaluate(() => window.request("/spa/deep"))).body,
                "packaged-assets",
              );
              const head = await page.evaluate(() =>
                window.request("/assets", { method: "HEAD" }),
              );
              assert.equal(head.status, 200);
              assert.equal(head.body, "");
              assert.equal(remoteCalls, beforeRemote);
              await page.evaluate(() => window.stop());
            } finally {
              await context.close();
            }
          }
        } finally {
          await browser.close();
        }
      }
    } finally {
      if (server)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      await backend.dispose();
    }
  });
