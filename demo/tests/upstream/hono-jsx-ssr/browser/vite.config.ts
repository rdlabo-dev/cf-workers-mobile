import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-native/tooling/vite";
import { workerEntry } from "../sample";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [
    workersCapacitorPlugin({ execution: "local", worker: workerEntry }),
  ],
  build: {
    outDir: fileURLToPath(
      new URL(
        "../../../../artifacts/upstream/hono-jsx-ssr/browser/",
        import.meta.url,
      ),
    ),
    emptyOutDir: true,
    target: "es2022",
  },
});
