import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, app } from "./backend.mjs";
test(
  "upstream OpenNext Server Actions and Suspense in native WebView",
  { timeout: 600000 },
  async () => {
    await runNativeAcceptance({
      backend: await startBackend(),
      artifacts: fileURLToPath(
        new URL(
          "../../../artifacts/upstream/opennext/native/",
          import.meta.url,
        ),
      ),
      worker: join(app, ".open-next/worker.js"),
      workerConfig: join(app, "wrangler.jsonc"),
      render: "/server-actions",
      validate: async (backend, platform) => {
        assert.ok(backend.reports.some((r) => r.stage === "action"));
        assert.ok(backend.reports.some((r) => r.stage === "form"));
        assert.equal(
          backend.reports.find((r) => r.stage === "fallback")?.duringSSR,
          true,
          "Fallback must render before the SSR response ends",
        );
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").fallback,
          true,
        );
        assert.equal(
          backend.reports.find((r) => r.stage === "complete").platform,
          platform,
        );
        assert.ok(
          backend.requests.some((r) => r.method === "POST" && r.action),
        );
      },
    });
  },
);
