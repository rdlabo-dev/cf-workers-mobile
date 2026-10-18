import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
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
      "src/compat/cloudflare-node/index.spec.ts",
      "src/compat/globals/index.spec.ts",
      "src/compat/globals/web.spec.ts",
      "src/compat/abort/installation.spec.ts",
      "src/compat/buffer/installation.spec.ts",
      "src/compat/timers/installation.spec.ts",
      "src/compat/url/installation.spec.ts",
      "src/compat/url/interop.spec.ts",
      "src/compat/timers/host.spec.ts",
      "src/compat/async-hooks/callbacks.spec.ts",
      "src/compat/response/installation.spec.ts",
      "src/compat/brotli/index.spec.ts",
      "src/compat/fetch/index.spec.ts",
      "src/compat/fetch/interop.spec.ts",
      "src/compat/fetch/native-network.spec.ts",
      "src/compat/fetch/scope.spec.ts",
      "src/compat/net/sockets.spec.ts",
      "src/compat/http-wire/index.spec.ts",
    ],
  },
});
