import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
const [platform, device] = process.argv.slice(2);
if (!["ios", "android"].includes(platform) || !device)
  throw new Error("native-run.mjs ios|android <device>");
const artifacts = fileURLToPath(
  new URL("../../../artifacts/d1-native/", import.meta.url),
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
const app = "jp.rdlabo.capacitorworkers.d1test";
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
  assert.equal(report.cases.length, 20);
  console.log(
    `${platform}: ${report.cases.length} HTTPS/D1 native checks passed`,
  );
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
