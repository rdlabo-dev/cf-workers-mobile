import { config as cloudflareConfig } from "../cloudflare/backend.mjs";
import { config as serviceConfig } from "../services/backend.mjs";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  cp,
  mkdir,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const ui = process.argv.includes("--ui");
const services = process.argv.includes("--services");
const cloudflare = process.argv.includes("--cloudflare");
if ([ui, services, cloudflare].filter(Boolean).length > 1)
  throw new Error("Choose one of --ui, --services or --cloudflare");
const artifacts = join(
  repo,
  cloudflare
    ? "demo/artifacts/cloudflare-native"
    : services
      ? "demo/artifacts/services-native"
      : ui
        ? "demo/artifacts/d1-native-ui"
        : "demo/artifacts/d1-native",
);
const refreshing = process.argv.includes("--refresh");
const consumer = refreshing
  ? JSON.parse(await readFile(join(artifacts, "consumer.json"), "utf8"))
      .consumer
  : await mkdtemp(join(tmpdir(), "cw-d1-native-"));
const run = (command, args) =>
  execFileSync(command, args, { cwd: consumer, stdio: "inherit" });
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", consumer], {
    cwd: repo,
    encoding: "utf8",
  }),
)[0];
const originalName = packed.filename;
packed.filename = `candidate-${Date.now()}.tgz`;
await rename(join(consumer, originalName), join(consumer, packed.filename));
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify(
    {
      name: "d1-native-consumer",
      private: true,
      type: "module",
      scripts: { build: "vite build" },
      dependencies: {
        "workers-capacitor": `file:./${packed.filename}`,
        "@capacitor/core": "8.5.3",
        "@capacitor/android": "8.5.3",
        "@capacitor/ios": "8.5.3",
        hono: "4.13.13",
      },
      devDependencies: { "@capacitor/cli": "8.5.3", vite: "7.3.7" },
    },
    null,
    2,
  ),
);
await cp(
  new URL(
    cloudflare
      ? "../cloudflare/worker.js"
      : services
        ? "../services/worker.js"
        : ui
          ? "ui-worker.js"
          : "worker.js",
    import.meta.url,
  ),
  join(consumer, "worker.js"),
);
await cp(
  new URL(
    cloudflare
      ? "../cloudflare/native-main.js"
      : services
        ? "../services/native-main.js"
        : ui
          ? "ui-main.js"
          : "native-main.js",
    import.meta.url,
  ),
  join(consumer, "main.js"),
);
await cp(join(artifacts, "server.json"), join(consumer, "server.json"));
await writeFile(
  join(consumer, "wrangler.jsonc"),
  JSON.stringify(
    cloudflare
      ? cloudflareConfig
      : services
        ? serviceConfig
        : {
            d1_databases: [
              {
                binding: "DB",
                database_name: "existing",
                database_id: "server-only",
              },
            ],
          },
  ),
);
await writeFile(
  join(consumer, "index.html"),
  '<html><body><script type="module" src="/main.js"></script></body></html>',
);
await writeFile(
  join(consumer, "vite.config.js"),
  `import {workersCapacitorPlugin} from "workers-capacitor/tooling/vite";export default {plugins:[workersCapacitorPlugin(${JSON.stringify({ worker: "worker.js", execution: [{ method: "*", path: "*" }], ...(cloudflare ? { assetsExecution: "remote" } : {}), ...(services ? { kvExecution: { CLOUD_KV: "local", SHARED_KV: "remote" } } : {}) })})],build:{target:"es2022",sourcemap:true}};`,
);
await writeFile(
  join(consumer, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: cloudflare
        ? "jp.rdlabo.workerscapacitor.cloudflaretest"
        : ui
          ? "jp.rdlabo.workerscapacitor.d1ui"
          : "jp.rdlabo.workerscapacitor.d1test",
      appName: "D1 Migration",
      webDir: "dist",
      ios: { packageManager: "SPM" },
    },
    null,
    2,
  ),
);
if (ui) {
  await mkdir(join(consumer, "public/ui"), { recursive: true });
  await writeFile(
    join(consumer, "public/ui/app.js"),
    (await readFile(new URL("ui-app.js", import.meta.url), "utf8")) +
      "\n" +
      (await readFile(new URL("ui-acceptance.js", import.meta.url), "utf8")),
  );
  await writeFile(
    join(consumer, "public/ui/app.css"),
    "body{font:18px system-ui;background:#eef3f7;color:#123;padding:24px}main{max-width:480px;margin:auto}input,button{font:inherit;padding:12px;margin:12px 0;display:block}button{background:#174b75;color:white;border:0;border-radius:6px}",
  );
  const server = JSON.parse(
    await readFile(join(artifacts, "server.json"), "utf8"),
  );
  await writeFile(
    join(consumer, "public/acceptance-run.json"),
    JSON.stringify({ port: server.port }),
  );
}
run("npm", ["install"]);
run("npm", ["run", "build"]);
if (!refreshing) {
  run("npx", ["cap", "add", "ios"]);
  run("npx", ["cap", "add", "android"]);
}
const gradle = join(consumer, "android/app/build.gradle");
if (!refreshing)
  await writeFile(
    gradle,
    (await readFile(gradle, "utf8")).replace(
      "android {",
      "android {\npackaging.resources { excludes += 'META-INF/INDEX.LIST'; merges += 'META-INF/io.netty.versions.properties' }",
    ),
  );
const debug = join(consumer, "android/app/src/debug");
await mkdir(join(debug, "res/raw"), { recursive: true });
await mkdir(join(debug, "res/xml"), { recursive: true });
await cp(join(artifacts, "ca.pem"), join(debug, "res/raw/d1_test_ca.pem"));
await writeFile(
  join(debug, "res/xml/d1_test_security.xml"),
  '<network-security-config><base-config><trust-anchors><certificates src="system"/></trust-anchors></base-config><debug-overrides><trust-anchors><certificates src="@raw/d1_test_ca"/></trust-anchors></debug-overrides></network-security-config>',
);
await writeFile(
  join(debug, "AndroidManifest.xml"),
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:networkSecurityConfig="@xml/d1_test_security"/></manifest>',
);
run("npx", ["cap", "sync"]);
await writeFile(
  join(artifacts, "consumer.json"),
  JSON.stringify(
    { consumer, integrity: packed.integrity, tarball: packed.filename },
    null,
    2,
  ),
);
console.log("D1 native consumer ready", consumer);
