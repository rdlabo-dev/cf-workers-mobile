import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-mobile/tooling/vite";
export default defineConfig(({ mode }) => {
  const framework = mode === "express" ? "express" : "hono";
  return {
    base: "./",
    // The configured Worker is loaded lazily; optimize its framework before tests.
    optimizeDeps: { include: [framework] },
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [
      workersCapacitorPlugin({
        execution: "local",
        worker: `../../workers/${framework}/standard.ts`,
      }),
    ],
    build: {
      outDir: fileURLToPath(
        new URL(
          `../../../../artifacts/build-tools/vite-${framework}`,
          import.meta.url,
        ),
      ),
      emptyOutDir: true,
      target: "es2022",
    },
  };
});
