import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../../../artifacts/opennext-live");
if (!process.env.NATIVE_TEST_D1_ID)
  throw Error("Set NATIVE_TEST_D1_ID to a dedicated test database");
await mkdir(out, { recursive: true });
await build({
  entryPoints: [here("../plugin-driver.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: resolve(out, "plugin.js"),
});
await build({
  entryPoints: [here("worker.mjs")],
  bundle: true,
  format: "esm",
  platform: "node",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire('file:///worker.js');",
  },
  external: ["node:*", "cloudflare:*"],
  loader: { ".wasm": "binary" },
  outfile: resolve(out, "worker.js"),
  plugins: [
    {
      name: "test-script-text",
      setup(b) {
        b.onResolve({ filter: /\?text$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.slice(0, -5)),
          namespace: "text",
        }));
        b.onLoad({ filter: /.*/, namespace: "text" }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
          resolveDir: dirname(args.path),
        }));
      },
    },
  ],
});
await writeFile(
  resolve(out, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    devDependencies: { wrangler: "4.151.1", cf: "1.0.0-beta.17" },
  }),
);
await writeFile(
  resolve(out, "cloudflare.config.ts"),
  `import { defineConfig, bindings } from "cf/config";
export default defineConfig({ worker: {
name: "wc-native-opennext-acceptance", entrypoint: "./worker.js", compatibilityDate: "2026-10-17", compatibilityFlags: ["nodejs_compat"], workersDev: true,
assets: { runWorkerFirst: true },
env: { DB: bindings.d1({ id: ${JSON.stringify(process.env.NATIVE_TEST_D1_ID)} }), ASSETS: bindings.assets(), IMAGES: bindings.images(), ADMIN_TOKEN: bindings.secret(), DEVICE_TOKEN: bindings.secret() }
} });`,
);
await writeFile(
  resolve(out, "wrangler.config.ts"),
  `import { defineWranglerConfig } from "wrangler/experimental-config";\nexport default defineWranglerConfig({ assetsDirectory: ${JSON.stringify(here("../../../opennext/.open-next/assets"))} });`,
);
console.log(`Prepared test deployment in ${out}`);

await mkdir(resolve(out, "migrations"), { recursive: true });
await writeFile(
  resolve(out, "migrations/0001.sql"),
  (await readFile(here("../../../opennext/migrations/0001.sql"), "utf8")) +
    "\nCREATE TABLE acceptance_config (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\nCREATE TABLE acceptance_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);\n",
);
