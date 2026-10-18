import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    capacitorWorkersPlugin({ worker: "../../workers/runtime/node-globals.ts" }),
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
