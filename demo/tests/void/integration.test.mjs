import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  readdir,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build as bundle } from "esbuild";
import { build, preview } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { chromium, webkit, expect } from "@playwright/test";
import { workersCapacitorPlugin } from "../../../dist/tooling/vite.js";
import { assertInitialRendering } from "../rendering/assertions.ts";

const root = fileURLToPath(new URL("../../void/", import.meta.url));

test(
  "Void React Pages: remote D1 loader, hydration and action",
  { timeout: 120000 },
  async () => {
    const compiled = await bundle({
      entryPoints: [join(root, "dist/ssr/index.js")],
      bundle: true,
      format: "esm",
      platform: "node",
      external: ["node:*", "cloudflare:*"],
      write: false,
    });
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: compiled.outputFiles[0].text,
        compatibilityDate: "2026-02-24",
        compatibilityFlags: ["nodejs_als"],
        d1Databases: ["DB"],
        assets: {
          directory: join(root, "dist/client"),
          binding: "ASSETS",
          routerConfig: { has_user_worker: true },
        },
      }),
    );
    await mkdir(fileURLToPath(new URL("../../artifacts/", import.meta.url)), {
      recursive: true,
    });
    const temp = await mkdtemp(
      fileURLToPath(new URL("../../artifacts/void-", import.meta.url)),
    );
    let server;
    try {
      const db = await worker.getD1Database("DB");
      await db.exec(
        "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      );
      await db
        .prepare("INSERT INTO messages (text) VALUES (?)")
        .bind("Initial D1 message")
        .run();
      await writeFile(
        join(temp, "index.html"),
        '<script type="module" src="/main.js"></script>',
      );
      await writeFile(
        join(temp, "main.js"),
        `import { workersCapacitor } from "cf-workers-native/capacitor";
window.runtime = workersCapacitor({ baseURL: "https://worker.invalid/", remote: { origin: "https://void.invalid" } });`,
      );
      await build({
        configFile: false,
        root: temp,
        publicDir: join(root, "dist/client"),
        plugins: [
          workersCapacitorPlugin({
            execution: "network",
            worker: join(root, "dist/ssr/index.js"),
            workerConfig: join(root, "dist/ssr/wrangler.json"),
            assetsExecution: "remote",
          }),
        ],
        build: { outDir: "www" },
      });
      const output = join(temp, "www");
      const report = JSON.parse(
        await readFile(join(output, "workers-capacitor-server.json"), "utf8"),
      );
      assert.equal(report.mode, "worker");
      for (const name of await readdir(output, { recursive: true })) {
        if (!name.endsWith(".js")) continue;
        const code = await readFile(join(output, name), "utf8");
        assert.equal(
          code.includes("created_at"),
          false,
          "Server schema must not ship to the device",
        );
        assert.equal(
          code.includes("INSERT INTO"),
          false,
          "Server SQL must not ship to the device",
        );
      }
      const assets = JSON.parse(
        await readFile(join(output, "workers-capacitor-assets.json"), "utf8"),
      );
      assert.ok(
        assets.some(
          (path) => path.startsWith("/assets/") && path.endsWith(".js"),
        ),
      );
      server = await preview({
        configFile: false,
        root: temp,
        build: { outDir: "www" },
        preview: { host: "127.0.0.1", port: 0 },
      });
      for (const engine of [chromium, webkit]) {
        const browser = await engine.launch();
        try {
          const context = await browser.newContext();
          // Model the native host: bundled assets bypass the remote Worker.
          // Native acceptance checks the actual iOS/Android document transport.
          const localAssets = new Set();
          await context.route("https://void.invalid/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (assets.includes(url.pathname)) {
              localAssets.add(url.pathname);
              const response = await fetch(
                new URL(
                  url.pathname + url.search,
                  server.resolvedUrls.local[0],
                ),
              );
              assert.equal(response.status, 200);
              await route.fulfill({
                status: response.status,
                headers: Object.fromEntries(response.headers),
                body: Buffer.from(await response.arrayBuffer()),
              });
              return;
            }
            const response = await worker.dispatchFetch(request.url(), {
              method: request.method(),
              headers: request.headers(),
              body: request.postDataBuffer() ?? undefined,
            });
            await route.fulfill({
              status: response.status,
              headers: {
                ...Object.fromEntries(response.headers),
                "access-control-allow-origin":
                  request.headers().origin ?? "https://void.invalid",
                "access-control-allow-credentials": "true",
                "access-control-allow-headers": "content-type",
              },
              body: Buffer.from(await response.arrayBuffer()),
            });
          });
          const page = await context.newPage();
          await page.goto(server.resolvedUrls.local[0]);
          const result = await page.evaluate(async () => {
            await window.runtime.ready;
            const response = await fetch("https://worker.invalid/");
            return { status: response.status, html: await response.text() };
          });
          assert.equal(result.status, 200);
          await assertInitialRendering(browser, result.html, {
            initial: {
              h1: "Welcome to Void",
              "li strong": "Initial D1 message",
            },
            clientOnly: [],
          });
          // Browser framework acceptance is distinct from native document rendering.
          const clientOnly = await worker.dispatchFetch(
            "https://void.invalid/client-only",
          );
          assert.equal(clientOnly.status, 200);
          await assertInitialRendering(browser, await clientOnly.text(), {
            initial: {},
            clientOnly: ["h1", "li strong"],
          });
          await page.goto("https://void.invalid/client-only");
          await expect(page.locator("li strong")).toHaveText(
            "Initial D1 message",
          );
          await page.goto("https://void.invalid/");
          const message = crypto.randomUUID();
          await page.getByLabel("Message").fill(message);
          await page.getByRole("button", { name: "Add message" }).click();
          await expect(
            page.locator("li strong", { hasText: message }),
          ).toBeVisible();
          assert.equal(
            (
              await db
                .prepare("SELECT COUNT(*) AS n FROM messages WHERE text = ?")
                .bind(message)
                .first()
            ).n,
            1,
          );
          assert.ok(
            [...localAssets].some((path) => path.endsWith(".js")),
            "Hydration must load bundled JavaScript",
          );
          await db
            .prepare("DELETE FROM messages WHERE text = ?")
            .bind(message)
            .run();
        } finally {
          await browser.close();
        }
      }
    } finally {
      if (server)
        await new Promise((resolve) => server.httpServer.close(resolve));
      await worker.dispose();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
