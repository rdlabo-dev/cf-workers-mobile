import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nativeBackend } from "../../native/backend.mjs";
export const root = fileURLToPath(
  new URL("../../../artifacts/upstream/sink/clone/", import.meta.url),
);
export async function startBackend() {
  const compiled = await build({
    entryPoints: [join(root, ".output/server/index.mjs")],
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
      compatibilityDate: "2026-08-22",
      compatibilityFlags: ["nodejs_compat"],
      bindings: { NUXT_SITE_TOKEN: "native-sink-test-token" },
      d1Databases: ["DB"],
      kvNamespaces: ["KV"],
      r2Buckets: ["R2"],
      assets: {
        directory: join(root, ".output/public"),
        binding: "ASSETS",
        routerConfig: { has_user_worker: true },
      },
    }),
  );
  const db = await worker.getD1Database("DB");
  for (const file of (await readdir(join(root, "drizzle")))
    .filter((p) => p.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile(join(root, "drizzle", file), "utf8"))
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql.trim().replace(/;\s*$/, "")).run();
  const backend = await nativeBackend({
    dispatch: (url, init) => worker.dispatchFetch(url, init),
    driver: await readFile(new URL("driver.js", import.meta.url), "utf8"),
    dispose: () => worker.dispose(),
  });
  return { ...backend, db };
}
