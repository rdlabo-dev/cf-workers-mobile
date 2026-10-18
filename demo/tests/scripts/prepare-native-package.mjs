import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  realpath,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });
const artifacts = join(repo, "demo/artifacts");
await mkdir(artifacts, { recursive: true });
// Keep ancestor node_modules from masking missing package dependencies.
const consumer = await realpath(
  await mkdtemp(join(tmpdir(), "capacitor-workers-native-package-")),
);
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", consumer], {
    cwd: repo,
    encoding: "utf8",
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
assert.ok(
  !files.some(
    (file) =>
      /(?:^|\/)(?:build|\.gradle|tests|artifacts)\//.test(file) &&
      !file.startsWith("dist/build/"),
  ),
);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify(
    {
      name: "native-package-consumer",
      private: true,
      type: "module",
      scripts: { build: "vite build" },
      dependencies: {
        "@rdlabo/capacitor-workers": `file:./${packed.filename}`,
        "@capacitor/core": "8.5.3",
        "@capacitor/android": "8.5.3",
        "@capacitor/ios": "8.5.3",
        hono: "4.13.13",
        express: "5.3.0",
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
await cp(join(repo, "demo/tests/fixtures/apps/packaged-native"), consumer, {
  recursive: true,
});
await cp(
  join(repo, "demo/tests/fixtures/workers/rendering"),
  join(consumer, "workers"),
  { recursive: true },
);
await cp(
  join(repo, "demo/tests/fixtures/apps/native-documents/public/rendering"),
  join(consumer, "public/rendering"),
  { recursive: true },
);
let probe = await readFile(
  join(repo, "demo/tests/native/documents/probe.js"),
  "utf8",
);
const replaceProbe = (source, replacement) => {
  assert.ok(probe.includes(source), "Native probe reporting hook changed");
  probe = probe.replace(source, replacement);
};
replaceProbe(
  "    window.webkit?.messageHandlers?.documentFetch?.postMessage({\n      report: result,\n    });",
  "",
);
replaceProbe(
  '    console.log("NATIVE_DOCUMENT_RESULT", JSON.stringify(result));',
  `
    console.log("PACKAGED_RESULT", JSON.stringify({framework: result.framework, total: result.cases.length, failed: result.cases.filter(c => !c.passed)}));`,
);
// The packaged lifecycle driver manages shutdown/relaunch stages itself; the
// browser-suite Service Worker cleanup at the final step would unregister the
// document transport mid-run.
replaceProbe(
  `      report();
      if (location.protocol === "https:" && navigator.serviceWorker) {
        for (const registration of await navigator.serviceWorker.getRegistrations())
          await registration.unregister();
      }`,
  `      report();
      packagedAfterReport(state.cases.every((c) => c.passed));`,
);
// The initial invocation is deferred: the appended driver's top-level bindings
// initialize after this line is evaluated.
replaceProbe(
  `window.addEventListener("pageshow", (event) => {
  if (event.persisted) runDocumentProbe();
});
runDocumentProbe();`,
  `window.addEventListener("pageshow", (event) => {
  if (event.persisted) packagedRun();
});
setTimeout(() => packagedRun(), 0);`,
);
probe +=
  "\n" +
  (await readFile(
    join(repo, "demo/tests/fixtures/apps/packaged-native/probe-lifecycle.js"),
    "utf8",
  ));
await writeFile(join(consumer, "public/probe.js"), probe);
await writeFile(
  join(consumer, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: "jp.rdlabo.capacitorworkers.packaged",
      appName: "Packaged Workers",
      webDir: "dist",
      ios: { packageManager: "SPM" },
    },
    null,
    2,
  ),
);
run("npm", ["install"], consumer);
assert.equal(
  await realpath(join(consumer, "node_modules/@rdlabo/capacitor-workers")),
  join(consumer, "node_modules/@rdlabo/capacitor-workers"),
  "Must install tarball, not link repo",
);
// Bundle the installed package entry as a classic script so the Android
// lifecycle stage can exercise Fetch-only migration from inside the rendered
// document, the same checks as the historical CDP --lifecycle probe.
const { build } = await import("esbuild");
const lifecycle = await build({
  entryPoints: [
    join(consumer, "node_modules/@rdlabo/capacitor-workers/dist/index.js"),
  ],
  bundle: true,
  format: "iife",
  globalName: "DocumentLifecycleTest",
  write: false,
});
await writeFile(
  join(consumer, "public/lifecycle.js"),
  lifecycle.outputFiles[0].text,
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
  join(artifacts, "native-package-consumer.json"),
  JSON.stringify({ consumer, tarball: packed.filename }, null, 2),
);
console.log("Packed native consumer ready:", consumer);
