import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [workersCapacitorPlugin()],
  build: {
    outDir: fileURLToPath(
      new URL("../../artifacts/validation", import.meta.url),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
