import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  test: { include: ["tests/workers/tls.acceptance.ts"], hookTimeout: 60000 },
});
