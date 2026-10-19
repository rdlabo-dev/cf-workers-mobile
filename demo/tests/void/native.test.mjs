import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { nativeBackend } from "../native/backend.mjs";
import { runNativeAcceptance } from "../native/acceptance.mjs";
const root = fileURLToPath(new URL("../../void/", import.meta.url));
const routes = process.env.VOID_ROUTES === "1";
test(
  `Void native ${routes ? "route execution, " : ""}SSR, hydration, form action and client-only rendering`,
  { timeout: 600000 },
  async () => {
    const compiled = await build({
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
    const db = await worker.getD1Database("DB");
    await db.exec(
      "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    await db
      .prepare("INSERT INTO messages (text) VALUES (?)")
      .bind("Initial D1 message")
      .run();
    const backend = await nativeBackend({
      dispatch: (url, init) => worker.dispatchFetch(url, init),
      driver: await readFile(
        new URL("native-driver.js", import.meta.url),
        "utf8",
      ),
      dispose: () => worker.dispose(),
      instrument: () => !routes,
    });
    await runNativeAcceptance({
      backend,
      publicDir: join(root, "dist/client"),
      worker: join(root, "dist/ssr/index.js"),
      workerConfig: join(root, "dist/ssr/wrangler.json"),
      execution: routes ? [{ method: "GET", path: "*" }] : "network",
      expectedMode: routes ? "routes" : "worker",
      render: routes ? "/about" : "/",
      configureNative: routes
        ? async ({ shell }) => {
            // Instrument only the copied public entry chunk, so locally rendered
            // documents run the same driver as remote documents.
            const assets = join(shell, "www/assets");
            const entries = (await readdir(assets)).filter((name) =>
              /^pages-client-.*\.js$/.test(name),
            );
            assert.equal(entries.length, 1);
            await appendFile(
              join(assets, entries[0]),
              "\n;" +
                (await readFile(
                  new URL("native-driver.js", import.meta.url),
                  "utf8",
                )),
            );
          }
        : undefined,
      artifacts: fileURLToPath(
        new URL(
          routes
            ? "../../artifacts/void-routes-native/"
            : "../../artifacts/void-native/",
          import.meta.url,
        ),
      ),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.ok(backend.reports.some((r) => r.stage === "action"));
        if (routes) {
          const local = backend.reports.find((r) => r.stage === "local");
          assert.equal(local?.message, "Hello from Void");
          assert.equal(local?.count, "Count: 1");
          assert.deepEqual(
            backend.requests.filter((r) =>
              ["/about", "/api/hello"].includes(r.path),
            ),
            [],
            "Public SSR and API must not reach the Worker",
          );
          assert.ok(
            backend.requests.some(
              (r) => r.path === "/about?authenticated=1" && r.status === 200,
            ),
          );
        }
        const assets = JSON.parse(
          await readFile(
            new URL(
              "../../opennext/www/workers-capacitor-assets.json",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const clientFiles = await readdir(join(root, "dist/client/assets"));
        assert.ok(clientFiles.some((file) => file.endsWith(".js")));
        for (const file of clientFiles)
          assert.ok(
            assets.includes("/assets/" + file),
            `Missing bundled Void asset: ${file}`,
          );
        assert.deepEqual(
          backend.requests.filter((request) =>
            assets.includes(new URL(request.path, backend.url).pathname),
          ),
          [],
          "Bundled assets must never reach the remote Worker",
        );
        assert.equal(
          (
            await db
              .prepare("SELECT COUNT(*) AS n FROM messages WHERE text = ?")
              .bind("Native Void message")
              .first()
          ).n,
          1,
        );
      },
    });
  },
);
