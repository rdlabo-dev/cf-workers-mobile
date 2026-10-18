import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Native port timing and synthetic-event branding are independent constraints.
// This does not waive unfinished behavior in the JS port adapter.
async function probe() {
  const channel = new MessageChannel();
  const order = [];
  let trusted;
  const received = new Promise((resolve) => {
    channel.port2.onmessage = (event) => {
      order.push("message");
      trusted = event.isTrusted;
      resolve();
    };
  });
  channel.port1.postMessage("test");
  queueMicrotask(() => order.push("microtask"));
  await received;
  channel.port1.close();
  channel.port2.close();
  const synthetic = new MessageEvent("message");
  let canRedefine = false;
  try {
    Object.defineProperty(synthetic, "isTrusted", { value: true });
    canRedefine = true;
  } catch {}
  return { order, trusted, syntheticTrusted: synthetic.isTrusted, canRedefine };
}
const artifacts = new URL(
  "../../../artifacts/node-inventory/",
  import.meta.url,
);
async function record(name, result) {
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    new URL(`${name}-message-ports.json`, artifacts),
    JSON.stringify(result, null, 2) + "\n",
  );
}
test("pinned Workers delivers trusted port events on microtasks", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-17",
      script: `export default {async fetch(){return Response.json(await (${probe})());}};`,
    }),
  );
  try {
    const response = await runtime.dispatchFetch("https://ports.invalid/");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.order, ["message", "microtask"]);
    assert.equal(result.trusted, true);
    await record("workerd", result);
  } finally {
    await runtime.dispose();
  }
});
for (const [name, type] of Object.entries({ chromium, webkit })) {
  test(`${name}: native ports and synthetic events have different limits`, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const result = await page.evaluate(probe);
      assert.deepEqual(result, {
        order: ["microtask", "message"],
        trusted: true,
        syntheticTrusted: false,
        canRedefine: false,
      });
      await record(name, result);
    } finally {
      await browser.close();
    }
  });
}
