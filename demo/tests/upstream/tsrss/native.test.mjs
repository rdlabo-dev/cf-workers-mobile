import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runNativeAcceptance } from "../../native/acceptance.mjs";
import { startBackend, root, validate } from "./backend.mjs";
test(
  "TSRSS form login, article state and logout in native WebView",
  { timeout: 600000 },
  async () => {
    const backend = await startBackend();
    await runNativeAcceptance({
      backend,
      worker: join(root, "src/index.ts"),
      workerConfig: join(root, "wrangler.toml"),
      kvExecution: { SESSIONS: "remote" },
      artifacts: fileURLToPath(
        new URL("../../../artifacts/upstream/tsrss/native/", import.meta.url),
      ),
      validate,
    });
  },
);
