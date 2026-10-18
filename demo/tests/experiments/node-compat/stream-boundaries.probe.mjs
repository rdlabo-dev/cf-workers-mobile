import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Counterexamples to forwarding host stream constructors as a complete Workers
// adapter. Keep these outside acceptance contracts until the differences are
// implemented. Pending abort is observed with real I/O, then released so the
// experiment itself never depends on a permanently unresolved pipe promise.
async function probe() {
  let teeReason;
  const [a, b] = new ReadableStream({
    cancel(reason) {
      teeReason = reason;
    },
  }).tee();
  await Promise.all([a.cancel("first"), b.cancel("last")]);
  let sourceController;
  let canceled = false,
    aborted = false,
    settled = false,
    rejection;
  const source = new ReadableStream({
    start(c) {
      sourceController = c;
    },
    cancel() {
      canceled = true;
    },
  });
  const sink = new WritableStream({
    abort() {
      aborted = true;
    },
  });
  const signal = new AbortController();
  const piping = source.pipeTo(sink, { signal: signal.signal }).then(
    () => {
      settled = true;
    },
    (error) => {
      settled = true;
      rejection = error;
    },
  );
  signal.abort("stop");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const beforeInput = { settled, canceled, aborted };
  if (!settled) sourceController.enqueue(1);
  await piping;
  return {
    teeReason,
    beforeInput,
    afterInput: { settled, canceled, aborted, rejection },
  };
}
const artifacts = new URL(
  "../../../artifacts/node-inventory/",
  import.meta.url,
);
async function record(name, result) {
  await mkdir(artifacts, { recursive: true });
  await writeFile(
    new URL(`${name}-streams.json`, artifacts),
    JSON.stringify(result, null, 2) + "\n",
  );
}
const afterInput = {
  settled: true,
  canceled: true,
  aborted: true,
  rejection: "stop",
};
test("pinned Workers stream cancellation semantics", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-17",
      script: `import {ReadableStream,WritableStream} from 'node:stream/web'; const probe=${probe.toString()}; export default {async fetch(){return Response.json(await probe());}};`,
    }),
  );
  try {
    const response = await runtime.dispatchFetch("https://streams.invalid/");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, {
      teeReason: "last",
      beforeInput: { settled: false, canceled: false, aborted: false },
      afterInput,
    });
    await record("workerd", result);
  } finally {
    await runtime.dispose();
  }
});
for (const [name, type] of Object.entries({ chromium, webkit })) {
  test(`${name}: host forwarding differs from the Workers contract`, async () => {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      const result = await page.evaluate(probe);
      assert.deepEqual(result, {
        teeReason: ["first", "last"],
        beforeInput: { settled: true, canceled: true, aborted: true },
        afterInput,
      });
      await record(name, result);
    } finally {
      await browser.close();
    }
  });
}
