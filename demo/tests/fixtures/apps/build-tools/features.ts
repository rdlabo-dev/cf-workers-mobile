import { FetchImplementation } from "@rdlabo/workers-capacitor/cloudflare/workers";
import { openFeature } from "@rdlabo/workers-capacitor/contracts";
import { runContract } from "../../../validation/contracts/http";

// Deliberately no root package import: exercise subpath-only dependency scanning.
async function run(prefer: "worker" | "direct") {
  const original = globalThis.fetch;
  const session = await openFeature(
    new FetchImplementation({ baseURL: "https://worker.invalid/api", prefer }),
  );
  try {
    return {
      cases: await runContract(session.api),
      unchanged: original === globalThis.fetch,
    };
  } finally {
    await session.dispose();
  }
}
declare global {
  interface Window {
    runConfiguredFeature: typeof run;
  }
}
window.runConfiguredFeature = run;
