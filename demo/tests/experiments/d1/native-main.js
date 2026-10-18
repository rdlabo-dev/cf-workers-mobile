import { capacitorWorkers } from "@rdlabo/capacitor-workers";
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
    let token = "test-alice";
    const runtime = capacitorWorkers({
      baseURL: "https://local.invalid/",
      prefer,
      remote: { origin, getToken: () => token },
    });
    try {
      await runtime.ready;
      check(`${prefer}: execution`, runtime.execution === prefer);
      check(
        `${prefer}: local HTML`,
        (await (await fetch("/")).text()).includes("Existing Worker UI"),
      );
      check(
        `${prefer}: local JSON`,
        (await (await fetch("/health")).json()).ok === true,
      );
      const before = await fetch("/api/counters/alice");
      const value = (await before.json()).value;
      const after = await fetch("/api/counters/alice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ increment: 5 }),
      });
      check(
        `${prefer}: D1 write`,
        after.status === 201 && (await after.json()).value === value + 5,
      );
      check(
        `${prefer}: no replay`,
        Number(after.headers.get("x-effect-total")) ===
          Number(before.headers.get("x-effect-total")) + 1,
      );
      check(
        `${prefer}: owner authorization`,
        (await fetch("/api/counters/bob")).status === 401,
      );
      token = undefined;
      check(
        `${prefer}: expired session`,
        (
          await fetch("/api/counters/alice", {
            method: "POST",
            body: '{"increment":99}',
          })
        ).status === 401,
      );
      token = "test-alice";
      const head = await fetch("/api/counters/alice", { method: "HEAD" });
      check(
        `${prefer}: HEAD`,
        head.status === 200 && (await head.text()) === "",
      );
      const abort = new AbortController();
      const pending = fetch("/api/slow", { signal: abort.signal }).then(
        () => false,
        (error) => error.name === "AbortError",
      );
      setTimeout(() => abort.abort(), 50);
      check(`${prefer}: abort`, await pending);
      const closing = fetch("/api/slow").then(
        () => false,
        (error) => String(error).includes("disposed"),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await runtime.dispose();
      check(`${prefer}: dispose pending request`, await closing);
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
