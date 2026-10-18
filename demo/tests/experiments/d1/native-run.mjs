import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
const [platform, device] = process.argv.slice(2);
if (!["ios", "android"].includes(platform) || !device)
  throw new Error("native-run.mjs ios|android <device>");
const ui = process.argv.includes("--ui");
const services = process.argv.includes("--services");
if (ui && services) throw new Error("Choose either --ui or --services");
const artifacts = fileURLToPath(
  new URL(
    services
      ? "../../../artifacts/services-native/"
      : ui
        ? "../../../artifacts/d1-native-ui/"
        : "../../../artifacts/d1-native/",
    import.meta.url,
  ),
);
const { consumer } = JSON.parse(
  await readFile(join(artifacts, "consumer.json"), "utf8"),
);
const run = (command, args, cwd = consumer) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 64 * 1024 * 1024,
    ...(command === "./gradlew"
      ? {
          env: {
            ...process.env,
            JAVA_HOME:
              process.env.D1_JAVA_HOME ??
              "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
          },
        }
      : {}),
  });
const app = ui
  ? "jp.rdlabo.capacitorworkers.d1ui"
  : "jp.rdlabo.capacitorworkers.d1test";
const runId = `${platform}-${Date.now()}`;
const config = { id: runId, mode: "flow", value: platform === "ios" ? 17 : 23 };
if (ui)
  await writeFile(join(artifacts, "ui-config.json"), JSON.stringify(config));
await mkdir(join(consumer, "artifacts"), { recursive: true });
let child;
let log = "";
try {
  if (platform === "ios") {
    run("xcrun", [
      "simctl",
      "keychain",
      device,
      "add-root-cert",
      join(artifacts, "ca.pem"),
    ]);
    const result = run("xcodebuild", [
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
      "artifacts/ios",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ]);
    await writeFile(join(artifacts, "ios-build.log"), result);
    run("xcrun", [
      "simctl",
      "install",
      device,
      join(
        consumer,
        "artifacts/ios/Build/Products/Debug-iphonesimulator/App.app",
      ),
    ]);
    child = spawn("xcrun", [
      "simctl",
      "launch",
      "--console-pty",
      "--terminate-running-process",
      device,
      app,
    ]);
  } else {
    const result = run(
      "./gradlew",
      ["--no-daemon", "assembleDebug"],
      join(consumer, "android"),
    );
    await writeFile(join(artifacts, "android-build.log"), result);
    run("adb", [
      "-s",
      device,
      "install",
      "-r",
      join(consumer, "android/app/build/outputs/apk/debug/app-debug.apk"),
    ]);
    run("adb", ["-s", device, "shell", "am", "force-stop", app]);
    child = spawn("adb", ["-s", device, "logcat", "-T", "1", "-v", "raw"]);
  }
  child.stdout.on("data", (data) => (log += data));
  child.stderr.on("data", (data) => (log += data));
  if (platform === "android")
    run("adb", [
      "-s",
      device,
      "shell",
      "am",
      "start",
      "-n",
      `${app}/.MainActivity`,
    ]);
  if (ui) {
    const waitReport = async (stage) => {
      const until = Date.now() + 90000;
      while (Date.now() < until) {
        let reports = [];
        try {
          reports = JSON.parse(
            await readFile(join(artifacts, "ui-reports.json"), "utf8"),
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        const result = reports.filter((r) => r.run === runId);
        if (result.some((r) => r.stage === stage)) return result;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw Error("Native UI timed out: " + stage);
    };
    const reports = await waitReport("complete");
    const stages = reports.map((r) => r.stage);
    for (const expected of ["login", "account", "saved", "details", "complete"])
      assert.ok(stages.includes(expected), expected);
    for (const report of reports) {
      assert.equal(report.asset, "UI script loaded");
      assert.equal(report.styled, true);
      assert.equal(report.cookieVisible, false);
    }
    const saved = reports.find((r) => r.stage === "saved");
    const account = reports.find((r) => r.stage === "account");
    assert.equal(saved.value, String(config.value));
    assert.equal(account.account, "alice");
    assert.equal(
      saved.database.results[0].writes - account.database.results[0].writes,
      1,
      "exactly one DB write through form/303 navigation",
    );
    if (platform === "ios")
      run("xcrun", [
        "simctl",
        "io",
        device,
        "screenshot",
        join(artifacts, "ios-ui.png"),
      ]);
    else {
      execFileSync("adb", [
        "-s",
        device,
        "shell",
        "screencap",
        "-p",
        "/sdcard/d1-ui.png",
      ]);
      run("adb", [
        "-s",
        device,
        "pull",
        "/sdcard/d1-ui.png",
        join(artifacts, "android-ui.png"),
      ]);
    }
    const relaunch = async (mode) => {
      await writeFile(
        join(artifacts, "ui-config.json"),
        JSON.stringify({ ...config, mode }),
      );
      if (platform === "ios") {
        run("xcrun", ["simctl", "terminate", device, app]);
        child.kill("SIGTERM");
        child = spawn("xcrun", [
          "simctl",
          "launch",
          "--console-pty",
          device,
          app,
        ]);
        child.stdout.on("data", (data) => (log += data));
        child.stderr.on("data", (data) => (log += data));
      } else {
        run("adb", ["-s", device, "shell", "am", "force-stop", app]);
        run("adb", [
          "-s",
          device,
          "shell",
          "am",
          "start",
          "-n",
          `${app}/.MainActivity`,
        ]);
      }
    };
    await relaunch("restart");
    const restarted = (await waitReport("restart")).find(
      (r) => r.stage === "restart",
    );
    assert.equal(restarted.path, "/ui/account");
    assert.equal(restarted.account, "alice");
    assert.equal(restarted.value, String(config.value));
    assert.equal(restarted.cookieVisible, false);
    await relaunch("logout");
    const logout = (await waitReport("logout")).find(
      (r) => r.stage === "logout",
    );
    assert.equal(logout.path, "/ui/login");
    await relaunch("loggedout");
    const loggedout = (await waitReport("loggedout")).find(
      (r) => r.stage === "loggedout",
    );
    assert.equal(loggedout.path, "/ui/login");
    assert.equal(loggedout.cookieVisible, false);
    await writeFile(
      join(artifacts, `${platform}-ui.json`),
      JSON.stringify(
        {
          platform,
          run: runId,
          reports,
          restarted,
          logout,
          loggedout,
          passed: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `${platform}: rendered login, form, D1, 303 navigation, assets and persistent session restart passed`,
    );
  } else {
    const deadline = Date.now() + 90000;
    let report;
    while (!report && Date.now() < deadline) {
      const match = log.match(/D1_NATIVE_RESULT (\{[^\r\n]+\})/);
      if (match) report = JSON.parse(match[1]);
      else await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(report, "Native report timed out");
    await writeFile(
      join(artifacts, `${platform}.json`),
      JSON.stringify(report, null, 2),
    );
    assert.deepEqual(
      report.cases.filter((test) => !test.passed),
      [],
    );
    assert.equal(report.cases.length, services ? 30 : 20);
    console.log(
      `${platform}: ${report.cases.length} HTTPS/${services ? "services" : "D1"} native checks passed`,
    );
  }
} catch (error) {
  if (error.stdout)
    await writeFile(
      join(artifacts, `${platform}-build.log`),
      String(error.stdout) + String(error.stderr ?? ""),
    );
  throw error;
} finally {
  child?.kill("SIGTERM");
  await writeFile(join(artifacts, `${platform}.log`), log);
}
