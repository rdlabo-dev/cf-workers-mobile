import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  readdir,
  stat,
  access,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "vite";
import { workersCapacitorPlugin } from "../../../../dist/tooling/vite.js";
import { startBackend, app } from "./backend.mjs";
const exec = promisify(execFile);
const platform = process.env.UPSTREAM_PLATFORM;
const device = process.env.UPSTREAM_DEVICE;
if (!["ios", "android"].includes(platform) || !device)
  throw Error("Set UPSTREAM_PLATFORM=ios|android and UPSTREAM_DEVICE");
// Reuse the existing native test shell; its Next application is not the build input.
const shell = fileURLToPath(new URL("../../../opennext/", import.meta.url));
const artifacts = fileURLToPath(
  new URL("../../../artifacts/upstream/opennext/native/", import.meta.url),
);
const appId = "jp.rdlabo.workerscapacitor.opennext";

test(
  `upstream OpenNext Server Actions and Suspense in ${platform}`,
  { timeout: 600000 },
  async () => {
    await mkdir(artifacts, { recursive: true });
    const backend = await startBackend();
    const run = async (command, args, cwd = shell) => {
      try {
        return await exec(command, args, {
          cwd,
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            JAVA_HOME:
              process.env.JAVA_HOME ||
              "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
          },
        });
      } catch (error) {
        await writeFile(
          join(artifacts, `${platform}-error.log`),
          `${error.stdout}\n${error.stderr}`,
        );
        throw error;
      }
    };
    try {
      const bootstrap = join(artifacts, "bootstrap");
      await mkdir(bootstrap, { recursive: true });
      await writeFile(
        join(bootstrap, "index.html"),
        '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/main.js"></script></body></html>',
      );
      await writeFile(
        join(bootstrap, "main.js"),
        `import { workersCapacitor } from "@rdlabo/workers-capacitor"; const runtime = workersCapacitor({baseURL:"https://worker.invalid/",remote:{origin:${JSON.stringify(backend.url.origin)}},render:"/server-actions"}); await runtime.ready;`,
      );
      await build({
        configFile: false,
        root: bootstrap,
        plugins: [
          workersCapacitorPlugin({
            worker: join(app, ".open-next/worker.js"),
            workerConfig: join(app, "wrangler.jsonc"),
            assetsExecution: "remote",
          }),
        ],
        build: { outDir: join(shell, "www"), emptyOutDir: true },
      });
      const report = JSON.parse(
        await readFile(
          join(shell, "www/workers-capacitor-server.json"),
          "utf8",
        ),
      );
      assert.equal(report.mode, "worker");
      try {
        await access(join(shell, platform));
      } catch {
        await run("npx", ["cap", "add", platform]);
      }
      if (platform === "android") {
        const debug = join(shell, "android/app/src/debug");
        await mkdir(join(debug, "res/raw"), { recursive: true });
        await mkdir(join(debug, "res/xml"), { recursive: true });
        await cp(backend.ca, join(debug, "res/raw/opennext_ca.pem"));
        await writeFile(
          join(debug, "res/xml/opennext_security.xml"),
          '<network-security-config><base-config><trust-anchors><certificates src="system"/></trust-anchors></base-config><debug-overrides><trust-anchors><certificates src="@raw/opennext_ca"/></trust-anchors></debug-overrides></network-security-config>',
        );
        await writeFile(
          join(debug, "AndroidManifest.xml"),
          '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:networkSecurityConfig="@xml/opennext_security"/></manifest>',
        );
      }
      if (platform === "android") {
        const gradle = join(shell, "android/app/build.gradle");
        const source = await readFile(gradle, "utf8");
        if (!source.includes("META-INF/INDEX.LIST"))
          await writeFile(
            gradle,
            source.replace(
              "android {",
              "android {\npackaging.resources { excludes += 'META-INF/INDEX.LIST'; merges += 'META-INF/io.netty.versions.properties' }",
            ),
          );
      }
      await run("npx", ["cap", "sync", platform]);
      if (platform === "ios") {
        await run("xcrun", [
          "simctl",
          "keychain",
          device,
          "add-root-cert",
          backend.ca,
        ]);
        await run("xcodebuild", [
          "-quiet",
          "-project",
          "ios/App/App.xcodeproj",
          "-scheme",
          "App",
          "-configuration",
          "Debug",
          "-sdk",
          "iphonesimulator",
          "-destination",
          `id=${device}`,
          "-derivedDataPath",
          join(artifacts, "ios"),
          "CODE_SIGNING_ALLOWED=NO",
          "build",
        ]);
        await run("xcrun", [
          "simctl",
          "install",
          device,
          join(artifacts, "ios/Build/Products/Debug-iphonesimulator/App.app"),
        ]);
      } else {
        await run(
          "./gradlew",
          ["--no-daemon", "assembleDebug"],
          join(shell, "android"),
        );
        await run("adb", [
          "-s",
          device,
          "install",
          "-r",
          join(shell, "android/app/build/outputs/apk/debug/app-debug.apk"),
        ]);
        await run("adb", [
          "-s",
          device,
          "reverse",
          `tcp:${backend.url.port}`,
          `tcp:${backend.url.port}`,
        ]);
        await run("adb", ["-s", device, "shell", "pm", "clear", appId]);
      }
      const launched = Date.now();
      if (platform === "ios")
        await run("xcrun", [
          "simctl",
          "launch",
          "--terminate-running-process",
          device,
          appId,
        ]);
      else
        await run("adb", [
          "-s",
          device,
          "shell",
          "am",
          "start",
          "-n",
          `${appId}/.MainActivity`,
        ]);
      const deadline = Date.now() + 60000;
      while (!backend.reports.some((r) => r.stage === "complete")) {
        assert.equal(
          backend.reports.find((r) => r.stage === "failure"),
          undefined,
          JSON.stringify(backend.reports),
        );
        assert.ok(
          Date.now() < deadline,
          JSON.stringify({
            reports: backend.reports,
            requests: backend.requests.slice(-15),
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(backend.reports.some((r) => r.stage === "action"));
      assert.ok(backend.reports.some((r) => r.stage === "form"));
      assert.equal(
        backend.reports.find((r) => r.stage === "fallback")?.duringSSR,
        true,
        "Fallback must render before the SSR response ends",
      );
      assert.equal(
        backend.reports.find((r) => r.stage === "complete").fallback,
        true,
      );
      assert.equal(
        backend.reports.find((r) => r.stage === "complete").platform,
        platform,
      );
      assert.ok(backend.requests.some((r) => r.method === "POST" && r.action));
      await writeFile(
        join(artifacts, `${platform}-summary.json`),
        JSON.stringify(
          {
            platform,
            elapsedFlowMs: Date.now() - launched,
            bundleBytes: (
              await Promise.all(
                (await readdir(join(shell, "www"), { recursive: true })).map(
                  (p) => stat(join(shell, "www", p)),
                ),
              )
            )
              .filter((s) => s.isFile())
              .reduce((n, s) => n + s.size, 0),
          },
          null,
          2,
        ),
      );
    } finally {
      await writeFile(
        join(artifacts, `${platform}-reports.json`),
        JSON.stringify(
          { reports: backend.reports, requests: backend.requests },
          null,
          2,
        ),
      );
      await backend.close();
    }
  },
);
