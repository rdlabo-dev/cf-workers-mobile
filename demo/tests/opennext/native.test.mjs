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
import { startLiveBackend } from "./live/backend.mjs";
const exec = promisify(execFile);
const platform = process.env.OPENNEXT_PLATFORM;
const device = process.env.OPENNEXT_DEVICE;
if (!["ios", "android"].includes(platform) || !device)
  throw Error("Set OPENNEXT_PLATFORM=ios|android and OPENNEXT_DEVICE");
const root = fileURLToPath(new URL("../../opennext/", import.meta.url));
const artifacts = fileURLToPath(
  new URL("../../artifacts/opennext-native/", import.meta.url),
);
const physicalIOS =
  platform === "ios" && process.env.IOS_PHYSICAL_DEVICE === "1";
if (physicalIOS && !process.env.IOS_DEVELOPMENT_TEAM)
  throw Error("Set IOS_DEVELOPMENT_TEAM for physical iOS signing");
const local = process.env.OPENNEXT_LOCAL === "1";
const appId = "jp.rdlabo.workerscapacitor.opennext";
test(
  `OpenNext ${local ? "local rendering" : "+ D1 + HttpOnly Session"} in ${platform} WebView`,
  { timeout: 600000 },
  async () => {
    await mkdir(artifacts, { recursive: true });
    const live = Boolean(process.env.NATIVE_TEST_ORIGIN);
    if (live && local)
      throw Error(
        "The deployed acceptance profile tests remote execution; omit OPENNEXT_LOCAL",
      );
    if (physicalIOS && !live)
      throw Error(
        "Physical iOS remote acceptance requires NATIVE_TEST_ORIGIN with a publicly trusted certificate",
      );
    const backend = live
      ? await startLiveBackend()
      : await startBackend({ native: true });
    const run = async (command, args, cwd = root) => {
      try {
        const result = await exec(command, args, {
          cwd,
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            VITE_WORKER_ORIGIN: backend.url.origin,
            VITE_TEST_DEVICE_TOKEN: process.env.NATIVE_TEST_DEVICE_TOKEN ?? "",
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
        await backend.refresh?.();
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
    const configPath = join(root, "capacitor.config.ts");
    const originalConfig = await readFile(configPath, "utf8");
    try {
      if (!local) {
        // Test-only packaged plugin: use Capacitor discovery, not native source patches.
        await cp(
          fileURLToPath(
            new URL("../fixtures/plugins/bridge-probe", import.meta.url),
          ),
          join(root, "node_modules/@workers-capacitor-test/bridge-probe"),
          { recursive: true },
        );
        await writeFile(
          configPath,
          originalConfig.replace(
            'webDir: "www",',
            'webDir: "www", includePlugins: ["workers-capacitor", "@workers-capacitor-test/bridge-probe"],',
          ),
        );
      }
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
      } else if (live) {
        await run(
          "npx",
          ["vite", "build", "--config", "tests/opennext/live/vite.config.ts"],
          join(root, ".."),
        );
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
        if (backend.ca)
          await cp(backend.ca, join(debug, "res/raw/opennext_ca.pem"));
        else await rm(join(debug, "res/raw/opennext_ca.pem"), { force: true });
        await writeFile(
          join(debug, "res/xml/opennext_security.xml"),
          backend.ca
            ? '<network-security-config><base-config><trust-anchors><certificates src="system"/></trust-anchors></base-config><debug-overrides><trust-anchors><certificates src="@raw/opennext_ca"/></trust-anchors></debug-overrides></network-security-config>'
            : '<network-security-config><base-config><trust-anchors><certificates src="system"/></trust-anchors></base-config></network-security-config>',
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
        if (!physicalIOS && backend.ca)
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
          physicalIOS ? "iphoneos" : "iphonesimulator",
          "-destination",
          `id=${device}`,
          "-derivedDataPath",
          join(artifacts, "ios"),
          ...(physicalIOS
            ? [
                "-allowProvisioningUpdates",
                `DEVELOPMENT_TEAM=${process.env.IOS_DEVELOPMENT_TEAM}`,
                "CODE_SIGN_STYLE=Automatic",
              ]
            : ["CODE_SIGNING_ALLOWED=NO"]),
          "build",
        ]);
        await run("xcrun", [
          ...(physicalIOS
            ? ["devicectl", "device", "install", "app", "--device", device]
            : ["simctl", "install", device]),
          join(
            artifacts,
            `ios/Build/Products/Debug-${physicalIOS ? "iphoneos" : "iphonesimulator"}/App.app`,
          ),
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
      let iosPid;
      const launch = async () => {
        await backend.configure?.();
        if (platform === "ios") {
          const output = await run("xcrun", [
            ...(physicalIOS
              ? [
                  "devicectl",
                  "device",
                  "process",
                  "launch",
                  "--terminate-existing",
                  "--device",
                  device,
                ]
              : ["simctl", "launch", "--terminate-running-process", device]),
            appId,
          ]);
          if (!physicalIOS) {
            iosPid = output.trim().split(": ").at(-1);
            assert.match(iosPid, /^\d+$/);
          }
        } else {
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
      // Process RSS excludes separate WebView renderer/GPU processes. This is
      // a single Debug sample, not a production memory budget.
      const memory = physicalIOS
        ? "Not collected: host ps cannot measure an iPhone process.\n"
        : platform === "ios"
          ? await run("ps", ["-o", "rss=", "-p", iosPid])
          : await run("adb", [
              "-s",
              device,
              "shell",
              "dumpsys",
              "meminfo",
              appId,
            ]);
      const hostProcessRssKiB = physicalIOS
        ? null
        : platform === "ios"
          ? Number(memory.trim())
          : Number(memory.match(/TOTAL RSS:\s*(\d+)/)?.[1]);
      if (!physicalIOS)
        assert.ok(Number.isFinite(hostProcessRssKiB) && hostProcessRssKiB > 0);
      await writeFile(join(artifacts, `${platform}-memory.txt`), memory);
      await writeFile(
        join(artifacts, `${platform}-performance.json`),
        JSON.stringify(
          {
            platform,
            device,
            configuration: "Debug",
            environment:
              physicalIOS ||
              (platform === "android" &&
                (
                  await run("adb", [
                    "-s",
                    device,
                    "shell",
                    "getprop",
                    "ro.kernel.qemu",
                  ])
                ).trim() !== "1")
                ? "physical device"
                : "simulator/emulator",
            execution: local ? "local" : "remote",
            launchToHydrationMs: hydrated.launchToHydrationMs,
            bundleBytes: hydrated.bundleBytes,
            hostProcessRssKiB,
            samples: 1,
            memoryScope: physicalIOS
              ? "not collected on physical iOS"
              : "host process RSS only; excludes renderer/GPU processes",
          },
          null,
          2,
        ),
      );
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
      if (!live) {
        const assets = JSON.parse(
          await readFile(
            join(root, "www/workers-capacitor-assets.json"),
            "utf8",
          ),
        );
        assert.ok(
          assets.some(
            (path) => path.startsWith("/_next/static/") && path.endsWith(".js"),
          ),
        );
        assert.ok(assets.includes("/mark.svg"));
        assert.deepEqual(
          backend.requests.filter((request) =>
            assets.includes(new URL(request.path, backend.url).pathname),
          ),
          [],
          "Hydration, navigation, CSS and images must use bundled assets",
        );
      }
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
      const plugins = backend.reports.filter(
        (report) => report.stage === "plugin",
      );
      for (const mode of ["flow", "restart", "logout", "loggedout"])
        assert.ok(
          plugins.some((report) => report.mode === mode),
          `Missing plugin event in ${mode}`,
        );
      assert.ok(plugins.some((report) => report.path === "/details"));
      assert.ok(plugins.some((report) => report.path === "/account"));
      for (const report of plugins) {
        assert.equal(report.platform, platform);
        assert.equal(report.reply, true);
        assert.equal(report.event, true);
        assert.equal(report.rejected, true);
      }
      assert.equal(
        live
          ? backend.sessionCount()
          : (
              await backend.db
                .prepare("SELECT count(*) AS count FROM sessions")
                .first()
            ).count,
        0,
      );
    } finally {
      await writeFile(configPath, originalConfig);
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
