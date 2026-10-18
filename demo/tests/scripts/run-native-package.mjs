import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const [platform, framework, device] = process.argv.slice(2);
if (
  !["ios", "android"].includes(platform) ||
  !["hono", "express"].includes(framework) ||
  !device
)
  throw Error(
    "Usage: run-native-package.mjs ios|android hono|express <simulator UUID|emulator serial>",
  );
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const { consumer } = JSON.parse(
  await readFile(
    new URL("../../artifacts/native-package-consumer.json", import.meta.url),
    "utf8",
  ),
);
const output = join(consumer, "artifacts");
await mkdir(output, { recursive: true });
const appId = "jp.rdlabo.workerscapacitor.packaged";
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: consumer,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
const adb = process.env.ADB ?? "adb";
const adbArgs = [
  ...(process.env.ADB_SERVER_PORT ? ["-P", process.env.ADB_SERVER_PORT] : []),
  "-s",
  device,
];
const adbRun = (args) => run(adb, [...adbArgs, ...args]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A fresh run token resets the in-app lifecycle stage; application data itself
// is never cleared between stages.
await writeFile(
  join(consumer, "public/packaged-run.json"),
  JSON.stringify({ id: randomBytes(8).toString("hex") }),
);
// Restore pristine fixtures: a previous run may have applied the update patch.
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
await rm(join(consumer, "public/rendering/update-v2.txt"), { force: true });

const buildWeb = () => {
  run("npm", ["run", "build", "--", "--mode", framework]);
  run("npx", ["cap", "sync", platform]);
};
const buildApp = async (label) => {
  const buildLog = await open(
    join(output, `${platform}-${framework}-${label}-build.log`),
    "w",
  );
  try {
    if (platform === "ios")
      run(
        "xcodebuild",
        [
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
          join(output, "ios"),
          "-skipPackageUpdates",
          "CODE_SIGNING_ALLOWED=NO",
          "build",
        ],
        { stdio: ["ignore", buildLog.fd, buildLog.fd] },
      );
    else
      run("./gradlew", ["clean", ":app:assembleDebug"], {
        cwd: join(consumer, "android"),
        stdio: ["ignore", buildLog.fd, buildLog.fd],
      });
  } finally {
    await buildLog.close();
  }
};
// Install keeps application data, so the update stage exercises a real upgrade.
const installApp = () =>
  platform === "ios"
    ? run("xcrun", [
        "simctl",
        "install",
        device,
        join(output, "ios/Build/Products/Debug-iphonesimulator/App.app"),
      ])
    : adbRun([
        "install",
        "-r",
        join(consumer, "android/app/build/outputs/apk/debug/app-debug.apk"),
      ]);

let log = "";
let cursor = 0;
let child;
const receive = (chunk) => {
  log += chunk.toString();
};
const launch = async () => {
  if (platform === "ios") {
    child = spawn(
      "xcrun",
      [
        "simctl",
        "launch",
        "--console-pty",
        "--terminate-running-process",
        device,
        appId,
      ],
      { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] },
    );
  } else {
    adbRun(["shell", "am", "force-stop", appId]);
    adbRun(["shell", "am", "start", "-n", appId + "/.MainActivity"]);
    let pid;
    for (let i = 0; i < 30 && !pid; i++) {
      try {
        pid = adbRun(["shell", "pidof", appId]).trim();
      } catch {}
      if (!pid) await sleep(100);
    }
    assert.ok(pid, "Android app did not launch");
    child = spawn(
      adb,
      [...adbArgs, "logcat", "--pid=" + pid, "-T", "1", "-v", "raw"],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }
  child.stdout.on("data", receive);
  child.stderr.on("data", receive);
};
const terminate = async () => {
  try {
    // Pause first so WebView DOM storage commits the lifecycle stage before the
    // process is killed.
    if (platform === "ios")
      run("xcrun", ["simctl", "launch", device, "com.apple.Preferences"]);
    else adbRun(["shell", "input", "keyevent", "KEYCODE_HOME"]);
    await sleep(1500);
  } catch {}
  try {
    if (platform === "ios")
      run("xcrun", ["simctl", "terminate", device, appId]);
    else adbRun(["shell", "am", "force-stop", appId]);
  } catch {}
  if (child)
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(10000),
    ]);
  child?.kill("SIGTERM");
  child = undefined;
};
const waitMarker = (name, regex, timeout = 180000) =>
  new Promise((resolve, reject) => {
    const finish = (action, value) => {
      clearInterval(poll);
      clearTimeout(timer);
      action(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error(`Timed out waiting for ${name}`)),
      timeout,
    );
    const poll = setInterval(() => {
      const match = log.slice(cursor).match(regex);
      if (!match) return;
      cursor += match.index + match[0].length;
      finish(resolve, match);
    }, 100);
  });
