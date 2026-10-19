import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { build as viteBuild, createServer as createViteServer } from "vite";
import { chromium, webkit } from "@playwright/test";
import { config, createBackend } from "./backend.mjs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { workersCapacitorPlugin as vitePlugin } from "../../../../dist/tooling/vite.js";
import { workersCapacitorPlugin as esbuildPlugin } from "../../../../dist/tooling/esbuild.js";
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
async function createUI(root, main, tool, mode, options) {
  if (mode === "dev") {
    await writeFile(
      join(root, "index.html"),
      '<script type="module" src="/main.js"></script>',
    );
    const server = await createViteServer({
      configFile: false,
      root,
      publicDir: false,
      logLevel: "warn",
      plugins: [vitePlugin(options)],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    return {
      url: `http://127.0.0.1:${server.httpServer.address().port}/`,
      close: () => server.close(),
    };
  }
  const out = join(root, "dist");
  if (tool === "vite")
    await viteBuild({
      configFile: false,
      root,
      publicDir: false,
      logLevel: "warn",
      plugins: [vitePlugin(options)],
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
      plugins: [esbuildPlugin(options)],
    });
  const built = await files(out);
  for (const file of built)
    if (/\.(js|map)$/.test(file))
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        /private-do-operation|ASSETS\.fetch/,
      );
  const report = JSON.parse(
    await readFile(join(out, "workers-capacitor-server.json"), "utf8"),
  );
  assert.equal(report.mode, mode === "asset-first" ? "worker" : "routes");
  const entry = relative(
    out,
    built.find((f) => /\/main(?:-[\w-]+)?\.js$/.test(f)),
  );
  const server = createServer(async (req, res) => {
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
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
async function createRemote(root, backend) {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "key.pem",
      "-out",
      "cert.pem",
      "-days",
      "2",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { cwd: root, stdio: "pipe" },
  );
  const received = [];
  let allowedOrigin;
  const server = createSecureServer(
    {
      key: await readFile(join(root, "key.pem")),
      cert: await readFile(join(root, "cert.pem")),
    },
    async (req, res) => {
      if (!allowedOrigin || req.headers.origin !== allowedOrigin) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader("access-control-allow-origin", allowedOrigin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader(
        "access-control-allow-headers",
        "authorization,content-type,if-none-match,range",
      );
      res.setHeader("access-control-allow-methods", "GET,POST,HEAD,OPTIONS");
      res.setHeader("access-control-expose-headers", "etag,content-range");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      received.push({ url: req.url, headers: req.headers });
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await backend.dispatchFetch(
          "https://deployed.invalid" + req.url,
          {
            method: req.method,
            headers: req.headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          },
        );
        res.statusCode = response.status;
        for (const [key, value] of response.headers) res.setHeader(key, value);
        // Keep browser HTTP cache out of the forwarding contract: observe workerd's
        // explicit 304 rather than a cached representation reconstructed by Fetch.
        res.setHeader("cache-control", "no-store");
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end("Test backend request failed");
      }
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `https://127.0.0.1:${server.address().port}`,
    received,
    allowUI(url) {
      allowedOrigin = new URL(url).origin;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
for (const [tool, mode] of [
  ["vite", "worker-first"],
  ["esbuild", "worker-first"],
  ["vite", "asset-first"],
  ["esbuild", "asset-first"],
  ["vite", "dev"],
])
  test(`${tool}/${mode}: remote ASSETS and real Durable Object HTTP/RPC in Chromium/WebKit`, async () => {
    const root = join(artifacts, `${tool}-${mode}`);
    await mkdir(root, { recursive: true });
    const backend = await createBackend(mode !== "asset-first");
    let server, remote;
    try {
      await backend.ready;
      const rangeOracle = await backend.dispatchFetch(
        "https://deployed.invalid/assets",
        { headers: { range: "bytes=0-4" } },
      );
      const expectedRange = {
        status: rangeOracle.status,
        body: await rangeOracle.text(),
      };
      await writeFile(
        join(root, "wrangler.json"),
        JSON.stringify({
          ...config,
          assets: {
            ...config.assets,
            run_worker_first: mode !== "asset-first",
          },
        }),
      );
      remote = await createRemote(root, backend);
      const main = join(root, "main.js");
      await writeFile(
        main,
        `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))};let runtime,token='owner';window.start=async(prefer)=>{runtime=workersCapacitor({baseURL:'https://local.invalid',prefer,remote:{origin:${JSON.stringify(remote.origin)},getToken:()=>token}});await runtime.ready;return runtime.execution;};window.stop=()=>runtime.dispose();window.token=value=>token=value;window.request=async(path,init)=>{const r=await fetch(path,init);return {status:r.status,body:await r.text(),etag:r.headers.get('etag')}};`,
      );
      server = await createUI(root, main, tool, mode, {
        execution: [{ method: "GET", path: "/health" }],
        worker,
        workerConfig: "wrangler.json",
        assetsExecution: "remote",
      });
      remote.allowUI(server.url);
      for (const [engine, launcher] of [
        ["chromium", chromium],
        ["webkit", webkit],
      ]) {
        const browser = await launcher.launch();
        try {
          for (const prefer of ["direct", "worker"]) {
            const context = await browser.newContext({
              ignoreHTTPSErrors: true,
            });
            try {
              const baselineCalls = remote.received.length;
              const page = await context.newPage();
              await page.goto(server.url);
              await page.waitForFunction(() => !!window.start);
              assert.equal(
                await page.evaluate((p) => window.start(p), prefer),
                prefer,
              );
              assert.equal(
                (await page.evaluate(() => window.request("/health"))).body,
                mode === "asset-first" ? "asset-first-health" : "local-health",
              );
              assert.equal(
                remote.received.length - baselineCalls,
                mode === "asset-first" ? 1 : 0,
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
              const beforeRemote = remote.received.length;
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
              assert.equal(remote.received.length, beforeRemote + 3);
              const asset = await page.evaluate(() =>
                window.request("/assets"),
              );
              assert.ok(asset.etag);
              const unchanged = await page.evaluate(
                (etag) =>
                  window.request("/assets", {
                    headers: { "if-none-match": etag },
                  }),
                asset.etag,
              );
              assert.equal(unchanged.status, 304);
              assert.equal(unchanged.body, "");
              const range = await page.evaluate(() =>
                window.request("/assets", { headers: { range: "bytes=0-4" } }),
              );
              assert.equal(remote.received.at(-1).headers.range, "bytes=0-4");
              assert.equal(range.status, expectedRange.status);
              assert.equal(range.body, expectedRange.body);
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
      await server?.close();
      await remote?.close();
      await backend.dispose();
    }
  });
