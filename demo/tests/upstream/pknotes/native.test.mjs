import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root } from "./backend.mjs";
test(
  "pknotes native registration diagnostic",
  { timeout: 600000 },
  async () => {
    const manualSubmission = process.env.PKNOTES_TRUSTED_TAP === "1";
    const backend = await startBackend({ manualSubmission });
    await runNativeAcceptance({
      backend,
      timeout: manualSubmission ? 180000 : 60000,
      worker: join(root, "dist/pknotes/index.js"),
      workerConfig: join(root, "dist/pknotes/wrangler.json"),
      artifacts: fileURLToPath(
        new URL("../../../artifacts/upstream/pknotes/native/", import.meta.url),
      ),
      validate: async (backend, platform) => {
        const result = backend.reports.find((r) => r.stage === "complete");
        assert.equal(result.platform, platform);
        assert.equal(result.trustedSubmission, manualSubmission);
        assert.equal(
          result.error,
          platform === "ios"
            ? "The passkey prompt was cancelled or timed out."
            : "Passkey creation failed: NotSupportedError: Error connecting to Web Authentication service.",
        );
        assert.ok(
          backend.requests.some(
            (r) => r.path.includes("register/options") && r.status === 200,
          ),
        );
        assert.equal(
          (await backend.db.prepare("SELECT count(*) AS n FROM users").first())
            .n,
          0,
        );
      },
    });
  },
);
