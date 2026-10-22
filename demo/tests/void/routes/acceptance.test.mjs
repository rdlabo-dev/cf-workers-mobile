import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  cp,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build as viteBuild, preview } from "vite";
import { build as esbuild } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { workersCapacitorPlugin as vitePlugin } from "../../../../dist/tooling/vite.js";
import { workersCapacitorPlugin as esbuildPlugin } from "../../../../dist/tooling/esbuild.js";

const demo = fileURLToPath(new URL("../../../", import.meta.url));
const app = join(demo, "void");
for (const bundler of ["vite", "esbuild"]) {
  test(
    `${bundler}: Void public routes execute locally while D1, mutations and authentication stay remote`,
    { timeout: 180000 },
    async () => {
      await mkdir(join(demo, "artifacts"), { recursive: true });
      const temp = await mkdtemp(join(demo, "artifacts/void-routes-"));
      let server;
      try {
        const main = `import {workersCapacitor} from "cf-workers-native/capacitor";
window.runtime=workersCapacitor({baseURL:"https://worker.invalid/",remote:{origin:"https://remote.invalid"}});`;
        await writeFile(join(temp, "main.js"), main);
        await writeFile(
          join(temp, "index.html"),
          '<script type="module" src="/main.js"></script>',
        );
        const options = {
          worker: join(app, "dist/ssr/index.js"),
          workerConfig: join(app, "dist/ssr/wrangler.json"),
          assetsExecution: "remote",
          execution: [{ method: "GET", path: "*" }],
        };
        const outdir = join(temp, "www");
        if (bundler === "vite")
          await viteBuild({
            configFile: false,
            root: temp,
            publicDir: join(app, "dist/client"),
            plugins: [vitePlugin(options)],
            build: { outDir: outdir, sourcemap: true },
          });
        else {
          await cp(join(app, "dist/client"), outdir, { recursive: true });
          await esbuild({
            entryPoints: [join(temp, "main.js")],
            outdir,
            bundle: true,
            splitting: true,
            format: "esm",
            platform: "browser",
            sourcemap: true,
            plugins: [esbuildPlugin(options)],
          });
          await cp(join(temp, "index.html"), join(outdir, "index.html"));
        }
        const report = JSON.parse(
          await readFile(join(outdir, "workers-capacitor-server.json"), "utf8"),
        );
        assert.equal(report.mode, "routes", report.reason);
        for (const path of ["/about", "/api/hello"])
          assert.equal(
            report.routes.find(
              (route) => route.path === path && route.method === "GET",
            )?.remote,
            false,
          );
        for (const path of ["/", "/client-only"])
          assert.equal(
            report.routes.find(
              (route) => route.path === path && route.method === "GET",
            )?.remote,
            true,
          );
        for (const file of await readdir(outdir, { recursive: true })) {
          if (!/\.(js|map)$/.test(file)) continue;
          const code = await readFile(join(outdir, file), "utf8");
          for (const marker of [
            "INSERT INTO",
            "created_at",
            "createBindingHandler",
            "/__void/db",
          ])
            assert.equal(
              code.includes(marker),
              false,
              `${marker} leaked into ${file}`,
            );
        }
        server = await preview({
          configFile: false,
          root: temp,
          build: { outDir: outdir },
          preview: { host: "127.0.0.1", port: 0 },
        });
        for (const engine of [chromium, webkit]) {
          const browser = await engine.launch();
          try {
            const page = await browser.newPage();
            const remote = [];
            await page.route("https://remote.invalid/**", (route) => {
              remote.push(new URL(route.request().url()).pathname);
              return route.fulfill({
                status: 200,
                headers: {
                  "content-type": "text/plain",
                  "access-control-allow-origin":
                    server.resolvedUrls.local[0].replace(/\/$/, ""),
                  "access-control-allow-credentials": "true",
                  "access-control-allow-methods": "GET, POST, OPTIONS",
                  "access-control-allow-headers": "authorization, content-type",
                },
                body: "remote",
              });
            });
            await page.goto(server.resolvedUrls.local[0]);
            const local = await page.evaluate(async () => {
              await window.runtime.ready;
              const page = await fetch("https://worker.invalid/about");
              const api = await fetch("https://worker.invalid/api/hello");
              return {
                status: page.status,
                html: await page.text(),
                message: await api.json(),
              };
            });
            assert.equal(local.status, 200);
            assert.match(local.html, /<h1>A public Void page<\/h1>/);
            assert.match(local.html, /__VOID_PAGE_DATA__/);
            assert.match(local.html, /<script type="module" src="\/assets\//);
            assert.equal(local.message.message, "Hello from Void");
            assert.deepEqual(remote, []);
            for (const [path, init] of [
              ["/", {}],
              ["/client-only", {}],
              ["/about", { method: "POST", body: "action" }],
              ["/about", { headers: { authorization: "Bearer token" } }],
              ["/__void/db", {}],
            ]) {
              const body = await page.evaluate(
                async ([path, init]) =>
                  (await fetch("https://worker.invalid" + path, init)).text(),
                [path, init],
              );
              assert.equal(body, "remote");
            }
            assert.deepEqual(remote, [
              "/",
              "/client-only",
              "/about",
              "/about",
              "/__void/db",
            ]);
          } finally {
            await browser.close();
          }
        }
      } finally {
        await server?.httpServer.close();
        await rm(temp, { recursive: true, force: true });
      }
    },
  );
}
