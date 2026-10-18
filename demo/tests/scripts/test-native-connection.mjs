import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const device = process.argv[2];
if (!device) throw Error("Pass the booted iOS simulator UUID");
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", ...options });
const overlay = (action) =>
  run(process.execPath, [
    "tests/scripts/native-connection-overlay.mjs",
    action,
  ]);
const app = "jp.rdlabo.workerscapacitor.poc";
await mkdir(`${cwd}/artifacts`, { recursive: true });
const log = await open(`${cwd}/artifacts/connection-build.log`, "w");
overlay("apply");
try {
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
      "artifacts/connection-ios",
      "-skipPackageUpdates",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
    { stdio: ["ignore", log.fd, log.fd] },
  );
  run("xcrun", [
    "simctl",
    "install",
    device,
    "artifacts/connection-ios/Build/Products/Debug-iphonesimulator/App.app",
  ]);
  run("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    device,
    app,
  ]);
  const container = run("xcrun", [
    "simctl",
    "get_app_container",
    device,
    app,
    "data",
  ]).trim();
  let result;
  for (let i = 0; i < 30; i++) {
    try {
      result = JSON.parse(
        await readFile(`${container}/Documents/connection-probe.json`, "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (result?.completed) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(result?.completed, true, "Native probe timed out");
  await writeFile(
    `${cwd}/artifacts/connection-probe.json`,
    JSON.stringify(result, null, 2),
  );
  assert.equal(result.controller, "CAPBridgeViewController");
  assert.equal(result.configurationCopyHasNewHandler, true);
  assert.equal(result.liveConfigurationHasNewHandler, false);
  assert.equal(result.pluginInterceptedNavigation, true);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].url, "capacitor://localhost/probe/page");
  assert.equal(result.pages[1].url, "capacitor://localhost/probe/next");
  assert.ok(result.pages.every((page) => page.pageRuns === 1));
  assert.equal(result.canGoBackAfterLoad, false);
  assert.equal(result.finalURL, "capacitor://localhost/probe/next");
  console.log(
    "Confirmed: late handler absent; HTML URL/new Window preserved; native back history absent.",
  );
} finally {
  overlay("restore");
  await log.close();
}
