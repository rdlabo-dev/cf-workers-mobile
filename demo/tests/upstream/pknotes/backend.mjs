import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nativeBackend } from "../../native/backend.mjs";
export const root = fileURLToPath(
  new URL("../../../artifacts/upstream/pknotes/clone/", import.meta.url),
);
export async function startBackend({
  instrument = () => true,
  manualSubmission = false,
} = {}) {
  const compiled = await build({
    entryPoints: [join(root, "dist/pknotes/index.js")],
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
      bindings: {
        SESSION_SECRET: "local-pknotes-acceptance-secret-32-characters",
      },
      ratelimits: {
        AUTH_LIMITER: {
          namespace_id: "1002",
          simple: { limit: 30, period: 60 },
        },
        STRICT_LIMITER: {
          namespace_id: "1001",
          simple: { limit: 10, period: 60 },
        },
      },
      d1Databases: ["DB"],
      assets: {
        directory: join(root, "dist/client"),
        binding: "ASSETS",
        run_worker_first: ["/api/*"],
        routerConfig: { has_user_worker: true },
        assetConfig: { not_found_handling: "single-page-application" },
      },
    }),
  );
  const db = await worker.getD1Database("DB");
  for (const file of (await readdir(join(root, "migrations")))
    .filter((p) => p.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(root, "migrations", file), "utf8");
    for (const statement of sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  }
  const backend = await nativeBackend({
    dispatch: (url, init) => worker.dispatchFetch(url, init),
    driver:
      `globalThis.__pknotesManualSubmission = ${JSON.stringify(manualSubmission)};\n` +
      (await readFile(new URL("driver.js", import.meta.url), "utf8")),
    dispose: () => worker.dispose(),
    instrument,
  });
  return { ...backend, db };
}
