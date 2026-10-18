import { execFileSync } from "node:child_process";
import { readFile, writeFile, open, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const [device, framework] = process.argv.slice(2);
if (!device || !["hono", "express"].includes(framework))
  throw Error(
    "Pass simulator UUID and hono|express (prepare assets and apply plugin overlay first)",
  );
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", ...options });
const log = await open(`${cwd}/artifacts/plugin-document-build.log`, "w");
try {
  if (!process.argv.includes("--reuse-build"))
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
  const app = "jp.rdlabo.workerscapacitor.poc";
  const container = run("xcrun", [
    "simctl",
    "get_app_container",
    device,
    app,
    "data",
  ]).trim();
  await unlink(`${container}/Documents/native-document-result.json`).catch(
    (e) => {
      if (e.code !== "ENOENT") throw e;
    },
  );
  run("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    device,
    app,
  ]);
  let result;
  for (let i = 0; i < 90; i++) {
    try {
      result = JSON.parse(
        await readFile(
          `${container}/Documents/native-document-result.json`,
          "utf8",
        ),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (result) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(result, "Native probe timed out");
  await writeFile(
    `${cwd}/artifacts/plugin-documents-${framework}-ios.json`,
    JSON.stringify(result, null, 2),
  );
  assert.equal(result.framework.toLowerCase(), framework);
  assert.equal(result.cases.length, 65);
  assert.ok(
    result.cases.every((test) => test.passed),
    JSON.stringify(result.cases.filter((test) => !test.passed)),
  );
  console.log(
    `${framework}: ${result.cases.length}/${result.cases.length} native checks passed`,
  );
} finally {
  await log.close();
}
