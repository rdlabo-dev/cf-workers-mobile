import { execFileSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const [app, framework, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  !["validation", "runtime", "native-documents", "native-network"].includes(
    app,
  ) ||
  (framework !== undefined &&
    (app !== "native-documents" || !["hono", "express"].includes(framework)))
) {
  throw new Error(
    "Usage: npm run test:native:prepare -- validation|runtime|native-documents|native-network [hono|express]",
  );
}

const demo = new URL("../../", import.meta.url);
execFileSync(
  "npm",
  [
    "run",
    `build:${app}`,
    ...(app === "native-documents"
      ? ["--", "--mode", framework ?? "hono"]
      : []),
  ],
  {
    cwd: fileURLToPath(demo),
    stdio: "inherit",
  },
);
const source = new URL(
  app === "runtime" ? "artifacts/dedicated-worker/" : `artifacts/${app}/`,
  demo,
);
const destination = new URL("dist/", demo);
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
if (app === "native-documents") {
  await cp(
    new URL("../native/documents/probe.js", import.meta.url),
    new URL("probe.js", destination),
  );
}
console.log(
  `Prepared ${app} in demo/dist. Run npm run sync, then npm run ios or android.`,
);
