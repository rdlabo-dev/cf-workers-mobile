import { unstable_splitSqlQuery } from "wrangler";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nativeBackend } from "../../native/backend.mjs";
export const root = fileURLToPath(
  new URL("../../../artifacts/upstream/microfeed/clone/", import.meta.url),
);
export async function startBackend() {
  const compiled = await build({
    entryPoints: [join(root, "dist/server/entry.mjs")],
    bundle: true,
    format: "esm",
    platform: "node",
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire("/worker.js");',
    },
    external: ["node:*", "cloudflare:*"],
    write: false,
  });
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-07-29",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        UPLOAD_SIGNING_KEY: "local-test-upload-secret",
        BETTER_AUTH_SECRET: "local-test-auth-secret-at-least-32-characters",
        WEBHOOK_SECRET_KEY: "local-test-webhook-secret",
      },
      d1Databases: ["FEED_DB"],
      r2Buckets: ["MEDIA_BUCKET"],
      queueProducers: { WEBHOOK_QUEUE: "acceptance-webhooks" },
      assets: {
        directory: join(root, "dist/client"),
        binding: "ASSETS",
        routerConfig: { has_user_worker: true },
      },
    }),
  );
  try {
    const db = await worker.getD1Database("FEED_DB");
    for (const file of (await readdir(join(root, "migrations")))
      .filter((p) => p.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(join(root, "migrations", file), "utf8");
      for (const statement of unstable_splitSqlQuery(sql))
        await db.prepare(statement).run();
    }
    await db
      .prepare(
        "INSERT INTO items (id,status,data,content_text,pub_date) VALUES (?,1,?,?,?)",
      )
      .bind(
        "AcceptNote1",
        JSON.stringify({
          title: "Capacitor acceptance story",
          description: "<p>Native feed article body</p>",
        }),
        "Native feed article body",
        new Date().toISOString(),
      )
      .run();
    const backend = await nativeBackend({
      dispatch: (url, init) => worker.dispatchFetch(url, init),
      driver: await readFile(new URL("driver.js", import.meta.url), "utf8"),
      dispose: () => worker.dispose(),
    });
    return { ...backend, db };
  } catch (error) {
    await worker.dispose();
    throw error;
  }
}
