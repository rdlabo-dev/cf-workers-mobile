import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = here("../../../artifacts/oauth-live");
if (!process.env.NATIVE_TEST_D1_ID)
  throw Error("Set NATIVE_TEST_D1_ID to a dedicated test database");
await mkdir(out, { recursive: true });
await build({
  entryPoints: [here("worker.mjs")],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: resolve(out, "worker.js"),
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
export default defineConfig({ worker: { name: "wc-native-oauth-acceptance", entrypoint: "./worker.js", compatibilityDate: "2026-10-17", workersDev: true, env: { DB: bindings.d1({ id: ${JSON.stringify(process.env.NATIVE_TEST_D1_ID)} }), ADMIN_TOKEN: bindings.secret(), TEST_CLIENT_ID: bindings.secret(), SESSION_TOKEN: bindings.secret(), COOKIE_SESSION: bindings.secret() } } });`,
);
await mkdir(resolve(out, "migrations"), { recursive: true });
await writeFile(
  resolve(out, "migrations/0002.sql"),
  "CREATE TABLE oauth_codes (code TEXT PRIMARY KEY, challenge TEXT NOT NULL, expires INTEGER NOT NULL);\nCREATE TABLE oauth_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);\nCREATE TABLE oauth_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);\n",
);
console.log(`Prepared test deployment in ${out}`);
