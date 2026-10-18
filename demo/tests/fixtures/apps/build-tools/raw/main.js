import { workersCapacitor } from "./lib/index.js";
import { fetchContract } from "./lib/testing/fetch.js";
const worker = {
  createWorker: () =>
    new Worker(new URL("./worker-entry.js", import.meta.url), {
      type: "module",
    }),
  loadDirect: async () => (await import("./worker.js")).default,
};
window.runBuildTool = async (prefer) => {
  const runtime = workersCapacitor({
    worker,
    baseURL: "https://worker.invalid/api",
    prefer,
  });
  try {
    await runtime.ready;
    const cases = [];
    for (const [name, check] of Object.entries(fetchContract.cases)) {
      await check(fetch);
      cases.push({ name, ok: true });
    }
    return { execution: runtime.execution, cases };
  } finally {
    runtime.dispose();
  }
};
