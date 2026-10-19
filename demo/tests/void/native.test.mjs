import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { nativeBackend } from "../native/backend.mjs";
import { runNativeAcceptance } from "../native/acceptance.mjs";
const root = fileURLToPath(new URL("../../void/", import.meta.url));
test(
  "Void native SSR, hydration, form action and client-only rendering",
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
    });
    await runNativeAcceptance({
      backend,
      worker: join(root, "dist/ssr/index.js"),
      workerConfig: join(root, "dist/ssr/wrangler.json"),
      artifacts: fileURLToPath(
        new URL("../../artifacts/void-native/", import.meta.url),
      ),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.ok(backend.reports.some((r) => r.stage === "action"));
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
