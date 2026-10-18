import {
  capacitorWorkers,
  type ExecutionPreference,
} from "@rdlabo/capacitor-workers";

// The configured worker is tests/fixtures/workers/compatibility/node-contracts.ts
// for this build; direct executes it in-page, worker executes it as a
// Dedicated Worker bundled by the same plugin.
async function run(prefer: ExecutionPreference) {
  const runtime = capacitorWorkers({
    baseURL: "https://node.invalid/",
    prefer,
  });
  let result;
  try {
    await runtime.ready;
    const payload = await (await fetch("/")).json();
    result = {
      execution: runtime.execution,
      contracts: payload.contracts,
      globals: payload.globals,
      webGlobals: payload.webGlobals,
    };
  } finally {
    runtime.dispose();
  }
  return {
    ...result,
    cleanup: !(["Buffer", "process", "global"] as const).some((name) =>
      Object.hasOwn(globalThis, name),
    ),
  };
}
declare global {
  interface Window {
    runNodeBuild: typeof run;
  }
}
window.runNodeBuild = run;
