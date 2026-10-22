import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const here = fileURLToPath(new URL("./", import.meta.url));
const device = process.argv[2];
const centralOnly = process.argv.includes("--central");
if (!device) throw new Error("Usage: node run.mjs <emulator-serial>");
if (!device.startsWith("emulator-"))
  throw new Error("This fixture requires an emulator");
const gradle = fileURLToPath(
  new URL("../../../android/gradlew", import.meta.url),
);
const artifacts = path.join(here, "build/acceptance");
await mkdir(artifacts, { recursive: true });
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: here,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
const adb = (...args) =>
  run("adb", ["-s", device, ...args], { timeout: 60_000 });
for (const scenario of ["normal", "startup-failure", "broken-entry"])
  run(process.execPath, ["../build-web.mjs", "android", scenario]);
if (!centralOnly)
  run(gradle, [
    "-p",
    here,
    "-PincludeSdk",
    ":workers:publishReleasePublicationToProbeRepository",
    "--console=plain",
  ]);
// No SDK project in this invocation: resolve the AAR and its metadata.
run(gradle, [
  "-p",
  here,
  ...(centralOnly ? ["-PcentralOnly", "--refresh-dependencies"] : []),
  ":app:assembleDebug",
  "--console=plain",
]);
adb("install", "-r", "app/build/outputs/apk/debug/app-debug.apk");
adb("shell", "am", "force-stop", "probe.workersembed");
adb("logcat", "-c");
adb("shell", "am", "start", "-n", "probe.workersembed/probe.Launcher");

