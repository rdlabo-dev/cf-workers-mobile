import { test } from "node:test";
import assert from "node:assert/strict";
import { context } from "esbuild";
import { readFile, writeFile, readdir, readlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { workersCapacitorPlugin } from "cf-workers-native/tooling/esbuild";
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (contents) => createHash("sha256").update(contents).digest("hex");
async function serverSnapshot() {
  const root = here("../../../opennext/");
  const files = ["wrangler.jsonc", "open-next.config.ts", "package.json"];
  const entries = {};
  for (const directory of [".next", ".open-next", "app"]) {
    for (const entry of await readdir(`${root}${directory}`, {
      recursive: true,
      withFileTypes: true,
    })) {
      const path = `${entry.parentPath}/${entry.name}`;
      const name = path.slice(root.length);
      if (entry.isFile()) files.push(name);
      else
        entries[name] = entry.isDirectory()
          ? "directory"
          : `symlink:${await readlink(path)}`;
    }
  }
  for (const name of files)
    entries[name] = hash(await readFile(`${root}${name}`));
  return entries;
}

test(
  "OpenNext rebuild and watch use original inputs without watching temporary output",
  { timeout: 240000 },
  async () => {
    const cache = here(
      "../../../opennext/node_modules/.cache/workers-capacitor/opennext",
    );
    const before = (
      await readdir(cache).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      })
    ).sort();
    const manifest = here("../../../opennext/.next/required-server-files.json");
    const original = await readFile(manifest, "utf8");
    const serverBefore = await serverSnapshot();
    let expectedManifest = original;
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
        JSON.stringify(results.at(-1).warnings),
      );
      assert.deepEqual(
        (await readdir(cache)).sort(),
        before,
        "owned temporary output is removed",
      );
      assert.deepEqual(
        await serverSnapshot(),
        {
          ...serverBefore,
          ".next/required-server-files.json": hash(expectedManifest),
        },
        "mobile compilation must not change Cloudflare source, config or build artifacts",
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
      expectedManifest = JSON.stringify(privateConfig);
      await writeFile(manifest, expectedManifest);
      await completed(4, false);
      expectedManifest = original;
      await writeFile(manifest, expectedManifest);
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
