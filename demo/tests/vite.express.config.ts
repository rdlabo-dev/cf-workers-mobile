import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-native/tooling/vite";
import demo from "../vite.config";

// Build the same demo with only its Worker selection changed.
export default defineConfig({
  ...demo,
  plugins: [
    workersCapacitorPlugin({
      execution: "local",
      worker: "./workers/express/standard.ts",
    }),
  ],
  build: {
    ...demo.build,
    outDir: fileURLToPath(
      new URL("../artifacts/demo-express", import.meta.url),
    ),
  },
});
