import { createRequire } from "node:module";
import { unstable_dev } from "wrangler";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nativeBackend } from "../../native/backend.mjs";
export const root = fileURLToPath(
  new URL("../../../artifacts/upstream/counterscale/clone/", import.meta.url),
);
export async function startBackend() {
  const analytics = process.env.COUNTERSCALE_LIVE_ANALYTICS === "1";
  const site = process.env.COUNTERSCALE_TEST_SITE;
  if (
    analytics &&
    (!process.env.COUNTERSCALE_ACCOUNT_ID ||
      !process.env.COUNTERSCALE_ANALYTICS_TOKEN ||
      !/^wc-acceptance-[a-z0-9-]+$/.test(site ?? ""))
  ) {
    throw new Error(
      "Live analytics requires COUNTERSCALE_ACCOUNT_ID, COUNTERSCALE_ANALYTICS_TOKEN and a unique COUNTERSCALE_TEST_SITE starting with wc-acceptance-",
    );
  }
  const require = createRequire(join(root, "packages/server/package.json"));
  const bcrypt = require("bcryptjs");
  const worker = await unstable_dev(
    join(root, "packages/server/workers/app.ts"),
    {
      config: join(root, "packages/server/wrangler.json"),
      local: true,
      persist: false,
      logLevel: "error",
      vars: {
        CF_AUTH_ENABLED: "true",
        CF_PASSWORD_HASH: bcrypt.hashSync("acceptance-password", 10),
        CF_JWT_SECRET: "local-test-secret",
        ...(analytics
          ? {
              CF_ACCOUNT_ID: process.env.COUNTERSCALE_ACCOUNT_ID,
              CF_BEARER_TOKEN: process.env.COUNTERSCALE_ANALYTICS_TOKEN,
            }
          : {}),
      },
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
        watch: false,
      },
    },
  );
  try {
    const backend = await nativeBackend({
      dispatch: (url, init) => worker.fetch(url, init),
      driver:
        `const acceptanceSite = ${JSON.stringify(analytics ? site : null)};\n` +
        (await readFile(new URL("driver.js", import.meta.url), "utf8")),
      dispose: () => worker.stop(),
    });
    return backend;
  } catch (error) {
    await worker.stop();
    throw error;
  }
}
