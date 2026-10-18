import { writeFile } from "node:fs/promises";
const framework = process.argv[2];
const tabs = await (await fetch("http://127.0.0.1:9227/json")).json();
const tab = tabs.find((t) => t.url.includes("/pages/"));
if (!tab) throw new Error("No document WebView");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let serial = 0;
async function call(method, params) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP timeout")), 10000);
    const listener = (e) => {
      const r = JSON.parse(e.data);
      if (r.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener("message", listener);
        r.error ? reject(r.error) : resolve(r.result);
      }
    };
    ws.addEventListener("message", listener);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
try {
  let state, report;
  for (let i = 0; i < 60; i++) {
    const value = await call("Runtime.evaluate", {
      expression:
        'JSON.stringify({url:location.href,report:localStorage.getItem("native-document-result"),visible:!!document.querySelector("#native-document-report")})',
      returnByValue: true,
    });
    state = JSON.parse(value.result.value);
    report = JSON.parse(state.report);
    if (state.visible && report) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (
    !state.visible ||
    report?.framework?.toLowerCase() !== framework ||
    !report.cases.every((c) => c.passed)
  )
    throw new Error(JSON.stringify(state));
  const prefix =
    new URL("../../artifacts/plugin-documents-", import.meta.url).pathname +
    framework +
    "-android";
  await writeFile(prefix + ".json", JSON.stringify(report, null, 2));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(prefix + ".png", Buffer.from(shot.data, "base64"));
  if (report.cases.length !== 50) throw new Error("Expected 50 checks");
  console.log(framework + ": 50/50 native checks passed");
  if (process.argv.includes("--lifecycle")) {
    const { build } = await import("esbuild");
    const bundle = await build({
      entryPoints: [
        new URL("../../../dist/index.js", import.meta.url).pathname,
      ],
      bundle: true,
      format: "iife",
      globalName: "DocumentLifecycleTest",
      write: false,
    });
    const loaded = await call("Runtime.evaluate", {
      expression: bundle.outputFiles[0].text,
    });
    if (loaded.exceptionDetails)
      throw new Error("Failed to load lifecycle probe");
    const checked = await call("Runtime.evaluate", {
      expression: `(async () => {
        const before = await navigator.serviceWorker.getRegistrations();
        const hadDocumentRegistration = before.some(r => [r.active,r.waiting,r.installing].some(w => w && new URL(w.scriptURL).pathname === "/workers-capacitor-sw.js"));
        const app = DocumentLifecycleTest.workersCapacitor({
          baseURL: "https://worker.invalid/api",
          worker: {fetch: () => new Response("fetch-only")},
        });
        try {
          await app.ready;
          const response = await fetch("/unlisted-lifecycle-check.html");
          const text = await response.text();
          const registrations = await navigator.serviceWorker.getRegistrations();
          return {hadDocumentRegistration, controlled: !!navigator.serviceWorker.controller,
            documentRegistrations: registrations.filter(r => [r.active,r.waiting,r.installing].some(w => w && new URL(w.scriptURL).pathname === "/workers-capacitor-sw.js")).length,
            nativeAssetFallback: response.status === 404 && text === "",
            nativeStatus: response.status, nativeBody: text,
            api: await (await fetch("/api/check")).text()};
        } finally {
          await app.dispose();
          await Capacitor.nativePromise("WorkersCapacitor", "stop", {});
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = checked.result?.value;
    if (
      checked.exceptionDetails ||
      !result?.hadDocumentRegistration ||
      !result.controlled ||
      result.documentRegistrations !== 0 ||
      !result.nativeAssetFallback ||
      result.api !== "fetch-only"
    )
      throw new Error("Native lifecycle: " + JSON.stringify(checked));
    await writeFile(
      prefix + "-lifecycle.json",
      JSON.stringify(result, null, 2),
    );
    console.log(
      framework +
        ": native Fetch-only migration, current-client passthrough and registration cleanup passed",
    );
  }
  if (process.argv.includes("--cleanup")) {
    const cleanup = await call("Runtime.evaluate", {
      expression:
        "navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))",
      awaitPromise: true,
      returnByValue: true,
    });
    if (cleanup.exceptionDetails)
      throw new Error("Service Worker cleanup failed");
  }
} finally {
  ws.close();
}
