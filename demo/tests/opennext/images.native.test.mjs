import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../native/acceptance.mjs";
import { startBackend } from "./backend.mjs";
import { startLiveBackend } from "./live/backend.mjs";
const root = fileURLToPath(new URL("../../opennext/", import.meta.url));
test(
  "Next Image optimization through native remote transport",
  { timeout: 600000 },
  async () => {
    const live = Boolean(process.env.NATIVE_TEST_ORIGIN);
    const backend = live
      ? await startLiveBackend()
      : await startBackend({
          native: true,
          driver: await readFile(
            new URL("images-driver.js", import.meta.url),
            "utf8",
          ),
        });
    await backend.configure?.();
    await runNativeAcceptance({
      backend,
      ...(live
        ? {
            bootstrapCode: `import { workersCapacitor } from "cf-workers-mobile/capacitor"; await workersCapacitor({ baseURL: "https://worker.invalid/", remote: { origin: ${JSON.stringify(backend.url.origin)}, getToken: () => ${JSON.stringify(process.env.NATIVE_TEST_DEVICE_TOKEN)} }, render: "/images" }).ready;`,
          }
        : {}),
      worker: join(root, ".open-next/worker.js"),
      workerConfig: join(root, "wrangler.jsonc"),
      render: "/images",
      artifacts: fileURLToPath(
        new URL("../../artifacts/images-native/", import.meta.url),
      ),
      validate: async (backend, platform) => {
        const result = backend.reports.find((r) => r.stage === "complete");
        assert.equal(result.platform, platform);
        assert.equal(result.format, "image/webp");
        assert.ok(result.width < 256);
      },
    });
  },
);
