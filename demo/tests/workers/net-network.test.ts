import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { createNetworkFixture } from "../fixtures/network/server.mjs";
const server = createNetworkFixture();
let harness: Miniflare;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  const bundle = await build({
    entryPoints: ["tests/fixtures/workers/compatibility/net.ts"],
    external: ["brotli-dec-wasm/web/bg.wasm", "node:*", "cloudflare:node"],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
  });
  // Use workerd's own outbound HTTP. Wrangler's harness forwards through
  // Node fetch, which follows redirects and decompresses before workerd sees it.
  harness = new Miniflare({
    workers: [
      {
        config: {
          name: "fetch-policy-compat",
          compatibilityDate: "2026-10-17",
          compatibilityFlags: ["nodejs_compat"],
          manifest: {
            mainModule: "worker.js",
            modules: {
              "worker.js": {
                type: "esm",
                contents: bundle.outputFiles[0].text,
              },
            },
          },
          env: {
            UPSTREAM: {
              type: "text",
              value: `http://127.0.0.1:${address.port}`,
            },
          },
        },
      },
    ],
  });
  await harness.ready;
});
afterAll(async () => {
  await harness?.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("runs the same TCP contract in workerd", async () => {
  const response = await harness.dispatchFetch("http://localhost/network");
  expect(await response.text()).toBe("ok");
});
