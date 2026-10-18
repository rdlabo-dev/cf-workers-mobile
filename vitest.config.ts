import { lowerAsync } from "./src/build/async.js";
import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    {
      name: "test-async-context",
      enforce: "post",
      transform(code, id) {
        if (/\.[cm]?[jt]sx?$/.test(id)) return lowerAsync(code, id);
      },
    },
    {
      name: "test-brotli-binary",
      async load(id) {
        if (!id.endsWith("/brotli_dec_wasm_bg.wasm")) return;
        const data = (await readFile(id)).toString("base64");
        return `export default Uint8Array.from(atob(${JSON.stringify(data)}), c => c.charCodeAt(0));`;
      },
    },
  ],
  test: {
    server: { deps: { inline: [/brotli-dec-wasm/] } },
    // Node module contract specs run via demo tests in workerd and WebViews.
    include: [
      "tests/unit/**/*.test.ts",
      "src/workers/cloudflare-node/index.spec.ts",
      "src/shared/globals/index.spec.ts",
      "src/shared/globals/web.spec.ts",
      "src/browser/abort/installation.spec.ts",
      "src/compat/buffer/installation.spec.ts",
      "src/compat/timers/installation.spec.ts",
      "src/compat/url/installation.spec.ts",
      "src/compat/url/interop.spec.ts",
      "src/compat/timers/host.spec.ts",
      "src/compat/async-hooks/callbacks.spec.ts",
      "src/browser/response/installation.spec.ts",
      "src/compat/perf-hooks/installation.spec.ts",
      "src/compat/stream-web/installation.spec.ts",
      "src/compat/stream-web/context.spec.ts",
      "src/shared/brotli/index.spec.ts",
      "src/browser/fetch/index.spec.ts",
      "src/browser/fetch/interop.spec.ts",
      "src/browser/fetch/native-network.spec.ts",
      "src/browser/fetch/scope.spec.ts",
      "src/compat/net/sockets.spec.ts",
      "src/shared/http-wire/index.spec.ts",
    ],
  },
});
