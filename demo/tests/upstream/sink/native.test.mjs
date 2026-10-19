import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  "Sink login and link creation in native WebView",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, ".output/server/index.mjs"),
      workerConfig: join(root, "wrangler.jsonc"),
      kvExecution: { KV: "remote" },
      render: "/dashboard/login",
      artifacts: fileURLToPath(
        new URL("../../../artifacts/upstream/sink/native/", import.meta.url),
      ),
      validate: async (backend, platform) => {
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.ok(backend.reports.some((r) => r.stage === "login"));
        const row = await backend.db
          .prepare("SELECT url FROM links WHERE slug = ?")
          .bind("capacitor-acceptance")
          .first();
        assert.equal(row?.url, "https://example.com/capacitor-acceptance");
      },
    });
  },
);
