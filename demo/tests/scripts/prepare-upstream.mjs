import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  realpath,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const [sample, flag] = process.argv.slice(2);
if (!sample || (flag && flag !== "--clone-only"))
  throw Error("Usage: prepare-upstream.mjs <upstream sample> [--clone-only]");
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const base = join(repo, "demo/tests/upstream", sample);
const meta = JSON.parse(await readFile(join(base, "upstream.json"), "utf8"));
assert.match(
  meta.commit,
  /^[0-9a-f]{40}$/,
  "Upstream must pin a full commit SHA",
);
const artifacts = join(repo, "demo/artifacts/upstream", sample);
await mkdir(artifacts, { recursive: true });
// A dedicated npm cache avoids depending on global cache permissions; the
// consumer stays independent of the user's npm state.
const npmEnv = { npm_config_cache: join(artifacts, ".npm-cache") };
const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...npmEnv },
  });

// Fetch the upstream application only. A blob-filtered sparse clone avoids
// downloading or checking out anything outside the target subdirectory.
const clone = join(artifacts, "clone");
if (!existsSync(join(clone, ".git"))) {
  // An empty template dir keeps git from copying sample hooks that sandboxed
  // environments cannot write; it changes nothing else about the clone.
  const template = await mkdtemp(join(tmpdir(), "empty-git-template-"));
  run(
    "git",
    [
      "clone",
      "--no-checkout",
      "--filter=blob:none",
      `--template=${template}`,
      meta.repository,
      clone,
    ],
    repo,
  );
}
run(
  "git",
  [
    "-C",
    clone,
    "sparse-checkout",
    "set",
    "--no-cone",
    `/${meta.subdirectory}/`,
  ],
  repo,
);
// Fetch the exact pin, including when an existing clone predates a pin update.
run("git", ["-C", clone, "fetch", "origin", meta.commit], repo);
run("git", ["-C", clone, "checkout", "--detach", meta.commit], repo);
const dirty = execFileSync("git", ["-C", clone, "status", "--porcelain"], {
  encoding: "utf8",
}).trim();
assert.equal(
  execFileSync("git", ["-C", clone, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  meta.commit,
  "Clone is not at the pinned commit",
);
assert.equal(dirty, "", `Clone has uncommitted changes: ${dirty}`);
const entry = join(clone, meta.subdirectory, meta.entry);
assert.ok(existsSync(entry), `Upstream entry missing: ${entry}`);
console.log(`Upstream ${meta.subdirectory} ready at ${meta.commit} (${clone})`);
if (flag === "--clone-only") process.exit(0);

// Independent consumer: installs the packed library tarball, the upstream
// application and the small Capacitor fixture. No repository symlinks.
const consumer = await realpath(
  await mkdtemp(join(tmpdir(), `capacitor-workers-upstream-${sample}-`)),
);
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", consumer], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...npmEnv },
  }),
)[0];
const files = packed.files.map((file) => file.path);
for (const expected of [
  "Package.swift",
  "native/ios/CapacitorWorkersPlugin.swift",
  "native/android/build.gradle",
  "native/android/src/main/java/jp/rdlabo/capacitorworkers/CapacitorWorkersPlugin.java",
])
  assert.ok(files.includes(expected), `Missing packed file: ${expected}`);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify(
    {
      name: `upstream-${sample}-consumer`,
      private: true,
      type: "module",
      scripts: { build: "vite build" },
      dependencies: {
        "@rdlabo/capacitor-workers": `file:./${packed.filename}`,
        "@capacitor/core": "8.5.3",
        "@capacitor/android": "8.5.3",
        "@capacitor/ios": "8.5.3",
        ...meta.dependencies,
      },
      devDependencies: {
        "@capacitor/cli": "8.5.3",
        vite: "7.3.7",
        typescript: "7.0.2",
      },
    },
    null,
    2,
  ),
);
await cp(join(base, "fixture"), consumer, { recursive: true });
await cp(join(clone, meta.subdirectory), join(consumer, "upstream"), {
  recursive: true,
});
await cp(join(base, "worker.ts"), join(consumer, "worker.ts"));
await cp(
  join(base, "upstream-worker.d.ts"),
  join(consumer, "upstream-worker.d.ts"),
);
await cp(join(base, "upstream.json"), join(consumer, "upstream.json"));
assert.ok(
  !(await readdir(consumer)).includes("capacitor.config.ts"),
  "fixture should ship the plain JSON Capacitor config",
);
run("npm", ["install"], consumer);
assert.equal(
  await realpath(join(consumer, "node_modules/@rdlabo/capacitor-workers")),
  join(consumer, "node_modules/@rdlabo/capacitor-workers"),
  "Must install tarball, not link repo",
);
run("npm", ["run", "build"], consumer);
run("npx", ["cap", "add", "ios"], consumer);
run("npx", ["cap", "add", "android"], consumer);
// The same application-level packaging configuration documented for consumers.
const appGradle = join(consumer, "android/app/build.gradle");
await writeFile(
  appGradle,
  (await readFile(appGradle, "utf8")).replace(
    "android {",
    `android {
    packaging.resources {
        excludes += 'META-INF/INDEX.LIST'
        merges += 'META-INF/io.netty.versions.properties'
    }`,
  ),
);
run("npx", ["cap", "sync"], consumer);
const ios = JSON.parse(
  await readFile(join(consumer, "ios/App/App/capacitor.config.json"), "utf8"),
);
assert.ok(ios.packageClassList.includes("CapacitorWorkersPlugin"));
const android = JSON.parse(
  await readFile(
    join(consumer, "android/app/src/main/assets/capacitor.plugins.json"),
    "utf8",
  ),
);
assert.ok(
  android.some(
    (plugin) =>
      plugin.classpath === "jp.rdlabo.capacitorworkers.CapacitorWorkersPlugin",
  ),
);
await writeFile(
  join(repo, "demo/artifacts/upstream", `${sample}-consumer.json`),
  JSON.stringify({ consumer, tarball: packed.filename }, null, 2),
);
console.log(`Upstream consumer ready: ${consumer}`);
