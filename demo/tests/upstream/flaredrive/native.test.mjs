import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  "FlareDrive listing and authenticated WebDAV round trip",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, "worker/index.js"),
      workerConfig: fileURLToPath(new URL("worker.jsonc", import.meta.url)),
      artifacts: join(root, "native"),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.equal(
          await (await backend.bucket.get("accepted.txt")).text(),
          "Capacitor WebDAV acceptance",
        );
        assert.equal(await backend.bucket.get("denied.txt"), null);
      },
    });
  },
);
