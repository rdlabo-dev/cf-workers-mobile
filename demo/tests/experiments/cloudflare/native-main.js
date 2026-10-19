import { workersCapacitor } from "workers-capacitor";
import { Capacitor } from "@capacitor/core";
import settings from "./server.json";
const platform = Capacitor.getPlatform();
const origin = `https://${platform === "android" ? "10.0.2.2" : "127.0.0.1"}:${settings.port}`;
const original = fetch.bind(globalThis);
const cases = [];
function check(name, condition) {
  cases.push({ name, passed: !!condition });
  if (!condition) throw new Error(name);
}
try {
  for (const prefer of ["direct", "worker"]) {
    let token = "owner";
    const key = `${platform}-${prefer}-${Date.now()}`;
    const runtime = workersCapacitor({
      baseURL: "https://local.invalid",
      prefer,
      remote: { origin, getToken: () => token },
    });
    try {
      await runtime.ready;
      check(`${prefer}:execution`, runtime.execution === prefer);
      check(
        `${prefer}:local health`,
        (await (await fetch("/health")).text()) === "local-health",
      );
      check(
        `${prefer}:ASSETS`,
        (await (await fetch("/assets")).text()) === "cloud-assets",
      );
      check(
        `${prefer}:ASSETS SPA`,
        (await (await fetch("/spa/deep/route")).text()) === "cloud-assets",
      );
      const head = await fetch("/assets", { method: "HEAD" });
      check(
        `${prefer}:ASSETS HEAD`,
        head.status === 200 && (await head.text()) === "",
      );
      const asset = await fetch("/assets");
      const etag = asset.headers.get("etag");
      await asset.text();
      const conditional = await fetch("/assets", {
        headers: { "if-none-match": etag },
      });
      check(
        `${prefer}:ASSETS conditional304`,
        !!etag &&
          conditional.status === 304 &&
          (await conditional.text()) === "",
      );
      const oracleRange = await original(`${origin}/assets?range=${key}`, {
        headers: { range: "bytes=0-4" },
      });
      const range = await fetch(`/assets?range=${key}`, {
        headers: { range: "bytes=0-4" },
      });
      check(
        `${prefer}:ASSETS range preserves server`,
        range.status === oracleRange.status &&
          (await range.text()) === (await oracleRange.text()),
      );
      const initial = await (await fetch(`/counter/${key}`)).json();
      check(`${prefer}:DO HTTP initial`, initial.count === 0);
      const updated = await (
        await fetch(`/counter/${key}`, { method: "POST" })
      ).json();
      check(
        `${prefer}:DO RPC write`,
        updated.count === 1 && updated.marker === "private-do-operation",
      );
      check(
        `${prefer}:DO HTTP read`,
        (await (await fetch(`/counter/${key}`)).json()).count === 1,
      );
      token = undefined;
      check(
        `${prefer}:unauthorized write`,
        (await fetch(`/counter/${key}`, { method: "POST" })).status === 401,
      );
      token = "owner";
      check(
        `${prefer}:DO protected state`,
        (await (await fetch(`/counter/${key}`)).json()).count === 1,
      );
    } finally {
      await runtime.dispose();
    }
  }
} catch (error) {
  cases.push({
    name: "unexpected",
    passed: false,
    error: String(error),
    stack: error.stack,
  });
}
const result = { platform, cases };
document.body.textContent = JSON.stringify(result, null, 2);
console.log("D1_NATIVE_RESULT", JSON.stringify(result));
await original(origin + "/__report", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(result),
}).catch(console.error);
