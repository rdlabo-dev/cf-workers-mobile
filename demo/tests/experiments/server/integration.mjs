import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, relative } from "node:path";
import { build } from "esbuild";
import { build as viteBuild, createServer as createViteServer } from "vite";
import { chromium, webkit } from "@playwright/test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import mysql from "mysql2/promise";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workersCapacitorPlugin as vitePlugin } from "../../../../dist/tooling/vite.js";
import { workersCapacitorPlugin as esbuildPlugin } from "../../../../dist/tooling/esbuild.js";

export function databaseIntegration(kind) {
  const hyperdrive = kind === "hyperdrive";
  const repo = fileURLToPath(new URL("../../../../", import.meta.url));
  const fixture = fileURLToPath(
    new URL(`../${kind}/worker.js`, import.meta.url),
  );
  const artifacts = join(repo, `demo/artifacts/${kind}-integration`);
  let database, backend;
  const mysqlURL = process.env.HYPERDRIVE_TEST_MYSQL_URL;
  const config = hyperdrive
    ? {
        hyperdrive: [
          {
            binding: "SQL",
            id: "server-only-hyperdrive-id",
            localConnectionString: mysqlURL,
          },
        ],
      }
    : { d1_databases: [{ binding: "DB" }] };
  const row = async () =>
    hyperdrive
      ? (
          await database.execute(
            "SELECT value FROM private_counters WHERE owner = ?",
            ["alice"],
          )
        )[0][0]
      : database
          .prepare("SELECT value FROM private_counters WHERE owner = ?")
          .bind("alice")
          .first();
  const report = [];
  before(async () => {
    if (hyperdrive && !mysqlURL)
      throw new Error(
        "Set HYPERDRIVE_TEST_MYSQL_URL to a dedicated disposable MySQL test database",
      );
    await mkdir(artifacts, { recursive: true });
    const contents = `import app from ${JSON.stringify(fixture)};
    let effects=0; export default { async fetch(req,env,ctx) { effects++; const response=await app.fetch(req,env,ctx); response.headers.set('x-effect-total',String(effects)); return response; } };`;
    let script;
    if (hyperdrive) {
      // Use the actual Workers build tool for mysql2's Node.js compatibility
      // imports, exactly as a deployed Worker does. This is a local dry run.
      const entry = join(artifacts, "server-worker.js");
      const workerConfig = join(artifacts, "server-wrangler.json");
      const outdir = join(artifacts, "server-build");
      await writeFile(entry, contents);
      await writeFile(
        workerConfig,
        JSON.stringify({
          name: "hyperdrive-acceptance",
          main: entry,
          compatibility_date: "2026-10-01",
          compatibility_flags: ["nodejs_compat"],
        }),
      );
      await promisify(execFile)(
        process.execPath,
        [
          join(repo, "demo/node_modules/wrangler/bin/wrangler.js"),
          "deploy",
          "--dry-run",
          "--config",
          workerConfig,
          "--outdir",
          outdir,
        ],
        { cwd: repo },
      );
      script = await readFile(join(outdir, "server-worker.js"), "utf8");
    } else {
      const server = await build({
        stdin: { contents, resolveDir: repo },
        bundle: true,
        format: "esm",
        platform: "browser",
        write: false,
      });
      script = server.outputFiles[0].text;
    }
    backend = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script,
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        ...(hyperdrive
          ? { hyperdrives: { SQL: mysqlURL } }
          : { d1Databases: ["DB"] }),
      }),
    );
    await backend.ready;
    if (hyperdrive) {
      database = await mysql.createConnection(mysqlURL);
      await database.execute(
        "CREATE TABLE IF NOT EXISTS private_counters (owner VARCHAR(64) PRIMARY KEY, value INTEGER NOT NULL)",
      );
      await database.execute(
        "INSERT INTO private_counters VALUES ('alice', 0), ('bob', 0) ON DUPLICATE KEY UPDATE value = 0",
      );
    } else {
      database = await backend.getD1Database("DB");
      await database.exec(
        "CREATE TABLE private_counters (owner TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO private_counters VALUES ('alice', 0), ('bob', 0);",
      );
    }
  });

  test("Vite development reads Wrangler, protects original sources, and rebuilds the split graph on edits", async () => {
    const root = join(artifacts, "development");
    await mkdir(root, { recursive: true });
    const worker = join(root, "worker.js");
    const original = await readFile(fixture, "utf8");
    await writeFile(worker, original);
    await writeFile(join(root, "wrangler.jsonc"), JSON.stringify(config));
    await writeFile(
      join(root, "index.html"),
      '<script type="module" src="/main.js"></script>',
    );
    await writeFile(
      join(root, "main.js"),
      `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))};
    window.run=async prefer=>{const runtime=workersCapacitor({baseURL:'https://local.invalid/',prefer,remote:{origin:'https://deployed-worker.invalid',getToken:()=> 'test-alice'}});try{await runtime.ready;return {execution:runtime.execution,html:await(await fetch('/')).text(),row:await(await fetch('/api/counters/alice')).json()};}finally{await runtime.dispose();}};`,
    );
    const server = await createViteServer({
      configFile: false,
      root,
      logLevel: "warn",
      plugins: [
        vitePlugin({
          worker: "worker.js",
          execution: [{ method: "*", path: "*" }],
        }),
      ],
      server: {
        host: "127.0.0.1",
        port: 0,
        watch: { usePolling: true, interval: 100 },
      },
    });
    await server.listen();
    let browser;
    try {
      browser = await chromium.launch();
      const context = await browser.newContext();
      await context.route(
        "https://deployed-worker.invalid/**",
        async (route) => {
          const request = route.request();
          const headers = {
            "access-control-allow-origin": request.headers().origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-headers": "authorization,content-type",
            "access-control-allow-methods": "GET,POST,HEAD,OPTIONS",
          };
          if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          const response = await backend.dispatchFetch(request.url(), {
            method: request.method(),
            headers: request.headers(),
          });
          await route.fulfill({
            status: response.status,
            headers: { ...Object.fromEntries(response.headers), ...headers },
            body: Buffer.from(await response.arrayBuffer()),
          });
        },
      );
      const page = await context.newPage();
      context.on("response", (response) => {
        if (response.status() >= 400)
          console.error("dev response", response.status(), response.url());
      });
      page.on("console", (message) => {
        if (message.type() === "error")
          console.error("dev console", message.text());
      });
      page.on("pageerror", (error) => console.error("dev page", error));
      page.on("requestfailed", (request) =>
        console.error("dev request", request.url(), request.failure()),
      );
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForFunction(() => typeof window.run === "function");
      for (const prefer of ["direct", "worker"]) {
        const result = await page.evaluate(
          (prefer) => window.run(prefer),
          prefer,
        );
        assert.equal(result.execution, prefer);
        assert.equal(result.row.owner, "alice");
        assert.match(result.html, /Existing Worker UI/);
      }
      const leaked = await page.request.get(
        new URL("worker.js?raw", server.resolvedUrls.local[0]).href,
      );
      assert.ok(leaked.status() >= 400);
      assert.doesNotMatch(await leaked.text(), /SELECT owner/);
      const loaded = page.waitForEvent("load");
      await writeFile(
        worker,
        original.replace("Existing Worker UI", "Updated Worker UI"),
      );
      await loaded;
      await page.waitForFunction(() => typeof window.run === "function");
      assert.match(
        (await page.evaluate(() => window.run("direct"))).html,
        /Updated Worker UI/,
      );
      report.push({
        tool: "vite-development",
        rebuild: true,
        sourceGuard: true,
        passed: true,
      });
      await context.close();
    } finally {
      await browser?.close();
      await server.close();
    }
  });
  after(async () => {
    await backend?.dispose();
    if (hyperdrive) await database?.end();
    await writeFile(
      join(artifacts, "report.json"),
      JSON.stringify(report, null, 2),
    );
  });
  async function files(directory) {
    return (
      await Promise.all(
        (await readdir(directory, { withFileTypes: true })).map((file) =>
          file.isDirectory()
            ? files(join(directory, file.name))
            : [join(directory, file.name)],
        ),
      )
    ).flat();
  }
  for (const tool of ["vite", "esbuild"])
    for (const mode of ["split", "worker"])
      test(`${tool}/${mode}: public startup, real ${kind} backend, Chromium/WebKit direct and Dedicated Worker`, async () => {
        const root = join(artifacts, `${tool}-${mode}`);
        await mkdir(root, { recursive: true });
        const entryWorker =
          mode === "split" ? fixture : join(root, "original-worker.js");
        if (mode === "worker")
          await writeFile(
            entryWorker,
            `import app from ${JSON.stringify(fixture)}; export default { fetch(request,env,ctx){ return app.fetch(request,env,ctx); } };`,
          );
        await writeFile(join(root, "wrangler.jsonc"), JSON.stringify(config));
        const main = join(root, "main.js");
        await writeFile(
          main,
          `import {workersCapacitor} from ${JSON.stringify(join(repo, "dist/index.js"))};
    let runtime; let token='test-alice';
    window.start=async prefer=>{ runtime=workersCapacitor({baseURL:'https://local.invalid/',prefer,remote:{origin:'https://deployed-worker.invalid',getToken:()=>token}}); await runtime.ready; return runtime.execution; };
    window.stop=()=>runtime.dispose();
    window.token=value=>token=value;
    window.request=async(path,init)=>{const response=await fetch(path,init);return {status:response.status,text:await response.text(),effects:response.headers.get('x-effect-total')};};
  `,
        );
        const out = join(root, "dist");
        if (tool === "vite")
          await viteBuild({
            configFile: false,
            root,
            publicDir: false,
            logLevel: "warn",
            plugins: [
              vitePlugin({
                execution: [{ method: "*", path: "*" }],
                worker: entryWorker,
                workerConfig: "wrangler.jsonc",
              }),
            ],
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
            plugins: [
              esbuildPlugin({
                execution: [{ method: "*", path: "*" }],
                worker: entryWorker,
                workerConfig: "wrangler.jsonc",
              }),
            ],
          });
        const built = await files(out);
        const diagnostics = JSON.parse(
          await readFile(
            join(
              out,
              hyperdrive
                ? "workers-capacitor-server.json"
                : "workers-capacitor-d1.json",
            ),
            "utf8",
          ),
        );
        assert.equal(diagnostics.mode, mode === "split" ? "routes" : "worker");
        for (const file of built)
          if (/\.(js|map)$/.test(file))
            assert.doesNotMatch(
              await readFile(file, "utf8"),
              /private_counters|readCounter|SELECT owner|mysql2|disableEval|server-only-hyperdrive-id|hyperdrive-test-only/,
              `${tool}: leaked implementation in ${file}`,
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
            const path = join(
              out,
              new URL(req.url, "http://localhost").pathname,
            );
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
                  "https://deployed-worker.invalid/**",
                  async (route) => {
                    const request = route.request();
                    const cors = {
                      "access-control-allow-origin": request.headers().origin,
                      "access-control-allow-credentials": "true",
                      "access-control-allow-headers":
                        "authorization,content-type",
                      "access-control-allow-methods": "GET,POST,HEAD,OPTIONS",
                      "access-control-expose-headers": "x-effect-total",
                    };
                    if (request.method() === "OPTIONS") {
                      await route.fulfill({ status: 204, headers: cors });
                      return;
                    }
                    calls++;
                    const response = await backend.dispatchFetch(
                      request.url(),
                      {
                        method: request.method(),
                        headers: request.headers(),
                        body: request.postDataBuffer() ?? undefined,
                        redirect: "manual",
                      },
                    );
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
                const errors = [];
                page.on("pageerror", (error) => errors.push(String(error)));
                await page.goto(`http://127.0.0.1:${server.address().port}/`);
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
                assert.match((await request("/")).text, /Existing Worker UI/);
                assert.deepEqual(JSON.parse((await request("/health")).text), {
                  ok: true,
                });
                assert.equal(calls, mode === "split" ? 0 : 2);
                const before = await request("/api/counters/alice");
                const value = JSON.parse(before.text).value;
                const after = await request("/api/counters/alice", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ increment: 2 }),
                });
                assert.equal(after.status, 201);
                assert.equal(JSON.parse(after.text).value, value + 2);
                assert.equal(Number(after.effects), Number(before.effects) + 1);
                assert.equal((await row()).value, value + 2);
                assert.equal((await request("/api/counters/bob")).status, 401);
                await page.evaluate(() => window.token(undefined));
                const sent = calls;
                assert.equal(
                  (
                    await request("/api/counters/alice", {
                      method: "POST",
                      body: '{"increment":99}',
                    })
                  ).status,
                  401,
                );
                assert.equal(calls, sent + 1);
                assert.equal((await row()).value, value + 2);
                await page.evaluate(() => window.token("test-alice"));
                const invalid = await request("/api/counters/alice", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ increment: "invalid" }),
                });
                assert.equal(invalid.status, 400);
                assert.equal((await row()).value, value + 2);
                const head = await request("/api/counters/alice", {
                  method: "HEAD",
                });
                assert.equal(head.status, 200);
                assert.equal(head.text, "");
                if (mode === "split") {
                  await context.setOffline(true);
                  assert.deepEqual(
                    JSON.parse((await request("/health")).text),
                    {
                      ok: true,
                    },
                  );
                  await context.setOffline(false);
                }
                await page.evaluate(() => window.stop());
                assert.deepEqual(errors, []);
                report.push({
                  tool,
                  mode,
                  engine,
                  execution: prefer,
                  passed: true,
                });
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
}
