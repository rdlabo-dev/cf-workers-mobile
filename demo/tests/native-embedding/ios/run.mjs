import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  access,
} from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const scratch =
  process.env.WORKERS_IOS_PROBE_DIR || "/private/tmp/workers-ios-acceptance";
const device = process.argv[2];
const scenario = process.argv[3] || "normal";
const finalMarker =
  scenario === "startup-failure"
    ? "SDK_STARTUP_FAILURE_CLEANED 0"
    : "SDK_SWIFTUI_DISMANTLED 0";
if (!device) throw new Error("Usage: node run.mjs <booted-simulator-UUID>");
function run(command, args, cwd = here) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  appendFileSync(
    `${scratch}/build.log`,
    `$ ${command} ${args.join(" ")}\n${result.stdout || ""}${result.stderr || ""}\n`,
  );
  if (result.status !== 0)
    throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
await mkdir(scratch, { recursive: true });
run(process.execPath, ["../build-web.mjs", "ios", scenario]);
const sdk = run("xcrun", ["--sdk", "iphonesimulator", "--show-sdk-path"]);
const arch = process.arch === "arm64" ? "arm64" : "x86_64";
const buildArgs = [
  "build",
  ...(process.env.WORKERS_IOS_BUILD_SYSTEM
    ? ["--build-system", process.env.WORKERS_IOS_BUILD_SYSTEM]
    : []),
  "--triple",
  `${arch}-apple-ios15.0-simulator`,
  "--sdk",
  sdk,
  "--scratch-path",
  `${scratch}/build`,
  "--disable-sandbox",
];
run("swift", ["--version"]);
run("swift", buildArgs);
const products = run("swift", [...buildArgs, "--show-bin-path"])
  .split("\n")
  .at(-1);
console.log(`SwiftPM products: ${products}`);
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
async function framework(name) {
  if (await exists(`${products}/${name}`)) return `${products}/${name}`;
  async function search(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.name === name && directory.endsWith("-simulator"))
        return candidate;
      const found = await search(candidate);
      if (found) return found;
    }
  }
  const found = await search(`${scratch}/build/artifacts`);
  if (!found)
    throw new Error(
      `Missing simulator framework ${name}; see ${scratch}/build.log`,
    );
  return found;
}
const frameworks = await Promise.all(
  ["Capacitor.framework", "Cordova.framework"].map(framework),
);
const objects = [];
for (const module of ["Consumer", "WorkersIOS", "WorkersCapacitor"]) {
  if (await exists(`${products}/${module}.o`))
    objects.push(`${products}/${module}.o`);
  else
    for (const file of await readdir(`${products}/${module}.build`))
      if (file.endsWith(".o"))
        objects.push(`${products}/${module}.build/${file}`);
}
const app = `${scratch}/Probe.app`;
await mkdir(`${app}/Frameworks`, { recursive: true });
for (const source of frameworks)
  await cp(source, `${app}/Frameworks/${path.basename(source)}`, {
    recursive: true,
  });
await cp(
  `${products}/WorkersEmbeddingConsumer_Consumer.bundle`,
  `${app}/WorkersEmbeddingConsumer_Consumer.bundle`,
  { recursive: true },
);
await writeFile(
  `${scratch}/main.swift`,
  await readFile(path.join(here, "RuntimeProbe.swift.example")),
);
await writeFile(
  `${app}/Info.plist`,
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Probe</string><key>CFBundleIdentifier</key><string>jp.rdlabo.workers.sdkacceptance</string><key>CFBundleName</key><string>SDK Acceptance</string><key>CFBundlePackageType</key><string>APPL</string><key>MinimumOSVersion</key><string>15.0</string><key>UIApplicationSceneManifest</key><dict><key>UISceneConfigurations</key><dict><key>UIWindowSceneSessionRoleApplication</key><array><dict><key>UISceneDelegateClassName</key><string>SceneDelegate</string></dict></array></dict></dict><key>UILaunchScreen</key><dict/></dict></plist>`,
);
run("xcrun", [
  "swiftc",
  "-target",
  `${arch}-apple-ios15.0-simulator`,
  "-sdk",
  sdk,
  "-F",
  `${app}/Frameworks`,
  "-I",
  products,
  "-I",
  `${products}/Modules`,
  "-module-cache-path",
  `${scratch}/cache`,
  "-framework",
  "Capacitor",
  "-framework",
  "Cordova",
  ...objects,
  "-Xlinker",
  "-rpath",
  "-Xlinker",
  "@executable_path/Frameworks",
  `${scratch}/main.swift`,
  "-o",
  `${app}/Probe`,
]);
run("xcrun", ["simctl", "install", device, app]);
const output = await new Promise((resolve, reject) => {
  const child = spawn("xcrun", [
    "simctl",
    "launch",
    "--terminate-running-process",
    "--console-pty",
    device,
    "jp.rdlabo.workers.sdkacceptance",
    scenario,
  ]);
  let log = "";
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error(`Probe timed out\n${log}`));
  }, 90000);
  const receive = (chunk) => {
    log += chunk.toString();
    if (log.includes(finalMarker)) {
      clearTimeout(timer);
      child.kill();
      resolve(log);
    }
  };
  child.stdout.on("data", receive);
  child.stderr.on("data", receive);
  child.on("error", reject);
  child.on("exit", (code) => {
    if (!log.includes(finalMarker)) {
      clearTimeout(timer);
      reject(new Error(`Probe exited ${code}\n${log}`));
    }
  });
});
if (scenario !== "startup-failure")
  for (const marker of [
    "SDK_HOOK function",
    "SDK_DOCUMENT Worker Home",
    "SDK_NAVIGATION Worker Next",
    "SDK_POST Posted verified",
    "SDK_CLOSED CHILDREN 0 RUNTIME_CHILDREN 0",
    "SDK_REOPENED_SWIFTUI Worker Home",
  ])
    if (!output.includes(marker))
      throw new Error(`Missing ${marker}\n${output}`);
await writeFile(`${scratch}/${scenario}.log`, output);
console.log(`PASS ${scenario}. Log: ${scratch}/${scenario}.log`);
