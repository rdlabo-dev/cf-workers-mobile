import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  "microfeed public article navigation in native WebView",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, "dist/server/entry.mjs"),
      workerConfig: join(root, "dist/server/wrangler.json"),
      remoteBindings: ["CF_VERSION_METADATA"],
      render: "/",
      artifacts: fileURLToPath(
        new URL(
          "../../../artifacts/upstream/microfeed/native/",
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
            (r) => r.path.startsWith("/i/") && r.status === 200,
          ),
        );
        assert.ok(
          backend.requests.some((r) => r.path === "/rss/" && r.status === 200),
        );
      },
    });
  },
);