async function screen() {
  const dumpFile = "/sdcard/workers-embedding.xml";
  for (let attempt = 0; attempt < 3; attempt++) {
    // A killed dumper may leave a completed file; never read a previous attempt.
    adb("shell", "rm", "-f", dumpFile);
    try {
      adb("shell", "uiautomator", "dump", dumpFile);
    } catch (error) {
      if (error.status !== 137 || attempt === 2) throw error;
      await delay(300 * (attempt + 1));
      continue;
    }
    return adb("exec-out", "cat", dumpFile);
  }
}
function labelledNode(xml, text) {
  return [...xml.matchAll(/<node\b[^>]*>/g)].find(([tag]) =>
    ["text", "content-desc"].some((attribute) =>
      tag.includes(`${attribute}="${text}"`),
    ),
  )?.[0];
}
async function waitFor(text, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let xml = "";
  while (Date.now() < deadline) {
    xml = await screen();
    if (labelledNode(xml, text)) return xml;
    await delay(300);
  }
  await writeFile(path.join(artifacts, "failure.xml"), xml);
  throw new Error(`Screen did not contain ${text}`);
}
async function tap(text) {
  const xml = await waitFor(text);
  const node = labelledNode(xml, text);
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error(`No bounds for ${text}`);
  adb(
    "shell",
    "input",
    "tap",
    String(Math.floor((+bounds[1] + +bounds[3]) / 2)),
    String(Math.floor((+bounds[2] + +bounds[4]) / 2)),
  );
}
async function crashRenderer() {
  const pid = adb("shell", "pidof", "probe.workersembed").trim();
  const port = adb(
    "forward",
    "tcp:0",
    `localabstract:webview_devtools_remote_${pid}`,
  ).trim();
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const target = targets.find(
      (page) =>
        page.type === "page" && page.url === "https://workers-sdk.local/",
    );
    if (!target) throw new Error("No SDK document debug target");
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Renderer did not crash"));
      }, 10_000);
      const done = () => {
        clearTimeout(timer);
        socket.close();
        resolve();
      };
      socket.addEventListener("open", () =>
        socket.send(JSON.stringify({ id: 1, method: "Page.crash" })),
      );
      socket.addEventListener("close", done, { once: true });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Inspector.targetCrashed") done();
        else if (message.id === 1 && message.error) {
          clearTimeout(timer);
          socket.close();
          reject(new Error(JSON.stringify(message.error)));
        }
      });
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("Debugger connection failed"));
        },
        { once: true },
      );
    });
  } finally {
    adb("forward", "--remove", `tcp:${port}`);
  }
}
const autoRotate = adb(
  "shell",
  "settings",
  "get",
  "system",
  "accelerometer_rotation",
).trim();
const rotation = adb(
  "shell",
  "settings",
  "get",
  "system",
  "user_rotation",
).trim();
try {
  await waitFor("Native host visits 0");
  await waitFor("Host service worker host-sw-retained");
  await tap("Open Worker");
  await waitFor("Worker Home");
  // Healthy ready must cancel the native 30-second startup deadline.
  await delay(35_000);
  await waitFor("Worker Home");
  if (
    !adb("logcat", "-d", "-s", "HostIsolation:I", "*:S").includes(
      "Host SW result during SDK open: host-sw-retained",
    )
  )
    throw new Error("Host service-worker routing failed while SDK was open");
  await tap("Next");
  await waitFor("Worker Next");
  await tap("Submit");
  await waitFor("Posted verified");
  adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb("shell", "settings", "put", "system", "user_rotation", "1");
  await delay(1500);
  await waitFor("Posted verified");
  adb("shell", "input", "keyevent", "4");
  await waitFor("Native host visits 1");
  await tap("Verify host isolation");
  const isolationScreen = await screen();
  await writeFile(path.join(artifacts, "host-isolation.xml"), isolationScreen);
  await writeFile(
    path.join(artifacts, "host-isolation.log"),
    adb("logcat", "-d", "-s", "HostIsolation:I", "*:S"),
  );
  if (
    !isolationScreen.includes(
      'text="Host isolation session=true persistent=true handler=true"',
    )
  )
    throw new Error(
      "SDK open/close changed host cookies or process CookieHandler; see host-isolation.log",
    );
  await tap("Verify host service worker");
  await waitFor("Host service worker host-sw-retained");
  await tap("Open Worker");
  await waitFor("Worker Home");
  adb("shell", "input", "keyevent", "4");
  await waitFor("Native host visits 2");
  await tap("Open failed Worker");
  // Failure must return without user Back and release the singleton for retry.
  await waitFor("Native host visits 3");
  let log = "";
  const failureDeadline = Date.now() + 30_000;
  while (Date.now() < failureDeadline) {
    log = adb("logcat", "-d", "-s", "WorkersNative:E");
    if (log.includes("Native embedding startup failure probe")) break;
    await delay(300);
  }
  if (!log.includes("Native embedding startup failure probe"))
    throw new Error(`Expected SDK startup failure notification:\n${log}`);
  await tap("Open Worker");
  await waitFor("Worker Home");
  await crashRenderer();
  await waitFor("Native host visits 4");
  await tap("Open Worker");
  await waitFor("Worker Home");
  adb("shell", "input", "keyevent", "4");
  await waitFor("Native host visits 5");
  const lifecycleLog = () =>
    adb("logcat", "-d", "-s", "HostIsolation:I", "*:S");
  const createdBefore = (lifecycleLog().match(/SDK Activity created /g) ?? [])
    .length;
  await tap("Recreate Worker");
  const recreateDeadline = Date.now() + 30_000;
  while (
    !adb("logcat", "-d", "-s", "HostIsolation:I", "*:S").includes(
      "Recreating SDK Activity",
    )
  ) {
    if (Date.now() > recreateDeadline)
      throw new Error("SDK Activity recreation not triggered");
    await delay(300);
  }
  while (
    (lifecycleLog().match(/SDK Activity created /g) ?? []).length <
    createdBefore + 2
  ) {
    if (Date.now() > recreateDeadline)
      throw new Error("SDK Activity was not recreated");
    await delay(300);
  }
  await waitFor("Worker Home");
  await tap("Next");
  await waitFor("Worker Next");
  await tap("Submit");
  await waitFor("Posted verified");
  adb("shell", "input", "keyevent", "4");
  await waitFor("Native host visits 6");
  await tap("Open broken Worker");
  await waitFor("Native host visits 7", 60_000);
  if (
    !adb("logcat", "-d", "-s", "WorkersNative:E").includes(
      "Runtime startup timed out before ready",
    )
  )
    throw new Error(
      "Missing JavaScript entry did not report the native startup deadline",
    );
  // A deadline failure must also release the runtime so a normal open works.
  await tap("Open Worker");
  await waitFor("Worker Home");
  adb("shell", "input", "keyevent", "4");
  await waitFor("Native host visits 8");
  await tap("Verify host isolation");
  await waitFor("Host isolation session=true persistent=true handler=true");
  await tap("Verify host service worker");
  await waitFor("Host service worker host-sw-retained");
  await writeFile(path.join(artifacts, "passed.xml"), await screen());
  await writeFile(
    path.join(artifacts, "passed.png"),
    run("adb", ["-s", device, "exec-out", "screencap", "-p"], {
      encoding: null,
    }),
  );
  console.log(
    "PASS Maven consumer: navigation, POST, rotation, close/reopen, startup failure, renderer loss, Activity recreation, broken entry, cookies, CookieHandler and host service-worker routing",
  );
} finally {
  for (const [name, value] of [
    ["accelerometer_rotation", autoRotate],
    ["user_rotation", rotation],
  ]) {
    if (value === "null") adb("shell", "settings", "delete", "system", name);
    else adb("shell", "settings", "put", "system", name, value);
  }
  await writeFile(path.join(artifacts, "runtime.log"), adb("logcat", "-d"));
  await writeFile(
    path.join(artifacts, "host-isolation.log"),
    adb("logcat", "-d", "-s", "HostIsolation:I", "*:S"),
  );
}
