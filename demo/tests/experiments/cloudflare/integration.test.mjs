import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { chromium, webkit } from "@playwright/test";
import { config, createBackend } from "./backend.mjs";
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
  test(`${tool}: remote ASSETS and real Durable Object HTTP/RPC in Chromium/WebKit`, async () => {
    const root = join(artifacts, tool);
    await mkdir(root, { recursive: true });
    const backend = await createBackend();
    let server;
    try {
      await backend.ready;
      await writeFile(join(root, "wrangler.json"), JSON.stringify(config));
      const main = join(root, "main.js");
      await writeFile(
        main,
        `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))};let runtime,token='owner';window.start=async(prefer)=>{runtime=workersCapacitor({baseURL:'https://local.invalid',prefer,remote:{origin:'https://deployed.invalid',getToken:()=>token}});await runtime.ready;return runtime.execution;};window.stop=()=>runtime.dispose();window.token=value=>token=value;window.request=async(path,init)=>{const r=await fetch(path,init);return {status:r.status,body:await r.text(),etag:r.headers.get('etag')}};`,
      );
      const out = join(root, "dist");
      const opts = {
        worker,
        workerConfig: "wrangler.json",
        assetsExecution: "remote",
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
      server = createServer(async (req, res) => {
        if (req.url === "/") {
          res.setHeader("content-type", "text/html");
          res.end(`<script type="module" src="/${entry}"></script>`);
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
                await page.evaluate((p) => window.start(p), prefer),
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
              const beforeRemote = remoteCalls;
              assert.equal(
                (await page.evaluate(() => window.request("/assets"))).body,
                "cloud-assets",
              );
              assert.equal(
                (await page.evaluate(() => window.request("/spa/deep"))).body,
                "cloud-assets",
              );
              const head = await page.evaluate(() =>
                window.request("/assets", { method: "HEAD" }),
              );
              assert.equal(head.status, 200);
              assert.equal(head.body, "");
              assert.equal(remoteCalls, beforeRemote + 3);
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
