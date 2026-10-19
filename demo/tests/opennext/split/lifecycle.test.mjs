import { test } from "node:test";
import assert from "node:assert/strict";
import { context } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/esbuild";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  "OpenNext rebuild and watch use original inputs without watching temporary output",
  { timeout: 240000 },
  async () => {
    const cache = here("../../../opennext/.open-next/.capacitor");
    const before = (await readdir(cache)).sort();
    const manifest = here("../../../opennext/.next/required-server-files.json");
    const original = await readFile(manifest, "utf8");
    const results = [];
    const build = await context({
      entryPoints: [here("main.ts")],
      outdir: here("../../../artifacts/opennext-watch"),
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      logLevel: "silent",
      define: { "import.meta.env.VITE_WORKER_ORIGIN": "undefined" },
      plugins: [
        workersCapacitorPlugin({
          worker: here("../../../opennext/.open-next/worker.js"),
          workerConfig: here("../../../opennext/wrangler.jsonc"),
          assetsExecution: "remote",
          execution: [
            { method: "GET", path: "/" },
            { method: "GET", path: "/api/message" },
          ],
        }),
        {
          name: "observe-completion",
          setup(build) {
            build.onEnd((result) => {
              results.push(result);
            });
          },
        },
      ],
    });
    const completed = async (count, local = true) => {
      const deadline = Date.now() + 90000;
      while (results.length < count && Date.now() < deadline) await delay(100);
      assert.equal(results.length, count);
      assert.deepEqual(results.at(-1).errors, []);
      assert.ok(
        results
          .at(-1)
          .warnings.some((warning) =>
            warning.text.includes(
              local ? "2 local handlers" : "No selected routes",
            ),
          ),
      );
      assert.deepEqual(
        (await readdir(cache)).sort(),
        before,
        "owned temporary output is removed",
      );
    };
    try {
      await build.rebuild();
      await completed(1);
      await build.rebuild();
      await completed(2);
      await build.watch();
      await completed(3);
      const privateConfig = JSON.parse(original);
      privateConfig.config.env = { SERVER_ONLY: "watch-private-value" };
      await writeFile(manifest, JSON.stringify(privateConfig));
      await completed(4, false);
      await writeFile(manifest, original);
      await completed(5);
      await delay(1200);
      assert.equal(
        results.length,
        5,
        "cleanup must not trigger another watch build",
      );
    } finally {
      await build.dispose();
      await writeFile(manifest, original);
    }
  },
);
