import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  access,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startBackend } from "./backend.mjs";
const exec = promisify(execFile);
const platform = process.env.OPENNEXT_PLATFORM;
const device = process.env.OPENNEXT_DEVICE;
if (!["ios", "android"].includes(platform) || !device)
  throw Error("Set OPENNEXT_PLATFORM=ios|android and OPENNEXT_DEVICE");
const root = fileURLToPath(new URL("../../opennext/", import.meta.url));
const artifacts = fileURLToPath(
  new URL("../../artifacts/opennext-native/", import.meta.url),
);
const local = process.env.OPENNEXT_LOCAL === "1";
const appId = "jp.rdlabo.workerscapacitor.opennext";
test(
  `OpenNext ${local ? "local rendering" : "+ D1 + HttpOnly Session"} in ${platform} WebView`,
  { timeout: 600000 },
  async () => {
    await mkdir(artifacts, { recursive: true });
    const backend = await startBackend({ native: true });
    const run = async (command, args, cwd = root) => {
      try {
        const result = await exec(command, args, {
          cwd,
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            VITE_WORKER_ORIGIN: backend.url.origin,
            VITE_REPORT_ORIGIN: local ? backend.url.origin : "",
            JAVA_HOME:
              process.env.JAVA_HOME ||
              "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
          },
        });
        return result.stdout;
      } catch (error) {
        await writeFile(
          join(artifacts, `${platform}-error.log`),
          `${error.stdout}\n${error.stderr}`,
        );
        throw error;
      }
    };
    const waitReport = async (stage) => {
      const end = Date.now() + 60000;
      while (Date.now() < end) {
        const failure = backend.reports.find(
          (report) => report.stage === "failure",
        );
        assert.equal(failure, undefined, JSON.stringify(failure));
        const report = backend.reports.find((report) => report.stage === stage);
        if (report) return report;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`No ${stage} report: ${JSON.stringify(backend.reports)}`);
    };
    try {
      if (local) {
        await run(
          "npx",
          ["vite", "build", "--config", "tests/opennext/local/vite.config.ts"],
          join(root, ".."),
        );
        await rm(join(root, "www"), { recursive: true, force: true });
        await cp(join(root, "../artifacts/opennext-local"), join(root, "www"), {
          recursive: true,
        });
      } else await run("npm", ["run", "build:capacitor"]);
      try {
        await access(join(root, platform));
      } catch {
        await run("npx", ["cap", "add", platform]);
      }
      if (platform === "android") {
        const debug = join(root, "android/app/src/debug");
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
        const gradle = join(root, "android/app/build.gradle");
        let source = await readFile(gradle, "utf8");
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
          join(root, "android"),
        );
        await run("adb", [
          "-s",
          device,
          "install",
          "-r",
          join(root, "android/app/build/outputs/apk/debug/app-debug.apk"),
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
      const launch = async () => {
        if (platform === "ios")
          await run("xcrun", [
            "simctl",
            "launch",
            "--terminate-running-process",
            device,
            appId,
          ]);
        else {
          await run("adb", ["-s", device, "shell", "am", "force-stop", appId]);
          await run("adb", [
            "-s",
            device,
            "shell",
            "am",
            "start",
            "-n",
            `${appId}/.MainActivity`,
          ]);
        }
      };
      const launchedAt = Date.now();
      await launch();
      const hydrated = await waitReport(local ? "local-hydrated" : "hydrated");
      hydrated.launchToHydrationMs = Date.now() - launchedAt;
      hydrated.bundleBytes = (
        await Promise.all(
          (await readdir(join(root, "www"), { recursive: true })).map((path) =>
            stat(join(root, "www", path)),
          ),
        )
      )
        .filter((info) => info.isFile())
        .reduce((sum, info) => sum + info.size, 0);
      if (local) {
        await waitReport("local-complete");
        assert.deepEqual(
          backend.requests,
          [],
          "Local pages must not reach the remote Worker",
        );
        return;
      }
      const complete = await waitReport("complete");
      assert.equal(complete.cookieVisible, false);
      assert.equal(complete.owner, "alice");
      assert.equal(complete.notes.results[0].value, "Native note");
      assert.equal(complete.notes.results[0].writes, 1);
      backend.config.mode = "restart";
      await launch();
      assert.equal((await waitReport("restart")).owner, "alice");
      backend.config.mode = "logout";
      await launch();
      await waitReport("logout");
      backend.config.mode = "loggedout";
      await launch();
      await waitReport("loggedout");
      assert.equal(
        (
          await backend.db
            .prepare("SELECT count(*) AS count FROM sessions")
            .first()
        ).count,
        0,
      );
    } finally {
      await writeFile(
        join(
          artifacts,
          `${platform}-${local ? "local" : "remote"}-reports.json`,
        ),
        JSON.stringify(backend.reports, null, 2),
      );
      await backend.close();
    }
  },
);
