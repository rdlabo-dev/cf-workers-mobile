import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
import { Capacitor } from "@capacitor/core";
import settings from "./server.json";
const platform = Capacitor.getPlatform();
const origin = `https://${platform === "android" ? "10.0.2.2" : "127.0.0.1"}:${settings.port}`;
const original = fetch.bind(globalThis),
  cases = [];
function check(name, value) {
  cases.push({ name, passed: !!value });
  if (!value) throw new Error(name);
}
try {
  for (const prefer of ["direct", "worker"]) {
    let token = "test-owner";
    const key = `${platform}-${prefer}-${Date.now()}`;
    const runtime = capacitorWorkers({
      baseURL: "https://local.invalid",
      prefer,
      remote: { origin, getToken: () => token, maxBufferedBodyBytes: 1024 },
    });
    try {
      await runtime.ready;
      check(`${prefer}:execution`, runtime.execution === prefer);
      check(
        `${prefer}:remote KV-only write`,
        (
          await fetch(`/shared/${key}`, {
            method: "PUT",
            body: "remote-config",
          })
        ).status === 204,
      );
      check(
        `${prefer}:remote KV-only read`,
        (await (await fetch(`/shared/${key}`)).text()) === "remote-config",
      );
      check(`${prefer}:local`, (await (await fetch("/health")).json()).local);
      check(
        `${prefer}:R2 put`,
        (await fetch(`/api/objects/${key}`, { method: "PUT", body: "abcdef" }))
          .status === 201,
      );
      check(
        `${prefer}:R2 get`,
        (await (await fetch(`/api/objects/${key}`)).text()) === "abcdef",
      );
      const head = await fetch(`/api/objects/${key}`, { method: "HEAD" });
      check(
        `${prefer}:HEAD`,
        head.status === 200 && (await head.text()) === "",
      );
      const range = await fetch(`/api/objects/${key}?offset=1`);
      check(
        `${prefer}:range`,
        range.status === 206 && (await range.text()) === "bcd",
      );
      check(
        `${prefer}:KV put`,
        (await fetch(`/api/kv/${key}`, { method: "PUT", body: "value" }))
          .status === 204,
      );
      const kv = await (await fetch(`/api/kv/${key}`)).json();
      check(
        `${prefer}:KV metadata`,
        kv.value === "value" && kv.metadata.owner === "test-owner",
      );
      const service = await (await fetch("/api/service")).json();
      check(
        `${prefer}:HTTP/RPC`,
        service.http === "internal-worker-result" && service.rpc === 5,
      );
      const queued = await fetch(`/api/jobs/${key}`, { method: "POST" });
      let delivered = false;
      for (let i = 0; i < 100; i++) {
        const single = await (
          await original(`${origin}/__queue/${key}`)
        ).json();
        const batch = await (
          await original(`${origin}/__queue/${key}-batch`)
        ).json();
        if (single && batch) {
          delivered = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      check(
        `${prefer}:queue send/batch delivery`,
        queued.status === 202 && delivered,
      );
      let limited = false;
      try {
        await fetch(`/api/objects/${key}-large`, {
          method: "PUT",
          body: "x".repeat(1025),
        });
      } catch (e) {
        limited = e.name === "RangeError";
      }
      check(
        `${prefer}:upload limit`,
        limited && (await fetch(`/api/objects/${key}-large`)).status === 404,
      );
      token = undefined;
      check(
        `${prefer}:unauthorized`,
        (
          await fetch(`/api/objects/${key}`, {
            method: "PUT",
            body: "overwrite",
          })
        ).status === 401,
      );
      token = "test-owner";
      const intact = await (await fetch(`/api/objects/${key}`)).text();
      const deleted = await fetch(`/api/objects/${key}`, { method: "DELETE" });
      check(
        `${prefer}:delete and protected write`,
        intact === "abcdef" &&
          deleted.status === 204 &&
          (await deleted.text()) === "",
      );
    } finally {
      await runtime.dispose();
    }
  }
  // Same binding name, separate device/cloud state; remote wins per request.
  const key = `${platform}-local-${Date.now()}`;
  const runtime = capacitorWorkers({
    baseURL: "https://local.invalid",
    prefer: "worker",
    env: { CLOUD_KV: new LocalStorageKV("services-native").create() },
    remote: { origin, getToken: () => "test-owner" },
  });
  try {
    await runtime.ready;
    check("local KV uses direct execution", runtime.execution === "direct");
    await fetch(`/settings/${key}`, { method: "PUT", body: "device" });
    check(
      "local KV roundtrip",
      (await (await fetch(`/settings/${key}`)).text()) === "device",
    );
    await fetch(`/api/objects/${key}`, { method: "PUT", body: "object" });
    await fetch(`/api/kv/${key}`, { method: "PUT", body: "cloud" });
    check(
      "mixed R2/KV uses cloud",
      (await (await fetch(`/api/kv/${key}`)).json()).value === "cloud",
    );
    check(
      "remote KV leaves device KV intact",
      (await (await fetch(`/settings/${key}`)).text()) === "device",
    );
  } finally {
    await runtime.dispose();
  }
} catch (e) {
  cases.push({
    name: "unexpected",
    passed: false,
    error: String(e),
    stack: e.stack,
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
