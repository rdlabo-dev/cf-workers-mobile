import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nativeBackend } from "../../native/backend.mjs";
export const root = fileURLToPath(
  new URL("../../../artifacts/upstream/uptimeflare/clone/", import.meta.url),
);
export async function startBackend() {
  const modulesRoot = join(root, ".vercel/output/static/_worker.js");
  const files = await readdir(modulesRoot, { recursive: true });
  const modules = [
    "index.js",
    ...files.filter((f) => f !== "index.js" && /\.(js|wasm)$/.test(f)),
  ].map((f) => ({
    type: f.endsWith(".wasm") ? "CompiledWasm" : "ESModule",
    path: join(modulesRoot, f),
  }));
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules,
      modulesRoot,
      compatibilityDate: "2025-04-02",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["UPTIMEFLARE_D1"],
      assets: {
        directory: join(root, ".vercel/output/static"),
        binding: "ASSETS",
        routerConfig: { has_user_worker: true },
      },
    }),
  );
  try {
    const db = await worker.getD1Database("UPTIMEFLARE_D1");
    await db.prepare(await readFile(join(root, "init.sql"), "utf8")).run();
    const now = Math.floor(Date.now() / 1000);
    const state = {
      lastUpdate: now,
      overallUp: 2,
      overallDown: 0,
      incident: {},
      latency: {},
    };
    for (const id of ["foo_monitor", "test_tcp_monitor"]) {
      state.incident[id] = {
        start: [[now - 86400]],
        end: [now - 86340],
        error: ["Fixture outage"],
      };
      state.latency[id] = {
        time: Buffer.from(new Uint32Array([now - 60, now]).buffer).toString(
          "hex",
        ),
        ping: Buffer.from(new Uint16Array([25, 42]).buffer).toString("hex"),
        loc: { c: [2], v: ["NRT"] },
      };
    }
    await db
      .prepare("INSERT INTO uptimeflare (key,value) VALUES ('state',?)")
      .bind(JSON.stringify(state))
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
