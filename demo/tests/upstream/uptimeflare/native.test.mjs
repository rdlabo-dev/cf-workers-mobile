import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  "uptimeflare status and incident navigation in native WebView",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, ".vercel/output/static/_worker.js/index.js"),
      workerConfig: fileURLToPath(new URL("worker.jsonc", import.meta.url)),
      render: "/",
      artifacts: fileURLToPath(
        new URL(
          "../../../artifacts/upstream/uptimeflare/native/",
          import.meta.url,
        ),
      ),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.ok(
          backend.requests.some(
            (r) => r.path === "/incidents" && r.status === 200,
          ),
        );
      },
    });
  },
);
