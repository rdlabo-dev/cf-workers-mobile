import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  `Counterscale ${process.env.COUNTERSCALE_LIVE_ANALYTICS === "1" ? "live analytics" : "authentication only"} in native WebView`,
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, "packages/server/workers/app.ts"),
      workerConfig: join(root, "packages/server/wrangler.json"),
      remoteBindings: ["WEB_COUNTER_AE"],
      render: "/",
      artifacts: fileURLToPath(
        new URL(
          "../../../artifacts/upstream/counterscale/native/",
          import.meta.url,
        ),
      ),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").scope,
          process.env.COUNTERSCALE_LIVE_ANALYTICS === "1"
            ? "live-analytics"
            : "authentication-only",
        );
      },
    });
  },
);
