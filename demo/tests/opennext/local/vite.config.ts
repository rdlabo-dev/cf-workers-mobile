import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const server = here("../../../opennext/.open-next/server-functions/default");
const files = await readdir(server, { recursive: true });
// Test-only public-page profile: no cloud bindings are available in this runtime.
export default defineConfig({
  root: here("."),
  publicDir: here("../../../opennext/.open-next/assets"),
  plugins: [
    {
      name: "local-native-driver",
      async generateBundle() {
        if (process.env.VITE_REPORT_ORIGIN)
          this.emitFile({
            type: "asset",
            fileName: "__local-acceptance.js",
            source:
              "const REPORT_ORIGIN = " +
              JSON.stringify(process.env.VITE_REPORT_ORIGIN) +
              ";\n" +
              (await readFile(here("driver.js"), "utf8")),
          });
      },
    },
    workersCapacitorPlugin({
      execution: "local",
      worker: here(
        process.env.VITE_REPORT_ORIGIN
          ? "worker.ts"
          : "../../../opennext/.open-next/worker.js",
      ),
      workerConfig: here("wrangler.json"),
      workerFiles: process.env.VITE_REPORT_ORIGIN
        ? files
            .filter(
              (path) =>
                path.endsWith("package.json") ||
                (path.startsWith(".next/") && path.endsWith(".json")),
            )
            .map((path) => join(server, path))
        : undefined,
    }),
  ],
  build: {
    outDir: here("../../../artifacts/opennext-local"),
    emptyOutDir: true,
    target: "es2022",
  },
});
