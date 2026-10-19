import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    workersCapacitorPlugin({
      worker: "./workers/hono.tsx",
      // Replace with './workers/express.ts' to use Workers Express.
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL("../dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
