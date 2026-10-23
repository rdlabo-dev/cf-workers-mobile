import {
  observeEvents,
  expectedEvents,
} from "../../../../src/compat/events/observations.spec.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Pinned Workers observations for the scoped WebView events adapter.
// In particular, do not mistake Node's native EventTarget introspection for the
// behavior of the pinned Workers profile.
test("pin events behavior before implementing missing exports", async () => {
  const require = createRequire(import.meta.url);
  const mfRequire = createRequire(require.resolve("miniflare/package.json"));
  const version = JSON.parse(
    await readFile(mfRequire.resolve("workerd/package.json"), "utf8"),
  ).version;
  assert.equal(version, "1.20261012.1");
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-17",
      script: `import * as events from 'node:events';
import { AsyncLocalStorage } from 'node:async_hooks';
export default { async fetch() { return Response.json(await (${observeEvents.toString()})(events, AsyncLocalStorage)); }};`,
    }),
  );
  try {
    const response = await runtime.dispatchFetch(
      "https://events-baseline.invalid/",
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, expectedEvents);
    const output = new URL(
      "../../../artifacts/node-inventory/",
      import.meta.url,
    );
    await mkdir(output, { recursive: true });
    await writeFile(
      new URL("events-baseline.json", output),
      JSON.stringify(
        {
          profile: { workerd: version, compatibilityDate: "2026-10-17" },
          result,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await runtime.dispose();
  }
});
