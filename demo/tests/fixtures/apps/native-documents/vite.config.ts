import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/vite";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here("."),
  plugins: [workersCapacitorPlugin()],
  build: {
    outDir: here("../../../../artifacts/native-documents"),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: here("index.html"),
        runtime: here("runtime.html"),
        lifecycle: here("lifecycle.html"),
      },
    },
  },
});
