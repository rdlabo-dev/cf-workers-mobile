import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

// Run after assembling/installing the Debug comparator app. This deliberately
// reconnects UiAutomation for every dump; DOM reads are a separate diagnostic.
const [device, mode = "sdk", count = "10"] = process.argv.slice(2);
if (
  !device?.startsWith("emulator-") ||
  !["sdk", "default", "profile"].includes(mode)
)
  throw new Error(
    "Usage: node accessibility-run.mjs emulator-ID sdk|default|profile [rounds]",
  );
const rounds = Number(count);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100)
  throw new Error("Invalid rounds");
const connection = process.argv.includes("--persistent")
  ? "persistent"
  : "stateless";
const output = path.resolve(
  process.env.WORKERS_A11Y_OUTPUT ||
    `artifacts/android-accessibility/${connection}-${mode}`,
);
await mkdir(output, { recursive: true });
const adb = (...args) =>
  execFileSync("adb", ["-s", device, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
if (connection === "persistent") {
  const log = execFileSync(
    "adb",
    [
      "-s",
      device,
      "shell",
      "am",
      "instrument",
      "-w",
      "-e",
      "mode",
      mode,
      "-e",
      "rounds",
      String(rounds),
      "probe.workersembed.test/probe.AccessibilityProbe",
    ],
    { encoding: "utf8", timeout: 180000 },
  );
  await writeFile(path.join(output, "run.log"), log);
  await writeFile(
    path.join(output, "webview.txt"),
    adb("shell", "dumpsys", "webviewupdate"),
  );
  console.log(log);
  const passed = log
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line))
    .some(
      (result) =>
        result.mode === mode &&
        result.status === "passed" &&
        result.rounds === rounds,
    );
  if (!passed) {
    for (const name of [
      "accessibility-failure.json",
      "accessibility-failure-dom.json",
      "accessibility-failure.png",
    ]) {
      const data = execFileSync("adb", [
        "-s",
        device,
        "exec-out",
        "run-as",
        "probe.workersembed",
        "cat",
        `files/${name}`,
      ]);
      if (name.endsWith(".json")) JSON.parse(data.toString());
      else if (
        !data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw new Error("Invalid screenshot evidence");
      await writeFile(path.join(output, name), data);
    }
  }
  process.exit(passed ? 0 : 1);
}
async function dump(label) {
  const file = `/sdcard/workers-a11y-${label}.xml`;
  adb("shell", "rm", "-f", file);
  const log = adb("shell", "uiautomator", "dump", file);
  if (!log.includes("dumped to:"))
    throw new Error(`UIAutomator failed: ${log}`);
  const xml = adb("exec-out", "cat", file);
  await writeFile(path.join(output, `${label}.xml`), xml);
  return xml;
}
adb("shell", "am", "force-stop", "probe.workersembed");
adb("logcat", "-c");
adb(
  "shell",
  "am",
  "start",
  "-W",
  "-n",
  `probe.workersembed/probe.${mode === "sdk" ? "Launcher" : "WebViewControl"}`,
  "--ez",
  "profile",
  String(mode === "profile"),
);
if (mode === "sdk") {
  let button;
  for (let i = 0; i < 10 && !button; i++) {
    const xml = await dump(`host-${i}`);
    button = [...xml.matchAll(/<node\b[^>]*>/g)].find(([node]) =>
      node.includes('text="Open Worker"'),
    )?.[0];
  }
  const bounds = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error("No native Open Worker button");
  adb(
    "shell",
    "input",
    "tap",
    String((+bounds[1] + +bounds[3]) / 2),
    String((+bounds[2] + +bounds[4]) / 2),
  );
}
const pid = adb("shell", "pidof", "probe.workersembed").trim();
const port = adb(
  "forward",
  "tcp:0",
  `localabstract:webview_devtools_remote_${pid}`,
).trim();
async function evaluate(expression) {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json`, {
      signal: AbortSignal.timeout(3000),
    })
  ).json();
  const target = targets.find(
    (t) =>
      t.type === "page" &&
      (t.url.startsWith("https://control.invalid/") ||
        t.url.startsWith("https://workers-sdk.local/")) &&
      !t.url.includes("__workers_capacitor_host"),
  );
  if (!target) return null;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("CDP timeout"));
    }, 5000);
    socket.onopen = () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id === 1) {
        clearTimeout(timer);
        socket.close();
        if (message.error || message.result?.exceptionDetails)
          reject(new Error(JSON.stringify(message)));
        else resolve(message.result?.result?.value);
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("CDP connection failed"));
    };
  });
}
async function awaitHeading(expected) {
  for (let i = 0; i < 100; i++) {
    let actual;
    try {
      actual = await evaluate("document.querySelector('h1')?.textContent");
    } catch {
      await delay(100);
      continue;
    }
    if (actual === expected) return;
    await delay(100);
  }
  throw new Error(`DOM heading missing: ${expected}`);
}
const results = [];
try {
  await awaitHeading("Worker Home");
  for (let round = 0; round < rounds; round++) {
    for (const [action, expected] of [
      ["document.querySelector('a').click()", "Worker Next"],
      ["document.querySelector('form').requestSubmit()", "Posted verified"],
    ]) {
      await evaluate(action);
      await awaitHeading(expected);
      const label = `${round}-${expected.split(" ")[0]}`;
      const xml = await dump(label);
      const visible = xml.includes(`text="${expected}"`);
      const result = {
        round,
        expected,
        domPresent: true,
        accessibilityPresent: visible,
        retries: [],
      };
      if (!visible) {
        await writeFile(
          path.join(output, `${label}.png`),
          execFileSync("adb", ["-s", device, "exec-out", "screencap", "-p"]),
        );
        for (let retry = 0; retry < 3; retry++) {
          const recovered = (await dump(`${label}-retry-${retry}`)).includes(
            `text="${expected}"`,
          );
          result.retries.push(recovered);
          if (recovered) break;
        }
      }
      results.push(result);
      console.log(JSON.stringify(result));
      await writeFile(
        path.join(output, "results.json"),
        JSON.stringify(results, null, 2),
      );
    }
  }
} finally {
  adb("forward", "--remove", `tcp:${port}`);
  await writeFile(path.join(output, "runtime.log"), adb("logcat", "-d"));
  await writeFile(
    path.join(output, "webview.txt"),
    adb("shell", "dumpsys", "webviewupdate"),
  );
}
console.log(
  JSON.stringify({
    mode,
    observations: results.length,
    missing: results.filter((r) => !r.accessibilityPresent).length,
  }),
);

if (results.some((result) => !result.accessibilityPresent))
  process.exitCode = 1;
