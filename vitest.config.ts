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
      "src/compat/workers/cloudflare-node/index.spec.ts",
      "src/compat/shared/globals/index.spec.ts",
      "src/compat/shared/globals/web.spec.ts",
      "src/compat/web/abort/installation.spec.ts",
      "src/compat/node/buffer/installation.spec.ts",
      "src/compat/node/timers/installation.spec.ts",
      "src/compat/node/timers/host.spec.ts",
      "src/compat/node/async-hooks/callbacks.spec.ts",
      "src/compat/web/response/installation.spec.ts",
      "src/compat/shared/brotli/index.spec.ts",
      "src/compat/web/fetch/index.spec.ts",
      "src/compat/web/fetch/interop.spec.ts",
      "src/compat/web/fetch/native-network.spec.ts",
      "src/compat/web/fetch/scope.spec.ts",
      "src/compat/node/net/sockets.spec.ts",
      "src/compat/shared/http-wire/index.spec.ts",
    ],
  },
});
