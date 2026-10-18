import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { build as viteBuild, createServer as createViteServer } from "vite";
import { chromium, webkit } from "@playwright/test";
import { config, createBackend } from "./backend.mjs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { capacitorWorkersPlugin as vitePlugin } from "../../../../dist/vite.js";
import { capacitorWorkersPlugin as esbuildPlugin } from "../../../../dist/esbuild.js";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = fileURLToPath(new URL("worker.js", import.meta.url));
const artifacts = join(repo, "demo/artifacts/service-bindings");
const report = [];
let backend, bucket, kv, results;
before(async () => {
  await mkdir(artifacts, { recursive: true });
  backend = await createBackend();
  await backend.ready;
  bucket = await backend.getR2Bucket("BUCKET", "application");
  kv = await backend.getKVNamespace("CLOUD_KV", "application");
  results = await backend.getKVNamespace("RESULTS", "consumer");
});
after(async () => {
  await backend?.dispose();
  await writeFile(
    join(artifacts, "report.json"),
    JSON.stringify(report, null, 2),
  );
});
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
  for (const mode of ["split", "worker"])
    test(`${tool}/${mode}: R2, cloud KV, HTTP/RPC services and queue delivery`, async () => {
      const root = join(artifacts, `${tool}-${mode}`);
      await mkdir(root, { recursive: true });
      const worker = mode === "split" ? fixture : join(root, "worker.js");
      if (mode === "worker")
        await writeFile(
          worker,
          `import app from ${JSON.stringify(fixture)};export default {fetch(req,env,ctx){return app.fetch(req,env,ctx);}}`,
        );
      await writeFile(join(root, "wrangler.json"), JSON.stringify(config));
      const main = join(root, "main.js");
      await writeFile(
        main,
        `import {capacitorWorkers} from ${JSON.stringify(join(repo, "dist/index.js"))};import {LocalStorageKV} from ${JSON.stringify(join(repo, "dist/features/kv/index.js"))};let runtime,token='test-owner';window.start=async (prefer,localKV=false)=>{runtime=capacitorWorkers({baseURL:'https://local.invalid',prefer,...(localKV?{env:{CLOUD_KV:new LocalStorageKV('service-test').create()}}:{}),remote:{origin:'https://deployed.invalid',getToken:()=>token,maxBufferedBodyBytes:1024}});await runtime.ready;return runtime.execution;};window.deviceValue=key=>new LocalStorageKV('service-test').create().get(key);window.stop=()=>runtime.dispose();window.token=value=>token=value;window.request=async(path,init)=>{const res=await fetch(path,init);return {status:res.status,text:await res.text(),etag:res.headers.get('etag'),effects:res.headers.get('x-effects')}};`,
      );
      const out = join(root, "dist");
      if (tool === "vite")
        await viteBuild({
          configFile: false,
          root,
          publicDir: false,
          logLevel: "warn",
          plugins: [vitePlugin({ worker, workerConfig: "wrangler.json" })],
          build: {
            outDir: out,
            emptyOutDir: true,
            sourcemap: true,
            minify: false,
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
          plugins: [esbuildPlugin({ worker, workerConfig: "wrangler.json" })],
        });
      const built = await files(out);
      for (const file of built)
        if (/\.(js|map)$/.test(file))
          assert.doesNotMatch(
            await readFile(file, "utf8"),
            /createMultipartUpload|resumeMultipartUpload|\.sendBatch\(|CLOUD_KV\.getWithMetadata|private-bucket-name|private-kv-id|private-queue-name|private-internal/,
            `server code leaked: ${file}`,
          );
      assert.equal(
        JSON.parse(
          await readFile(join(out, "capacitor-workers-server.json"), "utf8"),
        ).mode,
        mode === "split" ? "routes" : "worker",
      );
      const entry = relative(
        out,
        built.find((file) => /\/main(?:-[\w-]+)?\.js$/.test(file)),
      );
      const server = createServer(async (req, res) => {
        try {
          if (req.url === "/") {
            res.setHeader("content-type", "text/html");
            res.end(`<script type="module" src="/${entry}"></script>`);
            return;
          }
          const path = join(out, new URL(req.url, "http://localhost").pathname);
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
      try {
        for (const [engine, launcher] of [
          ["chromium", chromium],
          ["webkit", webkit],
        ]) {
          const browser = await launcher.launch();
          try {
            for (const prefer of ["direct", "worker"]) {
              const context = await browser.newContext();
              let calls = 0;
              await context.route(
                "https://deployed.invalid/**",
                async (route) => {
                  const req = route.request();
                  const cors = {
                    "access-control-allow-origin": req.headers().origin,
                    "access-control-allow-credentials": "true",
                    "access-control-allow-headers":
                      "authorization,content-type",
                    "access-control-allow-methods":
                      "GET,PUT,POST,DELETE,HEAD,OPTIONS",
                    "access-control-expose-headers": "etag,x-effects",
                  };
                  if (req.method() === "OPTIONS") {
                    await route.fulfill({ status: 204, headers: cors });
                    return;
                  }
                  calls++;
                  const res = await backend.dispatchFetch(req.url(), {
                    method: req.method(),
                    headers: req.headers(),
                    body: req.postDataBuffer() ?? undefined,
                  });
                  await route.fulfill({
                    status: res.status,
                    headers: { ...Object.fromEntries(res.headers), ...cors },
                    body: Buffer.from(await res.arrayBuffer()),
                  });
                },
              );
              const page = await context.newPage();
              const errors = [];
              page.on("pageerror", (e) => errors.push(String(e)));
              await page.goto(`http://127.0.0.1:${server.address().port}`);
              await page.waitForFunction(
                () => typeof window.start === "function",
              );
              assert.equal(
                await page.evaluate((prefer) => window.start(prefer), prefer),
                prefer,
              );
              const request = (path, init) =>
                page.evaluate(
                  ([path, init]) => window.request(path, init),
                  [path, init],
                );
              assert.equal((await request("/health")).text, '{"local":true}');
              assert.equal(calls, mode === "split" ? 0 : 1);
              const key = `${tool}-${mode}-${engine}-${prefer}`;
              let before = calls;
              const put = await request(`/api/objects/${key}`, {
                method: "PUT",
                body: "abcdefghi",
              });
              assert.equal(put.status, 201);
              assert.equal(calls, before + 1);
              assert.equal(await (await bucket.get(key)).text(), "abcdefghi");
              const read = await request(`/api/objects/${key}`);
              assert.equal(read.text, "abcdefghi");
              assert.ok(read.etag);
              assert.equal(
                (await request(`/api/objects/${key}?offset=2`)).text,
                "cde",
              );
              assert.equal(
                (await request(`/api/objects/${key}?etag=wrong`)).status,
                412,
              );
              const head = await request(`/api/objects/${key}`, {
                method: "HEAD",
              });
              assert.equal(head.status, 200);
              assert.equal(head.text, "");
              const multi = key + "-multipart";
              const { uploadId } = JSON.parse(
                (await request(`/api/multipart/${multi}`, { method: "POST" }))
                  .text,
              );
              const part = JSON.parse(
                (
                  await request(`/api/multipart/${multi}/${uploadId}`, {
                    method: "PUT",
                    body: "multipart-body",
                  })
                ).text,
              );
              assert.equal(
                (
                  await request(`/api/multipart/${multi}/${uploadId}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify([part]),
                  })
                ).status,
                200,
              );
              assert.equal(
                await (await bucket.get(multi)).text(),
                "multipart-body",
              );
              assert.equal(
                (
                  await request(`/api/kv/${key}`, {
                    method: "PUT",
                    body: "shared-value",
                  })
                ).status,
                204,
              );
              assert.equal(await kv.get(key), "shared-value");
              const cloudValue = JSON.parse(
                (await request(`/api/kv/${key}`)).text,
              );
              assert.equal(cloudValue.value, "shared-value");
              assert.deepEqual(cloudValue.metadata, { owner: "test-owner" });
              assert.deepEqual(
                JSON.parse((await request("/api/service")).text),
                { http: "internal-worker-result", rpc: 5 },
              );
              before = calls;
              assert.equal(
                (await request(`/api/jobs/${key}`, { method: "POST" })).status,
                202,
              );
              assert.equal(calls, before + 1);
              let messages;
              for (let i = 0; i < 100; i++) {
                messages = await Promise.all([
                  results.get(key),
                  results.get(key + "-batch"),
                ]);
                if (messages.every(Boolean)) break;
                await delay(50);
              }
              assert.deepEqual(messages.map(JSON.parse), [
                { id: key, kind: "single" },
                { id: key + "-batch", kind: "batch" },
              ]);
              await page.evaluate(() => window.token(undefined));
              before = calls;
              assert.equal(
                (
                  await request(`/api/objects/${key}`, {
                    method: "PUT",
                    body: "bad",
                  })
                ).status,
                401,
              );
              assert.equal(calls, before + 1);
              assert.equal(await (await bucket.get(key)).text(), "abcdefghi");
              await page.evaluate(() => window.token("test-owner"));
              before = calls;
              await assert.rejects(
                () =>
                  request(`/api/objects/${key}`, {
                    method: "PUT",
                    body: "x".repeat(1025),
                  }),
                /maxBufferedBodyBytes/,
              );
              assert.equal(calls, before);
              assert.equal(await (await bucket.get(key)).text(), "abcdefghi");
              if (mode === "split") {
                await page.evaluate(() => window.stop());
                assert.equal(
                  await page.evaluate(
                    (prefer) => window.start(prefer, true),
                    prefer,
                  ),
                  "direct",
                );
                before = calls;
                assert.equal(
                  (
                    await request(`/settings/${key}`, {
                      method: "PUT",
                      body: "device-value",
                    })
                  ).status,
                  204,
                );
                assert.equal(
                  (await request(`/settings/${key}`)).text,
                  "device-value",
                );
                assert.equal(calls, before, "KV-only requests do not dispatch");
                assert.equal(
                  await kv.get(key),
                  "shared-value",
                  "local writes do not change cloud KV",
                );
                assert.equal(
                  JSON.parse((await request(`/api/kv/${key}`)).text).value,
                  "shared-value",
                  "R2/KV request uses cloud KV",
                );
                assert.equal(calls, before + 1);
                await context.setOffline(true);
                assert.equal(
                  (await request(`/settings/${key}`)).text,
                  "device-value",
                );
                await context.setOffline(false);
              } else {
                await page.evaluate(() => window.stop());
                await page.evaluate(
                  (prefer) => window.start(prefer, true),
                  prefer,
                );
                before = calls;
                assert.equal(
                  (await request(`/settings/${key}`)).text,
                  "shared-value",
                );
                await request(`/settings/${key}`, {
                  method: "PUT",
                  body: "whole-remote-value",
                });
                assert.equal(
                  calls,
                  before + 2,
                  "whole-Worker fallback sends KV-only routes remotely",
                );
                assert.equal(await kv.get(key), "whole-remote-value");
                assert.equal(
                  await page.evaluate((key) => window.deviceValue(key), key),
                  null,
                  "remote execution does not touch device KV",
                );
              }
              await request(`/api/kv/${key}`, { method: "DELETE" });
              assert.equal(await kv.get(key), null);
              assert.equal(
                (await request(`/api/objects/${key}`, { method: "DELETE" }))
                  .status,
                204,
              );
              assert.equal(await bucket.get(key), null);
              if (mode === "split") {
                await context.setOffline(true);
                assert.equal((await request("/health")).status, 200);
                await context.setOffline(false);
              }
              await page.evaluate(() => window.stop());
              assert.deepEqual(errors, []);
              report.push({ tool, mode, engine, prefer, passed: true });
              await context.close();
            }
          } finally {
            await browser.close();
          }
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

test("Vite development dispatches service routes in both execution modes", async () => {
  const root = join(artifacts, "development");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "wrangler.json"), JSON.stringify(config));
  await writeFile(
    join(root, "index.html"),
    '<script type="module" src="/main.js"></script>',
  );
  await writeFile(
    join(root, "main.js"),
    `import {capacitorWorkers} from ${JSON.stringify(join(repo, "dist/index.js"))};window.run=async prefer=>{const runtime=capacitorWorkers({baseURL:'https://local.invalid',prefer,remote:{origin:'https://deployed.invalid',getToken:()=> 'test-owner'}});try{await runtime.ready;return {execution:runtime.execution,local:await(await fetch('/health')).json(),service:await(await fetch('/api/service')).json()};}finally{await runtime.dispose();}};`,
  );
  const server = await createViteServer({
    configFile: false,
    root,
    logLevel: "warn",
    plugins: [vitePlugin({ worker: fixture, workerConfig: "wrangler.json" })],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route("https://deployed.invalid/**", async (route) => {
      const req = route.request();
      const headers = {
        "access-control-allow-origin": req.headers().origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "authorization,content-type",
      };
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      const res = await backend.dispatchFetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
      });
      await route.fulfill({
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), ...headers },
        body: Buffer.from(await res.arrayBuffer()),
      });
    });
    const page = await context.newPage();
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => typeof window.run === "function");
    for (const prefer of ["direct", "worker"]) {
      const result = await page.evaluate(
        (prefer) => window.run(prefer),
        prefer,
      );
      assert.equal(result.execution, prefer);
      assert.deepEqual(result.local, { local: true });
      assert.deepEqual(result.service, {
        http: "internal-worker-result",
        rpc: 5,
      });
    }
    report.push({ tool: "vite-development", passed: true });
  } finally {
    await browser?.close();
    await server.close();
  }
});
