import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "@rdlabo/workers-capacitor/vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    {
      name: "brotli-wasm-binary",
      async load(id) {
        if (!id.includes("brotli_dec_wasm_bg.wasm")) return;
        const data = (await readFile(id)).toString("base64");
        return `export default Uint8Array.from(atob(${JSON.stringify(data)}), c => c.charCodeAt(0));`;
      },
    },
    workersCapacitorPlugin({ worker: "../../workers/runtime/node-globals.ts" }),
  ],
  // These frameworks are loaded by separate Worker fixtures during a run.
  // Prebundle both before testing so dependency discovery cannot reload a page.
  optimizeDeps: { include: ["hono", "express"] },
  build: {
    outDir: fileURLToPath(
      new URL("../../../../artifacts/dedicated-worker", import.meta.url),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