const waitLifecycle = async (stage) => {
  const match = await waitMarker(
    stage,
    new RegExp(
      `PACKAGED_LIFECYCLE (\\{[^\\r\\n]*"stage":"${stage}"[^\\r\\n]*\\})`,
    ),
  );
  const result = JSON.parse(match[1]);
  assert.ok(result.passed, `${stage} lifecycle stage failed: ${match[1]}`);
  return result;
};
const waitStop = () => waitMarker("PACKAGED_STOP", /PACKAGED_STOP/);

// The update stage replaces the bundled Worker output and adds/changes static
// assets, then reinstalls without clearing application data.
const applyUpdate = async () => {
  const workerPath = join(
    consumer,
    "workers",
    framework === "express" ? "express.ts" : "hono.tsx",
  );
  const title = framework === "express" ? "Express document" : "Hono document";
  const source = await readFile(workerPath, "utf8");
  assert.ok(
    source.includes(`<title>${title}</title>`),
    "Worker title marker changed",
  );
  await writeFile(
    workerPath,
    source.replace(`<title>${title}</title>`, `<title>${title} v2</title>`),
  );
  const messagePath = join(consumer, "public/rendering/message.js");
  const message = await readFile(messagePath, "utf8");
  assert.ok(message.includes('"module ready"'), "Static asset marker changed");
  await writeFile(
    messagePath,
    message.replace('"module ready"', '"module ready v2"'),
  );
  await writeFile(join(consumer, "public/rendering/update-v2.txt"), "v2\n");
};

const lifecycle = {};
try {
  buildWeb();
  await buildApp("v1");
  installApp();
  await launch();
  const report = JSON.parse(
    (await waitMarker("PACKAGED_RESULT", /PACKAGED_RESULT (\{[^\r\n]+\})/))[1],
  );
  assert.equal(report.framework.toLowerCase(), framework);
  assert.equal(report.total, 50);
  assert.deepEqual(report.failed, []);
  // Background/foreground while the rendered document stays installed.
  if (platform === "ios")
    run("xcrun", ["simctl", "launch", device, "com.apple.Preferences"]);
  else adbRun(["shell", "input", "keyevent", "KEYCODE_HOME"]);
  await sleep(2000);
  if (platform === "ios") run("xcrun", ["simctl", "launch", device, appId]);
  else adbRun(["shell", "am", "start", "-n", appId + "/.MainActivity"]);
  lifecycle.background = await waitLifecycle("background");
  await waitStop();
  await terminate();
  // Terminate/relaunch: a fresh process must render again.
  await launch();
  lifecycle.relaunch = await waitLifecycle("relaunch");
  await waitStop();
  await terminate();
  // Install updated bundled assets without deleting application data.
  await applyUpdate();
  buildWeb();
  await buildApp("v2");
  installApp();
  await launch();
  lifecycle.update = await waitLifecycle("update");
  await waitStop();
  // Shutdown/reinitialization: iOS re-calls the public API from the runtime
  // host after dispose(); Android reloads the document so the persistent
  // Service Worker restarts the native host through the bundled bootstrap.
  if (platform === "ios")
    await waitMarker("PACKAGED_RESTART", /PACKAGED_RESTART/);
  lifecycle.reinit = await waitLifecycle("reinit");
  lifecycle.complete = JSON.parse(
    (
      await waitMarker(
        "complete",
        /PACKAGED_LIFECYCLE (\{[^\r\n]*"stage":"complete"[^\r\n]*\})/,
      )
    )[1],
  );
  assert.ok(lifecycle.complete.passed, "final lifecycle stage failed");
  await waitStop();
  await terminate();
  await writeFile(
    join(output, `${platform}-${framework}.json`),
    JSON.stringify({ ...report, lifecycle, stop: true }, null, 2),
  );
  console.log(
    `${platform}/${framework}: ${report.total}/${report.total}, lifecycle background/relaunch/update/reinit passed (packed install, no native overlays)`,
  );
} finally {
  child?.kill("SIGTERM");
  await writeFile(join(output, `${platform}-${framework}-console.log`), log);
}
